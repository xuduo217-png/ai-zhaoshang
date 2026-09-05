'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const net = require('net');
let XLSX, mammoth, pdfParse;
try { XLSX = require('xlsx'); } catch (_) {}
try { mammoth = require('mammoth'); } catch (_) {}
try { pdfParse = require('pdf-parse'); } catch (_) {}
const INDUSTRIES = ['电子信息','新能源','智能制造','装备制造','食品饮料','人工智能','集成电路','光伏','锂电','动力电池','生物医药','数字经济','新材料','汽车','航空航天','现代农业','文旅','节能环保'];
const REGIONS = ['成都','绵阳','德阳','宜宾','眉山','泸州','南充','攀枝花','四川','重庆','北京','上海','广州','深圳','杭州','苏州','南京','武汉','西安','合肥','济南','郑州','长三角','珠三角','京津冀'];
const CATEGORIES = ['全部','投资载体','招商项目','优惠政策'];
const REPORTS = {chain:'产业链资料梳理',plan:'企业招商对接方案',assessment:'投资研判核查清单',brief:'招商参阅材料'};
const strings = list => Array.isArray(list) ? [...new Set(list.filter(x => typeof x === 'string' && x.trim()).map(x => x.trim().slice(0,40)))].slice(0,12) : [];
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), {statusCode}); };
async function extractDocument(name, body) {
  const ext = path.extname(name).toLowerCase();
  const supported = ['.txt','.md','.csv','.xlsx','.xls','.docx','.pdf'];
  if (!supported.includes(ext)) fail('支持 TXT、Markdown、CSV、Excel、Word（DOCX）和 PDF 文件');
  if (['.txt','.md','.csv'].includes(ext) && typeof body.content === 'string') return body.content;
  const encoded = String(body.dataBase64 || '');
  if (!encoded || encoded.length > 1.4 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) fail('文件内容无效或超过 1 MB');
  const buffer = Buffer.from(encoded,'base64');
  if (!buffer.length || buffer.length > 1024 * 1024) fail('文件须为非空且不超过 1 MB');
  if (['.txt','.md','.csv'].includes(ext)) {
    try { return new TextDecoder('utf-8',{fatal:true}).decode(buffer); } catch (_) { fail('文本文件必须使用 UTF-8 编码'); }
  }
  if (ext === '.docx') {
    if (!mammoth) fail('Word 解析组件未安装',503);
    return (await mammoth.extractRawText({buffer})).value;
  }
  if (ext === '.pdf') {
    if (!pdfParse) fail('PDF 解析组件未安装',503);
    return (await pdfParse(buffer,{max:80})).text;
  }
  if (!XLSX) fail('Excel 解析组件未安装',503);
  const workbook = XLSX.read(buffer,{type:'buffer',cellDates:false,cellFormula:false,cellHTML:false});
  return workbook.SheetNames.map(sheet => '# '+sheet+'\n'+XLSX.utils.sheet_to_csv(workbook.Sheets[sheet],{blankrows:false})).join('\n\n');
}
function clientIp(req) {
  const peer = String(req.socket.remoteAddress || '').replace(/^::ffff:/,'');
  // Only the local reverse proxy may supply the client address. Never trust a public peer's forwarding headers.
  if (peer === '127.0.0.1' || peer === '::1') {
    const forwarded = req.headers['x-real-ip'];
    if (typeof forwarded === 'string' && net.isIP(forwarded.trim())) return forwarded.trim();
  }
  return peer || 'unknown';
}
function inferCategory(message, explicit, previous) {
  if (explicit && explicit !== '全部' && !CATEGORIES.includes(explicit)) fail('资源分类无效');
  const positive = message.replace(/(?:不要|排除|不看|不需要)[^，。；,;]+/g,'');
  if (/(?:只|仅)[^，。；]{0,12}(?:政策|奖补|补贴)/.test(positive)) return '优惠政策';
  if (/只.*(?:园区|载体)|仅.*(?:园区|载体)/.test(positive)) return '投资载体';
  if (explicit && explicit !== '全部') return explicit;
  if (/(?:查询|查找|了解)[^，。；]{0,20}(?:政策|奖补|补贴)/.test(positive)) return '优惠政策';
  return CATEGORIES.includes(explicit) ? explicit : CATEGORIES.includes(previous) ? previous : '全部';
}
function matchResources(projects, message, rawNeed = {}, previous = {}, category) {
  const currentIndustries = INDUSTRIES.filter(k => message.includes(k));
  const currentRegions = REGIONS.filter(k => message.includes(k));
  const context = {
    industries: currentIndustries.length ? currentIndustries : strings(rawNeed.industries).length ? strings(rawNeed.industries) : strings(previous.industries),
    regions: /不限地区|全国均可|全国范围/.test(message) ? [] : currentRegions.length ? currentRegions : strings(rawNeed.regions).length ? strings(rawNeed.regions) : strings(previous.regions),
    keywords: strings(rawNeed.keywords).filter(k => k.length >= 2 && !['招商','资源','项目','企业','产业','政策','投资','园区'].includes(k)),
    category: inferCategory(message,category,previous.category),
  };
  if (/不限行业|所有行业/.test(message)) context.industries = [];
  const published = projects.filter(p => p && p.published !== '否' && p.status !== '已满');
  let rows = published.filter(p => context.category === '全部' || p.category === context.category);
  if (context.regions.length) rows = rows.filter(p => context.regions.some(r => String(p.region || '').includes(r) || (p.region === '全省' && ['四川','成都','绵阳','德阳','宜宾','眉山','泸州','南充','攀枝花'].includes(r)) || (r === '四川' && ['成都','绵阳','德阳','宜宾','眉山','泸州','南充','攀枝花'].some(c => String(p.region).includes(c)))));
  if (context.industries.length) rows = rows.filter(p => context.industries.some(k => [p.industry,p.title,p.highlights,p.policy].join(' ').includes(k)) || /全部行业|全部制造业/.test(p.industry || ''));
  const ranked = rows.map(p => ({project:p,score:context.keywords.reduce((score,k) => score + Number([p.title,p.highlights,p.policy].join(' ').includes(k)),0)})).sort((a,b) => b.score-a.score);
  const constrained = context.industries.length || context.regions.length || context.category !== '全部';
  const selected = !constrained && context.keywords.length ? ranked.filter(p => p.score > 0) : ranked;
  const matched = selected.slice(0,4).map(p => p.project);
  const scope = [context.regions.join('/'),context.industries.join('/'),context.category === '全部' ? '' : context.category].filter(Boolean).join(' · ');
  return {need:{...context,summary:scope ? '当前筛选：'+scope : '未指定行业或地区，以下为已发布资源浏览推荐。'},matched,matchMode:constrained || context.keywords.length ? 'filtered' : 'browse'};
}
function createPortalService({dataDir,loadRes,send,readBody,allowed,companyFixtures = []}) {
  const directory = path.join(dataDir,'portal-private');
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const secretPath = path.join(directory,'.secret');
  if (!fs.existsSync(secretPath)) fs.writeFileSync(secretPath,crypto.randomBytes(32),{flag:'wx',mode:0o600});
  const secret = fs.readFileSync(secretPath);
  const sign = id => crypto.createHmac('sha256',secret).update(id).digest('hex');
  function save(id, data) {
    const body = JSON.stringify(data);
    if (Buffer.byteLength(body) > 3 * 1024 * 1024) fail('私有空间已满，请删除不需要的资料后重试',413);
    const target = path.join(directory,id+'.json');
    const temporary = target+'.tmp';
    fs.writeFileSync(temporary,body,{mode:0o600});
    fs.renameSync(temporary,target);
  }
  function load(id) { return JSON.parse(fs.readFileSync(path.join(directory,id+'.json'),'utf8')); }
  function session(req,res) {
    const value = String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('zs_portal='))?.slice(10) || '';
    const match = value.match(/^([a-f0-9]{32})\.([a-f0-9]{64})$/);
    if (match && crypto.timingSafeEqual(Buffer.from(sign(match[1])),Buffer.from(match[2])) && fs.existsSync(path.join(directory,match[1]+'.json'))) return match[1];
    if (!allowed(clientIp(req),'workspace-create',20,60*60*1000)) fail('创建空间过于频繁，请稍后重试',429);
    if (fs.readdirSync(directory).filter(f => f.endsWith('.json')).length >= 500) fail('访客空间容量已满，请联系管理员',503);
    const id = crypto.randomBytes(16).toString('hex');
    save(id,{conversations:[],documents:[],reports:[],createdAt:new Date().toISOString()});
    const secure = req.socket.encrypted || (['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && req.headers['x-forwarded-proto'] === 'https');
    res.setHeader('Set-Cookie','zs_portal='+id+'.'+sign(id)+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000'+(secure?'; Secure':''));
    return id;
  }
  function context(id, body) {
    const data = load(id);
    const conversation = body.conversationId ? data.conversations.find(c => c.id === body.conversationId) : null;
    if (body.conversationId && !conversation) fail('会话不存在或不属于当前访客',404);
    const ids = Array.isArray(body.documentIds) ? body.documentIds.slice(0,8) : [];
    const documents = ids.map(id => data.documents.find(d => d.id === id));
    if (documents.some(d => !d)) fail('所选资料不存在或不可访问',404);
    return {previous:conversation?.turns.at(-1)?.result?.need || {},conversation,documents};
  }
  function record(id, body, result) {
    const data = load(id);
    let conversation = data.conversations.find(c => c.id === body.conversationId);
    if (!conversation) { conversation = {id:crypto.randomUUID(),turns:[]}; data.conversations.unshift(conversation); }
    conversation.turns.push({message:String(body.message).slice(0,1000),result,createdAt:new Date().toISOString()});
    conversation.turns = conversation.turns.slice(-12);
    conversation.updatedAt = new Date().toISOString();
    data.conversations = [conversation,...data.conversations.filter(c => c.id !== conversation.id)].slice(0,20);
    save(id,data);
    return conversation.id;
  }
  function report(data, body) {
    if (!REPORTS[body.type]) fail('报告类型无效');
    const conversation = data.conversations.find(c => c.id === body.conversationId);
    if (!conversation?.turns.length) fail('请先完成一次需求匹配，再生成资料稿');
    const turn = conversation.turns.at(-1);
    const projects = turn.result.matched || [];
    const docs = (Array.isArray(body.documentIds) ? body.documentIds : []).map(id => data.documents.find(d => d.id === id));
    if (docs.some(d => !d)) fail('资料不可访问',404);
    const lines = ['# '+REPORTS[body.type]+'（资料整理版）','','生成时间：'+new Date().toISOString(),'说明：由规则模板整理，未调用大模型，不构成正式尽调结论。资源包含测试样本，未经主管部门确认。','','## 本次需求',turn.message,'',turn.result.need.summary,'','## 需求沿革',...conversation.turns.map((t,i)=>(i+1)+'. '+t.message),'','## 依据的招商资源'];
    if (!projects.length) lines.push('当前筛选未匹配资源，不能据此推断该地区没有相关产业。');
    projects.forEach((p,i) => lines.push('### '+(i+1)+'. '+p.title,'类型：'+(p.category||'未提供')+'；地区：'+(p.region||'未提供')+'；产业：'+(p.industry||'未提供'),'规模：'+(p.scale||'未提供'),'资源说明：'+(p.highlights||'未提供'),'政策原文摘录：'+(p.policy||'未提供'),''));
    if (body.type === 'chain') {
      lines.push('## 产业分布');
      const industries = [...new Set(projects.map(p => p.industry || '未分类'))];
      industries.forEach(industry => lines.push('- '+industry+'：'+projects.filter(p => p.industry === industry).map(p => p.title).join('、')));
      lines.push('## 上下游关系待核查','现有数据不包含真实供应链关系，不能将同园区或同产业企业推断为上下游。需补充供应商、客户、产品和产能证据。');
    } else if (body.type === 'plan') lines.push('## 对接步骤','1. 核实企业投资主体、产品、预算和意向地区。','2. 联系项目方确认厂房、土地、能耗、环保与产业准入条件。','3. 比较可匹配资源，记录补贴适用条件与兑现要求。','4. 提交对接意向，由招商专员跟进；未确认前不承诺政策。');
    else if (body.type === 'assessment') lines.push('## 必要核查项','- 主体资质、股权与司法风险：待核实。','- 市场需求、客户订单及竞争格局：待核实。','- 投资额、资金来源、现金流及回收期：待提供。','- 用地、能耗、环评及政策兑现条件：待主管部门确认。','## 当前结论','现有资料不足以给出投资可行性或收益判断，请在尽调后由专业人员作出决策。');
    else lines.push('## 汇报要点','- 已梳理需求与可匹配资源，详见上文。','- 请补充项目方联系人、更新时间与公开来源链接。','- 待核实材料不得作为确定事实对外发布。');
    lines.push('','## 用户提供的资料摘录');
    if (!docs.length) lines.push('未选择个人资料。');
    docs.forEach(d => lines.push('### '+d.name,'来源：当前访客上传，未独立核验。',d.content.slice(0,2000),d.content.length>2000?'（仅展示前 2000 字）':'',''));
    return {id:crypto.randomUUID(),type:body.type,title:REPORTS[body.type],content:lines.join('\n'),createdAt:new Date().toISOString()};
  }
  async function handle(req,res,p) {
    const known = ['/api/portal/workspace','/api/portal/documents','/api/portal/history','/api/portal/reports','/api/portal/reports/export','/api/portal/companies'];
    if (!known.includes(p)) return false;
    const method = req.method;
    if (p === '/api/portal/companies' && method === 'GET') {
      const q = (new URL(req.url,'http://localhost').searchParams.get('q') || '').trim().slice(0,80);
      const rows = companyFixtures.filter(c => !q || [c.name,c.industry,c.region].join(' ').includes(q));
      send(res,200,{mode:'public-test',notice:'历史公开测试样本，非实时工商查询。股东、司法风险等信息需接入正式授权接口。',data:rows}); return true;
    }
    if (!allowed(clientIp(req),'workspace',120,60000)) fail('操作过于频繁，请稍后重试',429);
    const id = session(req,res);
    if (p === '/api/portal/workspace' && method === 'GET') { send(res,200,load(id)); return true; }
    if (p === '/api/portal/reports/export' && method === 'GET') {
      const reportId = (new URL(req.url,'http://localhost').searchParams.get('id') || '').trim();
      const item = load(id).reports.find(report => report.id === reportId);
      if (!item) fail('报告不存在或不可访问',404);
      const filename = encodeURIComponent(item.title+'.txt');
      res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8','Content-Disposition':"attachment; filename*=UTF-8''"+filename,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
      res.end(item.content);
      return true;
    }
    if (p === '/api/portal/history' && method === 'DELETE') { const data=load(id);data.conversations=[];save(id,data);send(res,200,{ok:true});return true; }
    const body = await readBody(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail('请求内容必须是 JSON 对象');
    const data = load(id);
    if (p === '/api/portal/documents' && method === 'POST') {
      const name = String(body.name || '').trim().slice(0,100);
      let content;
      try { content = String(await extractDocument(name,body)).trim(); } catch (error) { if (error.statusCode) throw error; fail('文件无法解析，请确认文件未损坏'); }
      if (!content || content.includes('\0')) fail('文件中没有可读取的文本内容');
      const truncated = content.length > 60000;
      if (truncated) content = content.slice(0,60000);
      if (data.documents.length >= 8) fail('每个空间最多保存 8 份资料，请先删除旧资料');
      const doc = {id:crypto.randomUUID(),name,content,truncated,createdAt:new Date().toISOString()};
      data.documents.push(doc);save(id,data);send(res,201,doc);return true;
    }
    if (p === '/api/portal/documents' && method === 'DELETE') {
      const index=data.documents.findIndex(d=>d.id===body.id);if(index<0)fail('资料不存在',404);
      data.documents.splice(index,1);save(id,data);send(res,200,{ok:true});return true;
    }
    if (p === '/api/portal/reports' && method === 'POST') {
      const item=report(data,body);data.reports.unshift(item);data.reports=data.reports.slice(0,20);save(id,data);send(res,201,item);return true;
    }
    if (p === '/api/portal/reports' && method === 'DELETE') {data.reports=data.reports.filter(r=>r.id!==body.id);save(id,data);send(res,200,{ok:true});return true;}
    send(res,405,{error:'不支持该操作'});return true;
  }
  return {session,context,record,handle};
}
module.exports={clientIp,matchResources,createPortalService};
