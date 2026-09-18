const test = require('node:test');
const assert = require('node:assert/strict');
const { SCORE_STANDARD, assess, validateDetails } = require('../scoring-standard');
const score = (name, data, evidence='公开来源及人工核验理由') => assess(SCORE_STANDARD.find(d=>d.name===name),data,evidence);
test('客户分值合计100，各板块正确',()=>{
  assert.deepEqual(Object.fromEntries(SCORE_STANDARD.map(d=>[d.name,d.weight])),{融资需求:20,异地拓产:15,技术产品:15,市场情况:15,合规风险:15,财务能力:10,团队股权:10});
});
test('融资四档、未覆盖情形待核实',()=>{
  for(const n of [20,15,10,5]) assert.equal(score('融资需求',{financing:n}),n);
  assert.equal(score('融资需求',{financing:0}),null);
  assert.equal(score('融资需求',{}),null);
});
test('拓产和技术按事实计分，不把缺失当零分',()=>{
  assert.equal(score('异地拓产',{expansion:0}),0);
  assert.equal(score('异地拓产',{expansion:15}),15);
  assert.equal(score('技术产品',{production:5,patent:0,certificate:5}),10);
  assert.equal(score('技术产品',{production:5,certificate:5}),null);
});
test('合规每条扣3分，最低零分；必须有依据',()=>{
  for(const [n,result] of [[0,15],[1,12],[4,3],[5,0],[12,0]]) assert.equal(score('合规风险',{risks:n}),result);
  assert.equal(score('合规风险',{risks:0},''),null);
  assert.equal(score('合规风险',{risks:1.5}),null);
});
test('市场分项和综合项边界校验',()=>{
  assert.equal(score('市场情况',{customers:5,orders:4,industry:3}),12);
  assert.equal(score('财务能力',{finance:10}),10);
  assert.equal(score('团队股权',{team:0}),0);
  for(const bad of [{finance:11},{risks:-1},{production:3},{unknown:5},{team:'5'},[]]) assert.equal(validateDetails(bad),false);
  assert.equal(validateDetails({finance:null,risks:0}),true);
});
