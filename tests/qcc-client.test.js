const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createQccClient } = require('../qcc-client');
function fixture({ sse=false, error=false }={}) {
  const calls=[];
  const fetchImpl=async (url,options)=>{
    assert.match(url,/^https:\/\/agent.qcc.com\/mcp\/company\/stream$/);
    assert.equal(options.redirect,'error');
    const body=JSON.parse(options.body);calls.push(body);
    if(body.method==='notifications/initialized')return new Response(null,{status:202});
    const result=body.method==='initialize'?{protocolVersion:'2024-11-05'}:body.method==='tools/list'?{tools:[{name:'get_company_by_query',inputSchema:{properties:{searchKey:{type:'string'}},required:['searchKey']}}]}:{isError:error,content:[{type:'text',text:'<script>test</script> secret-test-token'}]};
    const json=JSON.stringify({jsonrpc:'2.0',id:body.id,result});
    return new Response(sse?'event: message\ndata: '+json+'\n\n':json,{headers:{'content-type':sse?'text/event-stream':'application/json','mcp-session-id':'test-session'}});
  };
  return {calls,client:createQccClient({token:'secret-test-token',fetchImpl})};
}
for(const sse of [false,true])test('MCP supports '+(sse?'SSE':'JSON')+' handshake, tools cache and traceable sanitized results',async()=>{
  const {client,calls}=fixture({sse});
  const r=await client.call('company','get_company_by_query',{searchKey:'测试公司'});
  assert.equal(r.mode,'live');assert.equal(r.source,'企查查');assert.equal(r.tool,'get_company_by_query');
  assert.ok(!JSON.stringify(r).includes('secret-test-token'));
  await client.tools('company');assert.equal(calls.filter(c=>c.method==='initialize').length,1);
  assert.deepEqual(calls.map(c=>c.method),['initialize','notifications/initialized','tools/list','tools/call']);
});
test('MCP rejects absent credentials, unknown services/tools and invalid arguments before billing calls',async()=>{
  const absent=createQccClient({token:'',fetchImpl:()=>{throw new Error('must not call');}});
  await assert.rejects(absent.tools('company'),/尚未配置/);
  const {client,calls}=fixture();
  await assert.rejects(client.tools('https://evil.invalid'),/不支持/);
  await assert.rejects(client.call('company','delete_all',{}),/未提供/);
  await assert.rejects(client.call('company','get_company_by_query',{}),/填写/);
  await assert.rejects(client.call('company','get_company_by_query',{searchKey:123}),/格式/);
  await assert.rejects(client.call('company','get_company_by_query',{searchKey:'x',url:'https://evil.invalid'}),/不支持/);
  assert.equal(calls.filter(c=>c.method==='tools/call').length,0);
});
test('MCP tool errors and upstream auth errors are not reported as successful data; calls are not retried',async()=>{
  const {client,calls}=fixture({error:true});
  await assert.rejects(client.call('company','get_company_by_query',{searchKey:'x'}),/查询未成功/);
  assert.equal(calls.filter(c=>c.method==='tools/call').length,1);
  const bad=createQccClient({token:'x',fetchImpl:async()=>new Response('private',{status:401})});
  await assert.rejects(bad.tools('company'),/认证失败/);
});
