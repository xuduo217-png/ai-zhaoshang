'use strict';
// Only explicitly named provider fields are facts. Tool names and missing values are not evidence.
const FIELDS = {
  '企业名称':'主体信息','统一社会信用代码':'主体信息','法定代表人':'主体信息','注册资本':'主体信息','成立日期':'主体信息','登记状态':'主体信息','所属行业':'主体信息','注册地址':'主体信息',
  '产品名称':'技术产品','专利名称':'技术产品','专利类型':'技术产品','申请号':'技术产品','证书名称':'技术产品','资质名称':'技术产品',
  '营业收入':'财务能力','净利润':'财务能力','资产总额':'财务能力','负债总额':'财务能力',
  '股东名称':'团队股权','持股比例':'团队股权','主要人员':'团队股权',
  '中标项目名称':'市场情况','中标金额':'市场情况',
  '处罚决定书文号':'合规风险','处罚内容':'合规风险','案号':'合规风险','案件名称':'合规风险',
  '融资轮次':'融资需求','融资金额':'融资需求','投资机构':'融资需求',
  '招聘岗位':'异地拓产','招聘地区':'异地拓产'
};
function publicEvidence(company, snapshots) {
  const facts=[];
  for (const snapshot of snapshots.filter(s=>s.companyId===company.id).slice(0,100)) {
    let count=0;
    function walk(value, location='', depth=0) {
      if (!value || typeof value!=='object' || depth>10 || count>=120) return;
      for (const [key, child] of Object.entries(value)) {
        const fieldPath=location?location+'.'+key:key;
        if (FIELDS[key] && ['string','number'].includes(typeof child) && String(child).trim() && !/^(暂无|未知|未披露|未公开|--|-|null)$/.test(String(child).trim())) {
          if (++count>120) break;
          facts.push({dimension:FIELDS[key],field:key,value:String(child).slice(0,1000),path:fieldPath,source:'企查查',tool:snapshot.tool,queriedAt:snapshot.queriedAt,snapshotId:snapshot.id});
        }
        if (child && typeof child==='object') walk(child,fieldPath,depth+1);
      }
    }
    for(const block of snapshot.result?.content||[]) {
      if(block.type==='text') {try{walk(JSON.parse(block.text));}catch(_){/* Unstructured output remains in the private original snapshot. */}}
    }
    if(snapshot.result?.structuredContent) walk(snapshot.result.structuredContent);
  }
  return facts;
}
function evidenceReport(companies,snapshots,messages) {
  const selected=companies.filter(c=>c.published==='是' && c.publicEvidenceApproved===true && c.name && messages.includes(c.name)).slice(0,3);
  const lines=['## 企业公开资料依据','仅关联需求中完整名称匹配且管理员已发布的企业；未发布档案不对访客开放。'];
  for(const c of selected) {
    lines.push('### '+c.name);
    const facts=publicEvidence(c,snapshots);
    if(!facts.length) lines.push('暂无可结构化的公开资料，不等同于无风险。');
    facts.slice(0,30).forEach(f=>lines.push('- ['+f.dimension+'] '+f.field+'：'+f.value+'（来源：企查查；查询时间：'+f.queriedAt+'；工具：'+f.tool+'；证据编号：'+f.snapshotId+'）'));
    if(facts.length>30) lines.push('本报告仅引用前 30 项公开字段，非全部查询结果。');
  }
  if(!selected.length) lines.push('未关联已发布企业；请在需求中填写已发布企业完整名称。');
  lines.push('未披露信息统一视为暂无公开资料；历史融资、招聘记录不证明当前融资或扩产需求。公开资料不等同于完整尽调，评分规则待确认，不据此自动生成分值。');
  return lines.join('\n');
}
module.exports={publicEvidence,evidenceReport};
