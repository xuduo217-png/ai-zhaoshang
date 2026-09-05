/* 服务端隔离的访客资料、历史、报告与客商意向。任何数据都不写入公共资源目录。 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let workspace={documents:[],reports:[],conversations:[]},active=null,ready=null,detail=null;
  const selected = new Set();
  async function api(path,method='GET',body) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
    try {
      const response=await fetch('api/portal/'+path,{method,credentials:'same-origin',headers:method==='GET'?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'操作失败，请稍后重试');return data;
    } catch(e) {throw new Error(e.name==='AbortError'?'操作超时，请重试':e.message);} finally {clearTimeout(timer);}
  }
  function showError(e) {$('featureError').textContent=e.message||String(e);$('featureError').hidden=false;}
  function modal(title,content) {
    window.PortalWorkspace?.closePanels();
    $('featureTitle').textContent=title;$('featureContent').innerHTML=content;$('featureError').hidden=true;
    if(!$('featureDialog').open)$('featureDialog').showModal();
  }
  const privacy='<p class="result-note">资料保存在当前浏览器的私有访客空间，不会进入公开项目库。清除 Cookie 或更换浏览器后无法找回；请自行导出备份，勿上传不必要的敏感信息。</p>';
  function selectedLabel() {
    const names=workspace.documents.filter(d=>selected.has(d.id)).map(d=>d.name);
    $('selectedDocuments').innerHTML='<p class="muted">已选资料 '+names.length+' 份</p>'+names.map(n=>'<p class="document-name">'+esc(n)+'</p>').join('')+'<button class="text-btn" data-extra="knowledge">管理 / 选择资料</button>';
  }
  async function init() {
    if(!ready)ready=api('workspace').then(data=>{workspace=data;selectedLabel();return data;}).catch(e=>{ready=null;throw e;});
    return ready;
  }
  function knowledge() {
    modal('个人知识库',privacy+'<button class="primary-btn" data-extra="upload">添加资料</button><p class="result-note">勾选后，资料摘录会用于下一次匹配及报告；AI 可用时会随需求发送至模型服务。</p><div class="document-list">'+(workspace.documents.length?workspace.documents.map(d=>'<article class="project-card"><label><input type="checkbox" data-document="'+d.id+'" '+(selected.has(d.id)?'checked':'')+'> '+esc(d.name)+'</label><p class="project-meta">'+d.content.length+' 字'+(d.truncated?' · 已截取前 6 万字':'')+' · '+esc(d.createdAt.slice(0,10))+'</p><div class="feature-actions"><button class="text-btn" data-read-document="'+d.id+'">查看内容</button><button class="text-btn" data-delete-document="'+d.id+'">删除</button></div></article>').join(''):'<p class="empty-state">暂无个人资料。</p>')+'</div>');
  }
  function upload() {
    modal('添加分析资料',privacy+'<form data-feature-form="upload"><label class="field-label">选择资料文件<input type="file" name="file" accept=".txt,.md,.csv,.xlsx,.xls,.docx,.pdf" required></label><p class="result-note">支持 TXT、Markdown、CSV、Excel、Word（DOCX）和含文本层的 PDF；单份不超过 1 MB，每个空间最多 8 份。扫描版 PDF 请先进行文字识别。</p><button class="primary-btn" type="submit">保存到私有知识库</button></form>');
  }
  function reports() {
    modal('我的资料报告','<p class="result-note">资料整理版不调用大模型，不替代专业尽调或投资判断。</p><div class="document-list">'+(workspace.reports.length?workspace.reports.map(r=>'<article class="project-card"><h3>'+esc(r.title)+'</h3><p class="project-meta">'+esc(r.createdAt.slice(0,19))+'</p><div class="feature-actions"><button class="text-btn" data-report="'+r.id+'">打开</button><button class="text-btn" data-export="'+r.id+'">导出文本</button><button class="text-btn" data-delete-report="'+r.id+'">删除</button></div></article>').join(''):'<p class="empty-state">完成资源匹配后，可使用右侧工具生成资料稿。</p>')+'</div>');
  }
  function openReport(r) {if(r)modal(r.title+'（资料版）','<pre class="report-content">'+esc(r.content)+'</pre><button class="primary-btn" data-export="'+r.id+'">导出文本</button>');}
  async function generate(type) {
    if(!active?.result?.conversationId){modal('请先匹配需求','<p>请先输入需求并完成一次资源匹配，然后生成相应资料稿。</p>');return;}
    modal('正在整理资料','<p role="status">正在根据本次匹配与所选资料生成有来源的整理稿…</p>');
    const r=await api('reports','POST',{type,conversationId:active.result.conversationId,documentIds:[...selected]});
    workspace.reports=[r,...workspace.reports].slice(0,20);openReport(r);
  }
  function exportReport(id) {
    const report=workspace.reports.find(r=>r.id===id);if(!report)return;
    const a=document.createElement('a');a.href='api/portal/reports/export?id='+encodeURIComponent(report.id);a.download=report.title+'.txt';document.body.appendChild(a);a.click();a.remove();
  }
  async function companies(query='') {
    const result=await api('companies?q='+encodeURIComponent(query));
    modal('企业资料查询（公开样本）','<p class="result-note">'+esc(result.notice)+'</p><form data-feature-form="companies" class="company-search"><label class="field-label">企业名称、地区或产业<input name="query" maxlength="80" value="'+esc(query)+'" placeholder="例如：长虹、成都、新能源"></label><button class="primary-btn">查询</button></form><div class="document-list">'+(result.data.length?result.data.map(c=>{
      let link='';try{const u=new URL(c.sourceUrl);if(['http:','https:'].includes(u.protocol))link='<a href="'+esc(u.href)+'" target="_blank" rel="noopener noreferrer">查看公开来源</a>';}catch(_){}
      return '<article class="project-card"><h3>'+esc(c.name)+'</h3><p>'+esc([c.region,c.industry].join(' · '))+'</p><p class="project-description">法定代表人：'+esc(c.legalPerson||'未提供')+'<br>成立日期：'+esc(c.foundedDate||'未提供')+'<br>注册资本（万元）：'+esc(c.registerCapital??'未提供')+'</p><p class="result-note">来源：'+esc(c.dataSource)+'；历史样本，未经实时更新。</p>'+link+'</article>';}).join(''):'<p class="empty-state">样本库无该企业；这不代表企业不存在，实时工商查询需配置授权接口。</p>')+'</div>');
  }
  function inquire(project=detail) {
    const matched=project?[project]:(active?.result?.matched||[]).filter(Boolean);
    modal('提交项目对接意向','<p>选中资源：'+esc(matched.map(p=>p.title).join('、')||'由专员协助匹配')+'</p><form data-feature-form="inquire"><label class="field-label">联系人<input name="name" maxlength="40" required autocomplete="name"></label><label class="field-label">联系电话<input name="phone" maxlength="20" required type="tel" autocomplete="tel"></label><label class="field-label">企业名称<input name="company" maxlength="80" autocomplete="organization"></label><label class="field-label">意向说明<textarea name="intention" maxlength="1000" required>'+esc(active?.message|| (project?'希望了解'+project.title:''))+'</textarea></label><label class="consent"><input type="checkbox" name="consent" required>同意将上述联系方式与需求提交给本平台招商专员，仅用于本次对接。</label><input class="honeypot" name="website" tabindex="-1" autocomplete="off" aria-hidden="true"><button class="primary-btn" type="submit">确认提交对接意向</button></form>');
    $('featureContent').querySelector('form').dataset.projects=JSON.stringify(matched.map(p=>p.title));
  }
  function analysis(item) {
    active=item;
    if(item){detail=null;const button=document.createElement('button');button.className='primary-btn';button.dataset.extra='inquire';button.textContent='提交对接意向';$('outputArea').appendChild(button);}
  }
  document.addEventListener('click',async event=>{
    const b=event.target.closest('button');if(!b||b.disabled)return;
    const action=b.dataset.extra;
    if(!action&&!b.dataset.report&&!b.dataset.export&&!b.dataset.readDocument&&!b.dataset.deleteDocument&&!b.dataset.deleteReport)return;
    try {
      if(action==='close')return $('featureDialog').close();
      b.disabled=true;await init();
      if(action==='knowledge')knowledge();else if(action==='upload')upload();else if(action==='companies')await companies();else if(action==='reports')reports();else if(action==='inquire')inquire();
      else if(['chain','plan','assessment','brief'].includes(action))await generate(action);
      else if(b.dataset.report)openReport(workspace.reports.find(r=>r.id===b.dataset.report));
      else if(b.dataset.export)exportReport(b.dataset.export);
      else if(b.dataset.readDocument){const d=workspace.documents.find(d=>d.id===b.dataset.readDocument);if(d)modal(d.name,'<pre class="report-content">'+esc(d.content)+'</pre><button class="primary-btn" data-extra="knowledge">返回知识库</button>');}
      else if(b.dataset.deleteDocument&&window.confirm('确定删除这份私有资料？此操作无法撤销。')){await api('documents','DELETE',{id:b.dataset.deleteDocument});workspace.documents=workspace.documents.filter(d=>d.id!==b.dataset.deleteDocument);selected.delete(b.dataset.deleteDocument);selectedLabel();knowledge();}
      else if(b.dataset.deleteReport&&window.confirm('确定删除这份报告？此操作无法撤销。')){await api('reports','DELETE',{id:b.dataset.deleteReport});workspace.reports=workspace.reports.filter(r=>r.id!==b.dataset.deleteReport);reports();}
    }catch(e){if(!$('featureDialog').open)modal('操作未完成','');showError(e);}finally{b.disabled=false;}
  });
  document.addEventListener('change',e=>{if(e.target.dataset.document){if(e.target.checked)selected.add(e.target.dataset.document);else selected.delete(e.target.dataset.document);selectedLabel();}});
  document.addEventListener('submit',async event=>{
    const form=event.target;if(!form.dataset.featureForm)return;event.preventDefault();
    const button=form.querySelector('button[type="submit"],button.primary-btn');if(button.disabled)return;button.disabled=true;$('featureError').hidden=true;
    try {
      const data=new FormData(form);
      if(form.dataset.featureForm==='upload'){
        const file=data.get('file');if(!file||!file.size||file.size>1024*1024)throw new Error('请选择不超过 1 MB 的资料文件');
        const bytes=new Uint8Array(await file.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
        const doc=await api('documents','POST',{name:file.name,dataBase64:btoa(binary)});workspace.documents.push(doc);selected.add(doc.id);selectedLabel();knowledge();
      }else if(form.dataset.featureForm==='companies')await companies(String(data.get('query')||''));
      else if(form.dataset.featureForm==='inquire'){
        const body=Object.fromEntries(data.entries());body.consent=data.get('consent')==='on';body.matchedProjects=JSON.parse(form.dataset.projects);body.source='前台工作台';
        const r=await api('inquire','POST',body);modal('对接意向已提交','<p>受理编号：'+esc(r.id)+'</p><p>已进入后台线索库，等待招商专员跟进。请勿重复提交。</p>');
      }
    }catch(e){showError(e);}finally{button.disabled=false;}
  });
  window.PortalExtras={init,analysis,selected:()=>[...selected],detail:p=>{detail=p;},inquire,clearHistory:async()=>{if(!window.confirm('清空已保存的全部会话？此操作无法撤销。'))return false;await api('history','DELETE',{});workspace.conversations=[];return true;}};
})();
