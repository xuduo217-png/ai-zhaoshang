const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {clientIp,matchResources,createPortalService}=require('../portal-service');
const rows=[
  {id:1,title:'成都新能源园区',region:'成都',industry:'新能源',category:'投资载体'},
  {id:2,title:'成都新能源项目',region:'成都',industry:'新能源',category:'招商项目'},
  {id:3,title:'制造业补贴',region:'全省',industry:'全部制造业',category:'优惠政策'},
  {id:4,title:'宜宾电池园区',region:'宜宾',industry:'新能源/动力电池',category:'投资载体'},
  {id:5,title:'未发布',region:'成都',industry:'新能源',category:'投资载体',published:'否'},
  {id:6,title:'已满',region:'成都',industry:'新能源',category:'投资载体',status:'已满'},
];
test('only the local proxy is trusted for client IP; clients cannot spoof it',()=>{
  assert.equal(clientIp({socket:{remoteAddress:'127.0.0.1'},headers:{'x-real-ip':'203.0.113.10'}}),'203.0.113.10');
  assert.equal(clientIp({socket:{remoteAddress:'::ffff:127.0.0.1'},headers:{'x-real-ip':'203.0.113.11'}}),'203.0.113.11');
  assert.equal(clientIp({socket:{remoteAddress:'203.0.113.20'},headers:{'x-real-ip':'1.1.1.1'}}),'203.0.113.20');
  assert.equal(clientIp({socket:{remoteAddress:'127.0.0.1'},headers:{'x-real-ip':'bad,ip'}}),'127.0.0.1');
});
test('general browse fallback contains real projects, not nulls',()=>{
  const result=matchResources(rows,'请推荐招商资源');assert.equal(result.matched.length,4);assert.ok(result.matched.every(p=>p&&p.title));assert.equal(result.matchMode,'browse');
});
test('category tools are strict and region/industry constraints apply',()=>{
  const result=matchResources(rows,'成都新能源',{}, {},'优惠政策');assert.equal(result.matched.length,1);assert.equal(result.matched[0].id,3);
  assert.deepEqual(matchResources(rows,'北京新能源',{}, {},'投资载体').matched,[]);
});
test('follow-up category inherits context; a new region replaces the previous one',()=>{
  const first=matchResources(rows,'成都新能源');
  const second=matchResources(rows,'只要优惠政策，不要园区',{},first.need);
  assert.deepEqual(second.need.regions,['成都']);assert.equal(second.need.category,'优惠政策');assert.ok(second.matched.every(p=>p.category==='优惠政策'));
  const third=matchResources(rows,'改到宜宾',{},first.need,'投资载体');assert.deepEqual(third.need.regions,['宜宾']);assert.deepEqual(third.matched.map(p=>p.id),[4]);
});
test('malformed model arrays do not crash matching',()=>{
  assert.doesNotThrow(()=>matchResources(rows,'成都',{industries:{},keywords:'bad',regions:[null,3,{}]}));
});
function fixture(t){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'portal-unit-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const service=createPortalService({dataDir:root,loadRes:()=>rows,send:(res,status,body)=>Object.assign(res,{status,body}),readBody:async req=>req.body||{},allowed:()=>true,companyFixtures:[{name:'公开企业样本',region:'成都'}]});
  const response=()=>({headers:{},setHeader(k,v){this.headers[k]=v;}});
  const request=(cookie='',method='GET',body={})=>({headers:{cookie},socket:{remoteAddress:'127.0.0.1'},method,body,url:'/api/portal/workspace'});
  return {service,request,response,root};
}
test('visitor sessions are persistent, signed and isolated',async t=>{
  const f=fixture(t),a=f.response(),b=f.response();const aid=f.service.session(f.request(),a),bid=f.service.session(f.request(),b);assert.notEqual(aid,bid);
  const ac=a.headers['Set-Cookie'].split(';')[0],bc=b.headers['Set-Cookie'].split(';')[0];
  assert.match(a.headers['Set-Cookie'],/HttpOnly; SameSite=Strict/);
  const docRes=f.response();await f.service.handle(f.request(ac,'POST',{name:'需求.txt',content:'成都新能源'}),docRes,'/api/portal/documents');assert.equal(docRes.status,201);
  const workspace=f.response();await f.service.handle(f.request(ac),workspace,'/api/portal/workspace');assert.equal(workspace.body.documents.length,1);
  const other=f.response();await f.service.handle(f.request(bc),other,'/api/portal/workspace');assert.equal(other.body.documents.length,0);
  assert.throws(()=>f.service.context(bid,{documentIds:[docRes.body.id]}),/不可访问/);
  const conv=f.service.record(aid,{message:'成都新能源'},matchResources(rows,'成都新能源'));
  assert.throws(()=>f.service.context(bid,{conversationId:conv}),/不属于/);
  assert.equal(f.service.context(aid,{conversationId:conv}).previous.regions[0],'成都');
  const cookieForged='zs_portal='+aid+'.'+'0'.repeat(64);assert.notEqual(f.service.session(f.request(cookieForged),f.response()),aid);
});
test('documents validate type/size and cannot delete another visitor document',async t=>{
  const f=fixture(t),r=f.response();f.service.session(f.request(),r);const cookie=r.headers['Set-Cookie'].split(';')[0];
  await assert.rejects(()=>f.service.handle(f.request(cookie,'POST',{name:'x.html',content:'<script>x</script>'}),f.response(),'/api/portal/documents'),/支持/);
  const large=f.response();await f.service.handle(f.request(cookie,'POST',{name:'x.txt',content:'x'.repeat(60001)}),large,'/api/portal/documents');assert.equal(large.body.truncated,true);assert.equal(large.body.content.length,60000);
  await assert.rejects(()=>f.service.handle(f.request(cookie,'DELETE',{id:'not-owned'}),f.response(),'/api/portal/documents'),/不存在/);
});
test('four report types use owned evidence, persist and expose limitations',async t=>{
  const f=fixture(t),r=f.response(),id=f.service.session(f.request(),r),cookie=r.headers['Set-Cookie'].split(';')[0];
  const conv=f.service.record(id,{message:'成都新能源'},matchResources(rows,'成都新能源'));
  for(const type of ['chain','plan','assessment','brief']){const result=f.response();await f.service.handle(f.request(cookie,'POST',{type,conversationId:conv}),result,'/api/portal/reports');assert.equal(result.status,201);assert.match(result.body.content,/资料整理版/);assert.match(result.body.content,/成都新能源园区/);}
  const saved=f.response();await f.service.handle(f.request(cookie),saved,'/api/portal/workspace');assert.equal(saved.body.reports.length,4);
});
