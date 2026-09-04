const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
test('portal HTTP integration uses isolated data, no live model and no production writes',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'zs-http-test-'));
  for(const file of ['server.js','portal-service.js'])fs.copyFileSync(path.join(__dirname,'..',file),path.join(dir,file));
  const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
  const child=spawn(process.execPath,['server.js'],{cwd:dir,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',NODE_ENV:'test',DEEPSEEK_API_KEY:'',INITIAL_ADMIN_PASSWORD:'TestOnly-Portal123!'},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(child.exitCode===null){const done=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');await done;}fs.rmSync(dir,{recursive:true,force:true});});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('startup timeout')),10000);child.once('error',reject);child.stdout.on('data',chunk=>{if(String(chunk).includes('已启动')){clearTimeout(timer);resolve();}});child.once('exit',code=>{clearTimeout(timer);reject(new Error('server exited '+code));});});
  const base='http://127.0.0.1:'+port;
  async function call(endpoint,{method='GET',body,cookie='',ip='203.0.113.1',origin,raw=false}={}){
    const response=await fetch(base+endpoint,{method,headers:{'Content-Type':'application/json','X-Real-IP':ip,...(cookie?{cookie}:{}),...(origin?{origin}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    if(raw)return {status:response.status,text:await response.text(),headers:Object.fromEntries(response.headers)};
    const json=await response.json();return {status:response.status,body:json,cookie:response.headers.get('set-cookie')?.split(';')[0]};
  }
  const a=await call('/api/portal/workspace'),b=await call('/api/portal/workspace');assert.ok(a.cookie&&b.cookie&&a.cookie!==b.cookie);
  let conv,document;
  await t.test('browse returns concrete resources and category filter is enforced',async()=>{
    const generic=await call('/api/portal/match',{method:'POST',cookie:a.cookie,body:{message:'请推荐招商资源'}});assert.equal(generic.status,200);assert.ok(generic.body.matched.length&&generic.body.matched.every(p=>p?.title));
    const filtered=await call('/api/portal/match',{method:'POST',cookie:a.cookie,body:{message:'成都智能制造',category:'优惠政策'}});assert.equal(filtered.status,200);assert.ok(filtered.body.matched.length);assert.ok(filtered.body.matched.every(p=>p.category==='优惠政策'));conv=filtered.body.conversationId;
    const follow=await call('/api/portal/match',{method:'POST',cookie:a.cookie,body:{message:'改到宜宾',conversationId:conv,category:'优惠政策'}});assert.equal(follow.status,200);assert.deepEqual(follow.body.need.industries,['智能制造']);assert.deepEqual(follow.body.need.regions,['宜宾']);
  });
  await t.test('private documents persist, affect selected context, and are isolated',async()=>{
    const upload=await call('/api/portal/documents',{method:'POST',cookie:a.cookie,body:{name:'测试资料.txt',content:'宜宾动力电池投资需求，仅供自动化测试。'}});assert.equal(upload.status,201);document=upload.body.id;
    const persisted=await call('/api/portal/workspace',{cookie:a.cookie});assert.equal(persisted.body.documents.length,1);
    const other=await call('/api/portal/workspace',{cookie:b.cookie});assert.equal(other.body.documents.length,0);
    const denied=await call('/api/portal/match',{method:'POST',cookie:b.cookie,body:{message:'查询',documentIds:[document]}});assert.equal(denied.status,404);
    const own=await call('/api/portal/match',{method:'POST',cookie:a.cookie,body:{message:'按资料匹配园区',category:'投资载体',documentIds:[document]}});assert.equal(own.status,200);assert.ok(own.body.need.industries.includes('动力电池'));assert.equal(own.body.documentSources[0],'测试资料.txt');
  });
  await t.test('reports persist and cannot access another visitor conversation',async()=>{
    const report=await call('/api/portal/reports',{method:'POST',cookie:a.cookie,body:{type:'plan',conversationId:conv,documentIds:[document]}});assert.equal(report.status,201);assert.match(report.body.content,/自动化测试/);
    const exported=await call('/api/portal/reports/export?id='+encodeURIComponent(report.body.id),{cookie:a.cookie,raw:true});assert.equal(exported.status,200);assert.match(exported.text,/企业招商对接方案/);assert.match(exported.headers['content-disposition'],/attachment/);
    const privateExport=await call('/api/portal/reports/export?id='+encodeURIComponent(report.body.id),{cookie:b.cookie,raw:true});assert.equal(privateExport.status,404);
    const denied=await call('/api/portal/reports',{method:'POST',cookie:b.cookie,body:{type:'plan',conversationId:conv}});assert.equal(denied.status,400);
    const restored=await call('/api/portal/workspace',{cookie:a.cookie});assert.ok(restored.body.conversations.some(c=>c.id===conv));assert.equal(restored.body.reports.length,1);
  });
  await t.test('inquiry reaches the administrator lead API and creates a notification',async()=>{
    const body={name:'自动化测试客商',phone:'19900000001',company:'测试公司（非真实客商）',intention:'回归验证',matchedProjects:['成都高新区智能制造产业园']};
    const without=await call('/api/portal/inquire',{method:'POST',body});assert.equal(without.status,400);
    const created=await call('/api/portal/inquire',{method:'POST',body:{...body,consent:true}});assert.equal(created.status,200);
    const login=await call('/api/login',{method:'POST',body:{username:'admin',password:'TestOnly-Portal123!'}});assert.equal(login.status,200);
    const leads=JSON.parse(fs.readFileSync(path.join(dir,'data','leads.json'),'utf8'));assert.ok(leads.some(l=>l.id===created.body.id&&l.name===body.name&&l.matchedProjects===body.matchedProjects[0]));
    const messages=JSON.parse(fs.readFileSync(path.join(dir,'data','messages.json'),'utf8'));assert.ok(messages.some(m=>m.title.includes(body.name)));
    const duplicate=await call('/api/portal/inquire',{method:'POST',body:{...body,consent:true}});assert.equal(duplicate.status,409);
  });
  await t.test('CSRF and malformed payloads are rejected; public enterprise endpoint is labeled',async()=>{
    const csrf=await call('/api/portal/documents',{method:'POST',cookie:a.cookie,origin:'https://attacker.invalid',body:{name:'x.txt',content:'x'}});assert.equal(csrf.status,403);
    const invalid=await call('/api/portal/match',{method:'POST',cookie:a.cookie,body:null});assert.equal(invalid.status,400);
    const companies=await call('/api/portal/companies?q='+encodeURIComponent('长虹'));assert.equal(companies.body.mode,'public-test');assert.equal(companies.body.data.length,1);
  });
  await t.test('portal security headers allow only same-origin scripts and connections',async()=>{
    fs.mkdirSync(path.join(dir,'public'),{recursive:true});fs.writeFileSync(path.join(dir,'public','portal.html'),'ok');
    const response=await fetch(base+'/portal.html');assert.equal(response.status,200);
    const csp=response.headers.get('content-security-policy');assert.match(csp,/script-src 'self'/);assert.match(csp,/connect-src 'self'/);assert.match(csp,/frame-ancestors 'none'/);
  });
  await t.test('different real visitor addresses do not share the match limit',async()=>{
    for(let i=0;i<12;i++){const r=await call('/api/portal/match',{method:'POST',cookie:a.cookie,ip:'203.0.113.40',body:{message:'资源'}});assert.equal(r.status,200);}
    const limited=await call('/api/portal/match',{method:'POST',cookie:a.cookie,ip:'203.0.113.40',body:{message:'资源'}});assert.equal(limited.status,429);
    const independent=await call('/api/portal/match',{method:'POST',cookie:b.cookie,ip:'203.0.113.41',body:{message:'资源'}});assert.equal(independent.status,200);
  });
});
