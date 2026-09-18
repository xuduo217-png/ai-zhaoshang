'use strict';
const RULE_VERSION = 'r3.0';
const yesNo = [[5, '有（已核实）'], [0, '无（已核实）']];
const field = (key, label, max, options) => ({ key, label, max, options });
const SCORE_STANDARD = [
  { name:'融资需求', scoreKey:'financingScore', evidenceKey:'financingEvidence', weight:20, criteria:'A/B轮且有行业知名机构投资20分；A/B轮无机构投资15分；种子/天使轮且有行业知名机构投资10分；种子/天使轮无机构投资5分。其他情形暂待核实。', fields:[field('financing','融资情况',20,[[20,'A/B轮，有行业知名机构投资'],[15,'A/B轮，无机构投资'],[10,'种子/天使轮，有行业知名机构投资'],[5,'种子/天使轮，无机构投资']])] },
  { name:'异地拓产', scoreKey:'expansionScore', evidenceKey:'expansionEvidence', weight:15, criteria:'有明确异地拓产需求15分；核实无需求0分。招聘信息本身不等于明确拓产需求。', fields:[field('expansion','明确异地拓产需求',15,[[15,'有明确需求'],[0,'已核实无需求']])] },
  { name:'技术产品', scoreKey:'technologyScore', evidenceKey:'technologyEvidence', weight:15, criteria:'核心产品量产5分；有发明专利且实际使用5分；有效资质证书5分。有则得分，无则不得分。', fields:[field('production','核心产品已量产',5,yesNo),field('patent','有发明专利且在使用',5,yesNo),field('certificate','有有效资质证书',5,yesNo)] },
  { name:'市场情况', scoreKey:'marketScore', evidenceKey:'marketEvidence', weight:15, criteria:'客户质量评估0–5分；订单情况评估0–5分；行业赛道发展空间分析0–5分。人工评估须注明理由。', fields:[field('customers','客户质量评估',5),field('orders','订单情况评估',5),field('industry','行业赛道发展空间分析',5)] },
  { name:'合规风险', scoreKey:'complianceScore', evidenceKey:'complianceEvidence', weight:15, criteria:'满分15分；工商、知识产权、劳务用工、过往处罚等每条核实风险扣3分，最低0分。同一风险去重；未查全不得按零风险计满分。', fields:[field('risks','已核实且去重的风险条数（须完成各类核查）',100000)] },
  { name:'财务能力', scoreKey:'financeScore', evidenceKey:'financeEvidence', weight:10, criteria:'营收是否逐年增长、现金流、资产负债情况综合人工评分0–10分，须写明各项评估依据。', fields:[field('finance','财务综合评分',10)] },
  { name:'团队股权', scoreKey:'teamEquityScore', evidenceKey:'teamEquityEvidence', weight:10, criteria:'股权架构清晰程度、核心人员资历综合人工评分0–10分，须写明两项评估依据。', fields:[field('team','团队股权综合评分',10)] },
];
function assess(dim, details, evidence) {
  const values = dim.fields.map(f => details?.[f.key]);
  const complete = values.every((v,i) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= dim.fields[i].max && (!dim.fields[i].options || dim.fields[i].options.some(o => o[0] === v))) && (dim.name !== '合规风险' || Number.isInteger(values[0])) && Boolean(String(evidence || '').trim());
  if (!complete) return null;
  return dim.name === '合规风险' ? Math.max(0,15-values[0]*3) : Math.round(values.reduce((a,b)=>a+b,0)*10)/10;
}
function validateDetails(details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return false;
  const fields = SCORE_STANDARD.flatMap(d=>d.fields);
  return Object.entries(details).every(([k,v])=>{
    const f = fields.find(f=>f.key===k);
    return f && (v === null || (typeof v === 'number' && Number.isFinite(v) && v>=0 && v<=f.max && (k!=='risks'||Number.isInteger(v)) && (!f.options||f.options.some(o=>o[0]===v))));
  });
}
module.exports={ RULE_VERSION, SCORE_STANDARD, assess, validateDetails };
