/* Lightweight controller regression tests; no browser, dependencies or live API calls. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(root, 'portal.html'), 'utf8');
const code = fs.readFileSync(path.join(root, 'portal-workspace.js'), 'utf8');
const projects = [{id:1,title:'成都新能源产业园',category:'投资载体',region:'成都',industry:'新能源',status:'招商中'}];
function element() {
  const classes = new Set();
  return { value:'',textContent:'',innerHTML:'',hidden:false,disabled:false,dataset:{},attributes:{},events:{},scrollTop:0,
    classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(x,on){if(on)classes.add(x);else classes.delete(x);}},
    setAttribute(key,value){this.attributes[key]=value;},removeAttribute(key){delete this.attributes[key];},
    addEventListener(name,fn){this.events[name]=fn;},focus(){this.focused=true;},showModal(){this.open=true;},close(){this.open=false;}
  };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
async function setup(matchResponse = {ok:true,json:async()=>({need:{summary:'新能源资源匹配'},matched:projects})}, loadResponse) {
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>[m[1],element()]));
  const calls = [], timers = new Set();
  const document = {getElementById(id){assert.ok(elements.has(id),'HTML must contain '+id);return elements.get(id);},querySelectorAll(){return [];},querySelector(){return null;},addEventListener(){}};
  const context = {document,window:{addEventListener(){}},AbortController,console,
    setTimeout(fn,ms){const t=setTimeout(fn,ms);t.unref();timers.add(t);return t;},clearTimeout(t){clearTimeout(t);timers.delete(t);},
    fetch:async(url,options)=>{calls.push({url,options});if(url.endsWith('/projects'))return loadResponse||{ok:true,json:async()=>({data:projects})};return typeof matchResponse==='function'?matchResponse(options):matchResponse;}
  };
  vm.createContext(context);
  const instrumented = code.replace(/\}\)\(\);\s*$/, 'globalThis.testPortal={state,setPrompt,showView,renderProjects,renderAnalysis,doMatch,newChat,showDetail,loadProjects};})();');
  vm.runInContext(instrumented,context);
  await flush();
  return {api:context.testPortal,el:id=>elements.get(id),calls,close:()=>{for(const t of timers)clearTimeout(t);}};
}
test('HTML references exist, assets are local, and event handlers are external',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size);
  for(const m of code.matchAll(/\$\('([^']+)'\)/g))assert.ok(ids.includes(m[1]),m[1]);
  assert.ok(!/\bonclick=/.test(html));
  for(const file of ['portal-workspace.css','portal-workspace.js'])assert.ok(html.includes(file)&&fs.existsSync(path.join(root,file)));
  const css=fs.readFileSync(path.join(root,'portal-workspace.css'),'utf8');
  assert.match(css,/Kaiti SC/);assert.match(css,/@media\(max-width:700px\)/);assert.match(css,/prefers-reduced-motion/);
});
test('published resources load; category and text filtering work',async()=>{
  const h=await setup();
  assert.equal(h.el('sourceCount').textContent,'1 条已发布资源');
  h.api.showView('全部');assert.match(h.el('projectGrid').innerHTML,/成都新能源产业园/);
  h.api.showView('优惠政策');assert.match(h.el('projectGrid').innerHTML,/暂无符合条件/);
  h.api.showView('全部');h.el('resourceSearch').value='不存在';h.api.renderProjects();assert.match(h.el('projectGrid').innerHTML,/暂无符合条件/);h.close();
});
test('suggestion fills the composer without consuming an API request',async()=>{
  const h=await setup();h.api.setPrompt('新能源项目');assert.equal(h.el('needInput').value,'新能源项目');assert.equal(h.calls.length,1);assert.equal(h.el('characterCount').textContent,'5 / 1000');h.close();
});
test('empty and oversized input do not call matching',async()=>{
  const h=await setup();await h.api.doMatch();h.el('needInput').value='字'.repeat(1001);await h.api.doMatch();assert.equal(h.calls.length,1);h.close();
});
test('matching sends the existing API contract and renders results/history',async()=>{
  const h=await setup();h.el('needInput').value='成都新能源项目';await h.api.doMatch();
  assert.equal(h.calls[1].url,'api/portal/match');assert.deepEqual(JSON.parse(h.calls[1].options.body),{message:'成都新能源项目'});
  assert.match(h.el('analysisView').innerHTML,/成都新能源产业园/);assert.match(h.el('outputArea').innerHTML,/1<\/b>/);
  assert.equal(h.api.state.history.length,1);assert.equal(h.el('needInput').value,'');assert.equal(h.el('matchBtn').disabled,false);h.close();
});
test('null project fallback and empty results do not crash or invent resources',async()=>{
  const h=await setup({ok:true,json:async()=>({need:{},matched:[null,null]})});h.el('needInput').value='其他需求';await h.api.doMatch();assert.match(h.el('analysisView').innerHTML,/暂无匹配资源/);assert.match(h.el('outputArea').innerHTML,/0<\/b>/);h.close();
});
test('API errors are visible, input is retained, and no history is recorded',async()=>{
  const h=await setup({ok:false,json:async()=>({error:'请求过于频繁，请稍后再试'})});h.el('needInput').value='测试需求';await h.api.doMatch();assert.equal(h.el('requestError').hidden,false);assert.match(h.el('requestError').textContent,/频繁/);assert.equal(h.el('needInput').value,'测试需求');assert.equal(h.api.state.history.length,0);assert.equal(h.el('matchBtn').disabled,false);h.close();
});
test('invalid JSON and resource failures render recoverable error states',async()=>{
  const h=await setup({ok:true,json:async()=>{throw new SyntaxError('bad json');}},{ok:false,json:async()=>({error:'unavailable'})});
  h.api.showView('全部');assert.match(h.el('projectGrid').innerHTML,/重新加载/);
  h.el('needInput').value='测试';await h.api.doMatch();assert.equal(h.el('requestError').hidden,false);assert.equal(h.el('matchBtn').disabled,false);h.close();
});
test('malicious user and API text is escaped in cards, summaries and history',async()=>{
  const hostile='<img src=x onerror=alert(1)>';
  const h=await setup({ok:true,json:async()=>({need:{summary:hostile,industries:[hostile]},matched:[{...projects[0],title:hostile,highlights:hostile}]})});
  h.el('needInput').value=hostile;await h.api.doMatch();
  for(const id of ['analysisView','outputArea','historyList']){assert.ok(!h.el(id).innerHTML.includes('<img'));assert.match(h.el(id).innerHTML,/&lt;img/);}h.close();
});
test('resource details keep stable references after resource reload',async()=>{
  const h=await setup();h.api.showView('全部');const key=Number(h.el('projectGrid').innerHTML.match(/data-project="(\d+)"/)[1]);
  h.api.state.projects=[];h.api.showDetail(key);assert.equal(h.el('detailTitle').textContent,projects[0].title);assert.equal(h.el('projectDialog').open,true);h.close();
});
test('new analysis aborts an in-flight request and ignores its late result',async()=>{
  let resolve;
  const h=await setup(()=>new Promise(r=>{resolve=r;}));h.el('needInput').value='新能源';const pending=h.api.doMatch();await flush();
  h.api.newChat();assert.equal(h.calls[1].options.signal.aborted,true);
  resolve({ok:true,json:async()=>({need:{},matched:projects})});await pending;
  assert.equal(h.api.state.history.length,0);assert.equal(h.el('welcome').hidden,false);assert.equal(h.el('matchBtn').disabled,false);h.close();
});
test('Chinese IME Enter is preserved and Shift+Enter does not submit',async()=>{
  const h=await setup();h.el('needInput').value='新能源';const keydown=h.el('needInput').events.keydown;
  const event={key:'Enter',isComposing:true,preventDefault(){throw new Error('IME must not be intercepted');}};keydown(event);
  keydown({...event,isComposing:false,shiftKey:true});assert.equal(h.calls.length,1);h.close();
});
