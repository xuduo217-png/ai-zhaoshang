/* AI招商智能体平台 · 管理端后端
 * 零依赖 Node（内置 http/fs/path/crypto/https），JSON 文件持久化
 * 通用资源 CRUD + 登录鉴权 + 统计聚合 + 引擎计算 + 审计日志 + 外部API适配器 + 静态托管
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
const https = require('https');

/* Excel 解析库（npm install xlsx 后可用；缺失时导入接口会提示） */
let XLSX = null;
try { XLSX = require('xlsx'); } catch (e) { XLSX = null; }

const PORT = process.env.PORT || 8765;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
fs.mkdirSync(PUBLIC, { recursive: true });
fs.mkdirSync(DATA, { recursive: true });

/* ---------- 工具 ---------- */
function now() { return new Date().toISOString().slice(0, 16).replace('T', ' '); }
function nowHMS() { return new Date().toISOString().slice(11, 19); }
function fileOf(name) { return path.join(DATA, name + '.json'); }
function loadRes(name) {
  const f = fileOf(name);
  if (!fs.existsSync(f)) { const seed = (RESOURCES[name] && RESOURCES[name].seed) || []; fs.writeFileSync(f, JSON.stringify(seed, null, 2)); return seed.slice(); }
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return []; }
}
function saveRes(name, data) { fs.writeFileSync(fileOf(name), JSON.stringify(data, null, 2)); }
function nextId(arr) { return arr.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1; }

/* ---------- 资源元数据 + 种子数据 ---------- */
const RESOURCES = {
  users: {
    label: '管理员账户',
    columns: [
      { key: 'username', label: '账户', type: 'text', required: true },
      { key: 'name', label: '姓名', type: 'text', required: true },
      { key: 'role', label: '角色', type: 'select', options: ['超级管理员', '招商专员', '招商主管', '只读用户'] },
      { key: 'dept', label: '部门', type: 'text' },
      { key: 'status', label: '状态', type: 'select', options: ['启用', '停用'] },
    ],
    seed: [
      { id: 1, username: 'admin', name: '系统管理员', role: '超级管理员', dept: '信息技术部', lastLogin: '2026-08-08 15:42', status: '启用', password: '123456' },
      { id: 2, username: 'zhaoshang1', name: '招商专员', role: '招商专员', dept: '招商一部', lastLogin: '2026-08-08 14:20', status: '启用', password: '123456' },
      { id: 3, username: 'zhaoshang2', name: '招商主管', role: '招商主管', dept: '招商二部', lastLogin: '2026-08-08 10:15', status: '启用', password: '123456' },
      { id: 4, username: 'viewer', name: '领导查看', role: '只读用户', dept: '领导层', lastLogin: '2026-08-07 16:30', status: '停用', password: '123456' },
    ],
  },
  apiSources: {
    label: '企业API对接',
    columns: [
      { key: 'name', label: 'API名称', type: 'text', required: true },
      { key: 'status', label: '状态', type: 'select', options: ['已连接', '额度预警', '已断开'] },
      { key: 'todayCalls', label: '今日调用', type: 'number' },
      { key: 'remain', label: '剩余额度', type: 'number' },
      { key: 'content', label: '获取内容', type: 'text' },
      { key: 'usage', label: '额度使用%', type: 'number' },
    ],
    seed: [
      { id: 1, name: '天眼查 API', status: '已连接', todayCalls: 1286, remain: 8720, content: '工商、股东、对外投资、风险信息', usage: 62 },
      { id: 2, name: '企查查 API', status: '已连接', todayCalls: 892, remain: 15360, content: '企业关系图谱、司法风险', usage: 38 },
      { id: 3, name: '爱企查 API', status: '额度预警', todayCalls: 568, remain: 1236, content: '企业基础信息补充', usage: 92 },
    ],
  },
  dsTasks: {
    label: 'DeepSeek资讯获取',
    columns: [
      { key: 'type', label: '数据类型', type: 'text', required: true },
      { key: 'channel', label: '获取渠道', type: 'text' },
      { key: 'today', label: '今日获取', type: 'number' },
      { key: 'freq', label: '更新频率', type: 'text' },
      { key: 'summary', label: 'AI摘要', type: 'text' },
      { key: 'token', label: 'Token消耗', type: 'text' },
      { key: 'status', label: '状态', type: 'select', options: ['完成', '处理中', '待执行'] },
    ],
    seed: [
      { id: 1, type: '新闻资讯', channel: '财联社/36Kr/投资界/百度', today: 286, freq: '每日', summary: '已生成', token: '0.42M', status: '完成' },
      { id: 2, type: '投融资数据', channel: '投资界/IT桔子', today: 42, freq: '每日', summary: '已生成', token: '0.12M', status: '完成' },
      { id: 3, type: '招投标数据', channel: '各省公共资源交易中心', today: 168, freq: '每日', summary: '已生成', token: '0.26M', status: '完成' },
      { id: 4, type: '政策文件', channel: '国家/省/市/区政府网', today: 12, freq: '每日', summary: '已生成', token: '0.06M', status: '完成' },
      { id: 5, type: '招商动态', channel: '招商引资/外资政策', today: 8, freq: '每日', summary: '生成中', token: '-', status: '处理中' },
      { id: 6, type: '企业官网动态', channel: '重点企业官网', today: 0, freq: '每周', summary: '-', token: '-', status: '待执行' },
    ],
  },
  excelUploads: {
    label: 'Excel上传记录',
    columns: [
      { key: 'filename', label: '文件名', type: 'text', required: true },
      { key: 'type', label: '类型', type: 'select', options: ['企业信息', '招商案例', '内部数据'] },
      { key: 'uploader', label: '上传人', type: 'text' },
      { key: 'total', label: '总行数', type: 'number' },
      { key: 'success', label: '成功', type: 'number' },
      { key: 'fail', label: '失败', type: 'number' },
      { key: 'time', label: '上传时间', type: 'text' },
      { key: 'status', label: '状态', type: 'select', options: ['成功', '失败'] },
    ],
    seed: [
      { id: 1, filename: '2026年8月新增企业.xlsx', type: '企业信息', uploader: '招商专员', total: 236, success: 232, fail: 4, time: '2026-08-07 14:20', status: '成功' },
      { id: 2, filename: '上半年招商案例汇总.xlsx', type: '招商案例', uploader: '招商主管', total: 86, success: 86, fail: 0, time: '2026-08-05 10:30', status: '成功' },
      { id: 3, filename: '存量企业台账.xlsx', type: '内部数据', uploader: '系统管理员', total: 1280, success: 1268, fail: 12, time: '2026-08-03 09:15', status: '成功' },
    ],
  },
  bidKeywords: {
    label: '招投标关键词订阅',
    columns: [
      { key: 'keyword', label: '关键词', type: 'text', required: true },
      { key: 'rule', label: '匹配规则', type: 'select', options: ['模糊匹配', '精确匹配'] },
      { key: 'region', label: '订阅地区', type: 'text' },
      { key: 'matched30', label: '近30天匹配', type: 'number' },
      { key: 'status', label: '状态', type: 'select', options: ['启用', '暂停'] },
    ],
    seed: [
      { id: 1, keyword: '智慧城市', rule: '模糊匹配', region: '全川', matched30: 23, status: '启用' },
      { id: 2, keyword: '新能源电池', rule: '模糊匹配', region: '成都/宜宾', matched30: 15, status: '启用' },
      { id: 3, keyword: '智能制造', rule: '模糊匹配', region: '全川', matched30: 31, status: '启用' },
      { id: 4, keyword: '钒钛', rule: '精确匹配', region: '攀枝花', matched30: 8, status: '启用' },
      { id: 5, keyword: '数据中心', rule: '模糊匹配', region: '成都', matched30: 12, status: '暂停' },
    ],
  },
  pushRules: {
    label: '推送触发规则',
    columns: [
      { key: 'event', label: '事件类型', type: 'text', required: true },
      { key: 'condition', label: '触发条件', type: 'text' },
      { key: 'content', label: '推送内容', type: 'text' },
      { key: 'target', label: '推送对象', type: 'text' },
      { key: 'method', label: '推送方式', type: 'text' },
      { key: 'status', label: '状态', type: 'select', options: ['启用', '暂停'] },
    ],
    seed: [
      { id: 1, event: '企业评分更新', condition: '评分变化≥3分 或 等级变化', content: '企业名+新评分+变化原因', target: '关注该企业的用户', method: '站内+弹窗', status: '启用' },
      { id: 2, event: '新招投标匹配', condition: '匹配已订阅关键词', content: '项目名+金额+截止日期', target: '订阅该关键词的用户', method: '站内+弹窗', status: '启用' },
      { id: 3, event: '企业动态更新', condition: '融资/招投标/招聘/专利/新闻', content: '动态类型+标题+摘要', target: '关注该企业的用户', method: '站内', status: '启用' },
      { id: 4, event: 'AI推荐线索', condition: '每日凌晨AI跑推荐算法', content: '推荐企业+匹配原因+评分', target: '全体招商人员', method: '站内', status: '启用' },
      { id: 5, event: '跟进到期提醒', condition: '下次跟进日期≤今天', content: '企业名+待办事项+逾期天数', target: '负责人', method: '站内+弹窗', status: '启用' },
      { id: 6, event: '风险信号触发', condition: '企业出现司法/经营异常', content: '企业名+风险类型+风险描述', target: '关注该企业的用户+管理员', method: '站内+弹窗+短信', status: '启用' },
    ],
  },
  workStages: {
    label: '招商跟进阶段',
    columns: [
      { key: 'name', label: '阶段名称', type: 'text', required: true },
      { key: 'order', label: '阶段顺序', type: 'number' },
      { key: 'cycle', label: '建议周期', type: 'text' },
      { key: 'action', label: '自动动作', type: 'text' },
      { key: 'status', label: '状态', type: 'select', options: ['启用', '暂停'] },
    ],
    seed: [
      { id: 1, name: '初次接触', order: 1, cycle: '7天', action: '发送企业资料模板', status: '启用' },
      { id: 2, name: '方案沟通', order: 2, cycle: '14天', action: '生成招商建议报告', status: '启用' },
      { id: 3, name: '深入对接', order: 3, cycle: '21天', action: '升级为主要领导对接', status: '启用' },
      { id: 4, name: '协议谈判', order: 4, cycle: '30天', action: '法务介入审核协议', status: '启用' },
      { id: 5, name: '落地签约', order: 5, cycle: '—', action: '归档+转运营', status: '启用' },
    ],
  },
  /* 知识库与审核共用同一资源 */
  knowledge: {
    label: '知识条目',
    columns: [
      { key: 'title', label: '标题', type: 'text', required: true },
      { key: 'source', label: '来源', type: 'select', options: ['DeepSeek摘要', 'Excel上传', '人工录入'] },
      { key: 'type', label: '类型', type: 'select', options: ['企业', '产业', '案例', '政策'] },
      { key: 'content', label: '内容/摘要', type: 'textarea' },
      { key: 'status', label: '状态', type: 'select', options: ['待审核', '已通过', '已退回'] },
      { key: 'reviewer', label: '审核人', type: 'text' },
      { key: 'time', label: '时间', type: 'text' },
    ],
    seed: [
      { id: 1, title: '四川长虹电子控股集团 - 新能源融资动态', source: 'DeepSeek摘要', type: '企业', content: 'AI摘要：长虹新能源板块完成10亿元战略融资，国家制造业基金领投，用于钠离子电池产线扩建。标签：融资/扩产/新能源。', status: '待审核', reviewer: '', time: '2026-08-08 15:30' },
      { id: 2, title: '四川省制造业高质量发展专项资金管理办法', source: 'DeepSeek摘要', type: '政策', content: 'AI摘要：电子信息、新能源等战略性新兴产业可申请专项资金，最高奖补5000万元。申报截止2026-09-30。标签：制造业/奖补/省级。', status: '待审核', reviewer: '', time: '2026-08-08 14:10' },
      { id: 3, title: '钠离子电池产业链图谱更新', source: 'DeepSeek摘要', type: '产业', content: 'AI摘要：钠离子电池产业链含上游材料（正极/负极/电解液）、中游电芯制造、下游储能/动力应用。本地薄弱环节：正极材料。标签：新能源/产业链/储能。', status: '待审核', reviewer: '', time: '2026-08-08 13:20' },
      { id: 4, title: '2026年8月新增企业 - 232条', source: 'Excel上传', type: '企业', content: '批量上传企业基础信息，含企业名称、统一信用代码、行业、注册资本等字段。字段校验通过率 98.3%。', status: '待审核', reviewer: '', time: '2026-08-07 14:20' },
      { id: 5, title: '上半年招商案例汇总 - 86条', source: 'Excel上传', type: '案例', content: '含成功案例 62 个（落地企业 48 家）、失败案例 24 个。失败原因 TOP3：政策不匹配、用地无法满足、产业链不完整。', status: '已通过', reviewer: '系统管理员', time: '2026-08-05 10:30' },
    ],
  },
  settings: {
    label: '系统设置',
    isSingle: true,
    columns: [
      { key: 'platformName', label: '平台名称', type: 'text' },
      { key: 'domain', label: '平台域名', type: 'text' },
      { key: 'deepseekKey', label: 'DeepSeek Key', type: 'text' },
      { key: 'tianyanchaKey', label: '天眼查 Key', type: 'text' },
      { key: 'qccKey', label: '企查查 Key', type: 'text' },
    ],
    seed: [
      { id: 1, platformName: '大合产业发展集团 · AI招商智能体平台', domain: 'ai.dahe.cn', deepseekKey: 'sk-5b2b633602b24493b285fd1b4ac23166', tianyanchaKey: 'tyc-****************************9e2c', qccKey: 'qcc-****************************7b4d' },
    ],
  },
  /* ---------- 第二批新增资源 ---------- */
  companies: {
    label: '重点企业',
    columns: [
      { key: 'name', label: '企业名称', type: 'text', required: true },
      { key: 'region', label: '所在地', type: 'text' },
      { key: 'industry', label: '行业', type: 'text' },
      { key: 'registerCapital', label: '注册资本(万)', type: 'number' },
      { key: 'employees', label: '员工数', type: 'number' },
      { key: 'foundedYear', label: '成立年份', type: 'number' },
    ],
    seed: [
      { id: 1, name: '宜宾五粮液股份', region: '宜宾', industry: '食品饮料', registerCapital: 388000, employees: 25000, foundedYear: 1998, contractExpire: 98, projectAmount: 96, renewal: 94, outofTown: 60, growth: 92, industryMatch: 90, signalFlags: { 扩产: true, 投资: true }, signalReason: '扩建产能+新设产业基金' },
      { id: 2, name: '通威股份', region: '成都/眉山', industry: '新能源', registerCapital: 450000, employees: 30000, foundedYear: 1982, contractExpire: 96, projectAmount: 98, renewal: 90, outofTown: 50, growth: 95, industryMatch: 95, signalFlags: { 融资: true, 扩产: true }, signalReason: '定增50亿+太阳能电池扩产' },
      { id: 3, name: '四川长虹电子控股集团', region: '绵阳', industry: '电子信息', registerCapital: 1000000, employees: 50000, foundedYear: 1958, contractExpire: 95, projectAmount: 90, renewal: 85, outofTown: 55, growth: 88, industryMatch: 92, signalFlags: { 融资: true, 扩产: true }, signalReason: '10亿战略融资+钠电产线' },
      { id: 4, name: '攀钢集团', region: '攀枝花', industry: '钢铁/钒钛', registerCapital: 800000, employees: 40000, foundedYear: 1965, contractExpire: 88, projectAmount: 80, renewal: 82, outofTown: 35, growth: 70, industryMatch: 86, signalFlags: { 中标: true, 合作: true }, signalReason: '钒钛中标签约+院校合作' },
      { id: 5, name: '二重重型装备', region: '德阳', industry: '装备制造', registerCapital: 300000, employees: 15000, foundedYear: 1958, contractExpire: 85, projectAmount: 80, renewal: 75, outofTown: 30, growth: 72, industryMatch: 82, signalFlags: { 迁址: true, 招聘: true }, signalReason: '研发中心迁址+大规模招聘' },
      { id: 6, name: '东方电气', region: '成都/德阳', industry: '装备制造/能源', registerCapital: 600000, employees: 28000, foundedYear: 1984, contractExpire: 86, projectAmount: 88, renewal: 82, outofTown: 35, growth: 74, industryMatch: 85, signalFlags: { 中标: true, 投资: true }, signalReason: '海外项目中标+新能源投资' },
    ],
  },
  scoreWeights: {
    label: '招商评分权重',
    isSingle: true,
    seed: [{ id: 1, 合同到期: 30, 项目金额: 20, 续标: 15, 外地企业: 15, 成长性: 10, 产业匹配度: 10 }],
  },
  signalWeights: {
    label: '机会信号权重',
    isSingle: true,
    seed: [{ id: 1, 融资: 25, 扩产: 20, 招聘: 15, 迁址: 15, 中标: 10, 投资: 5, 合作: 5, 获奖: 5 }],
  },
  scores: { label: '评分结果', columns: [], seed: [] },
  signals: { label: '信号结果', columns: [], seed: [] },
  profileTags: {
    label: '企业画像维度',
    columns: [
      { key: 'dim', label: '维度', type: 'text', required: true },
      { key: 'method', label: '方法', type: 'text' },
      { key: 'basis', label: '依据', type: 'text' },
      { key: 'count', label: '覆盖企业', type: 'number' },
      { key: 'accuracy', label: '准确率', type: 'text' },
      { key: 'status', label: '状态', type: 'select', options: ['正常', '优化中', '待复核'] },
    ],
    seed: [
      { id: 1, dim: '规模标签', method: '规则匹配', basis: '注册资本/员工数', count: 186, accuracy: '98%', status: '正常' },
      { id: 2, dim: '行业与企业类型', method: '规则+LLM', basis: '工商行业/资质', count: 186, accuracy: '96%', status: '正常' },
      { id: 3, dim: '生命周期', method: '规则匹配', basis: '成立时间/融资轮次', count: 186, accuracy: '94%', status: '正常' },
      { id: 4, dim: '技术能力', method: 'LLM抽取', basis: '专利/高企/研发投入', count: 186, accuracy: '91%', status: '正常' },
      { id: 5, dim: '成长能力', method: '规则+LLM', basis: '融资/招聘/新闻热度', count: 186, accuracy: '88%', status: '优化中' },
      { id: 6, dim: '区域布局', method: '规则匹配', basis: '分支机构/工厂地址', count: 186, accuracy: '97%', status: '正常' },
      { id: 7, dim: '经营质量', method: '规则+LLM', basis: '财务/司法/舆情', count: 186, accuracy: '95%', status: '正常' },
    ],
  },
  models: {
    label: 'AI模型',
    columns: [
      { key: 'name', label: '模型名称', type: 'text', required: true },
      { key: 'type', label: '类型', type: 'text' },
      { key: 'version', label: '版本', type: 'text' },
      { key: 'role', label: '状态', type: 'select', options: ['主模型', '备模型', '运行中'] },
      { key: 'accuracy', label: '准确率', type: 'text' },
      { key: 'samples', label: '训练样本', type: 'text' },
    ],
    seed: [
      { id: 1, name: '企业画像模型', type: '规则+LLM', version: 'v2.3', role: '主模型', accuracy: '92.6%', samples: '3,860' },
      { id: 2, name: '企业画像模型', type: '规则+LLM', version: 'v2.2', role: '备模型', accuracy: '90.1%', samples: '3,200' },
      { id: 3, name: '招商评分模型', type: '评分模型', version: 'r1.6', role: '主模型', accuracy: '89.3%', samples: '2,680' },
      { id: 4, name: 'DeepSeek LLM', type: '大语言模型', version: 'deepseek-v3', role: '运行中', accuracy: '-', samples: '-' },
      { id: 5, name: 'Embedding', type: '向量化', version: 'bge-large-zh', role: '运行中', accuracy: '-', samples: '-' },
    ],
  },
  prompts: {
    label: '提示词',
    columns: [
      { key: 'name', label: '场景', type: 'text', required: true },
      { key: 'version', label: '版本', type: 'text' },
      { key: 'date', label: '最后更新', type: 'text' },
      { key: 'status', label: '效果', type: 'text' },
      { key: 'accuracy', label: '指标', type: 'text' },
      { key: 'content', label: '提示词内容', type: 'textarea' },
    ],
    seed: [
      { id: 1, name: '画像提示词', version: 'v3', date: '2026-08-05', status: '准确率 92.6%', accuracy: '92.6%', content: '你是一名产业招商分析师。根据企业工商、专利、招聘、新闻等信息，抽取7维画像标签（规模/行业类型/生命周期/技术能力/成长能力/区域布局/经营质量），并给出置信度。' },
      { id: 2, name: '摘要提示词', version: 'v3', date: '2026-08-03', status: '通过率 88%', accuracy: '88%', content: '将以下资讯浓缩为不超过80字的结构化摘要，包含：事件主体、金额、时间、影响，并打上产业标签。' },
      { id: 3, name: '评分提示词', version: 'v2', date: '2026-07-28', status: 'F1 89.3%', accuracy: '89.3%', content: '根据企业6维属性（合同到期/项目金额/续标/外地企业/成长性/产业匹配度）与权重，输出0-100综合招商价值分及A/B/C分级理由。' },
      { id: 4, name: '问答提示词', version: 'v4', date: '2026-08-06', status: '满意度 94%', accuracy: '94%', content: '你是大合产业招商智能问答助手，仅基于知识库作答，未知信息明确说不知道，不得编造。' },
    ],
  },
  cacheConfig: {
    label: '缓存有效期配置',
    isSingle: true,
    seed: [{ id: 1, items: [
      { name: '新闻资讯', days: 30, on: true },
      { name: '招投标数据', days: 90, on: true },
      { name: '政策文件', days: 365, on: true },
      { name: '企业工商信息', days: 7, on: true },
      { name: 'AI摘要结果', days: 60, on: true },
    ] }],
  },
  costConfig: {
    label: '成本优化配置',
    isSingle: true,
    seed: [{ id: 1, items: [
      { name: '普通关键词检索不调用模型', desc: '仅摘要/研判/匹配场景调用大模型', on: true },
      { name: '相同问题优先读缓存', desc: '问答缓存有效期 60 分钟', on: true },
      { name: '数据先清洗去重再入库', desc: '减少模型输入 Token', on: true },
      { name: '报告生成复用已有摘要', desc: '复用已有画像/政策标签', on: true },
    ] }],
  },
  industryInsights: {
    label: '产业趋势分析',
    columns: [
      { key: 'industry', label: '产业', type: 'text', required: true },
      { key: 'trend', label: '趋势分析', type: 'textarea' },
    ],
    seed: [
      { id: 1, industry: '电子信息', trend: '稳中向好，AI芯片/新型显示是增长点，年增速预计 12%' },
      { id: 2, industry: '新能源', trend: '高速增长期，钠离子电池/光伏是重点，年增速预计 25%' },
      { id: 3, industry: '装备制造', trend: '平稳发展，向高端化转型，年增速预计 8%' },
      { id: 4, industry: '食品饮料', trend: '成熟稳定，品牌升级是关键，年增速预计 5%' },
    ],
  },
  auditOps: {
    label: '操作日志',
    columns: [],
    seed: [
      { id: 1, time: '15:42:18', text: '系统管理员 → 修改评分权重配置（合同到期 28→30）', tag: '规则配置' },
      { id: 2, time: '14:20:05', text: '招商专员 → 上传Excel（2026年8月新增企业.xlsx，236行）', tag: '数据上传' },
      { id: 3, time: '13:15:30', text: '系统管理员 → 审核通过知识（钠离子电池产业链图谱更新）', tag: '知识审核' },
      { id: 4, time: '11:08:00', text: '系统 → 爱企查API额度预警（剩余1,236次）', tag: '系统告警' },
      { id: 5, time: '10:30:12', text: '招商主管 → 导出报告（新能源产业链分析报告.pdf）', tag: '报告导出' },
      { id: 6, time: '09:15:00', text: '系统管理员 → 新增用户账户（viewer）', tag: '用户管理' },
    ],
  },
  auditData: {
    label: '数据变更日志',
    columns: [],
    seed: [
      { id: 1, time: '15:42:18', text: '四川长虹电子控股集团 → 评分变更 84→87（模型v2.3/规则r1.6）', tag: '评分更新' },
      { id: 2, time: '14:20:05', text: '232家企业 → 基础信息新增（Excel批量导入）', tag: '数据新增' },
      { id: 3, time: '13:15:30', text: '通威股份 → 画像标签变更（生命周期 成长期→成熟期）', tag: '画像更新' },
      { id: 4, time: '06:00:00', text: '186家企业 → 工商变更同步（注册资本/法人/股东等）', tag: '工商同步' },
    ],
  },
  auditApi: {
    label: 'AI调用日志',
    columns: [],
    seed: [
      { id: 1, time: '15:42:18', scene: '问答', model: 'deepseek-v3', inTok: 1286, outTok: 568, cost: '2.3s', money: '¥0.08', status: '成功' },
      { id: 2, time: '15:41:05', scene: '摘要', model: 'deepseek-v3', inTok: 2680, outTok: 320, cost: '3.2s', money: '¥0.12', status: '成功' },
      { id: 3, time: '15:40:30', scene: '画像', model: 'deepseek-v3', inTok: 3860, outTok: 186, cost: '4.1s', money: '¥0.16', status: '成功' },
      { id: 4, time: '15:39:12', scene: '报告生成', model: 'deepseek-v3', inTok: 5820, outTok: 2680, cost: '8.6s', money: '¥0.32', status: '成功' },
      { id: 5, time: '15:38:00', scene: '问答（缓存命中）', model: '-', inTok: '-', outTok: '-', cost: '12ms', money: '¥0.00', status: '缓存' },
    ],
  },
  messages: {
    label: '站内信',
    columns: [
      { key: 'to', label: '接收人', type: 'text', required: true },
      { key: 'title', label: '标题', type: 'text' },
      { key: 'content', label: '内容', type: 'text' },
      { key: 'event', label: '触发事件', type: 'text' },
      { key: 'method', label: '推送方式', type: 'text' },
      { key: 'read', label: '已读', type: 'select', options: ['false', 'true'] },
      { key: 'time', label: '时间', type: 'text' },
    ],
    seed: [],
  },
};

/* ---------- 引擎计算 ---------- */
const SCORE_DIM = { '合同到期': 'contractExpire', '项目金额': 'projectAmount', '续标': 'renewal', '外地企业': 'outofTown', '成长性': 'growth', '产业匹配度': 'industryMatch' };
function levelOf(s) { return s >= 85 ? 'A类' : s >= 78 ? 'B类' : 'C类'; }
function computeScores() {
  const companies = loadRes('companies');
  const w = loadRes('scoreWeights')[0] || {};
  const scores = companies.map((c) => {
    let s = 0;
    for (const [k, key] of Object.entries(SCORE_DIM)) s += (Number(c[key]) || 0) * ((Number(w[k]) || 0) / 100);
    const hasData = Object.values(SCORE_DIM).some((key) => Number(c[key]) > 0);
    if (!hasData) return { id: c.id, companyId: c.id, company: c.name, score: null, level: '待分析', modelVer: 'v2.3', ruleVer: 'r1.6', time: now() };
    s = Math.round(s);
    return { id: c.id, companyId: c.id, company: c.name, score: s, level: levelOf(s), modelVer: 'v2.3', ruleVer: 'r1.6', time: now() };
  });
  scores.sort((a, b) => (a.score == null ? 1 : b.score == null ? -1 : b.score - a.score));
  saveRes('scores', scores);
  return scores;
}
/* 信号类型推导：优先用手工 signalFlags，否则基于企业维度自动判定（导入企业也能进信号页） */
function deriveSignalFlags(c) {
  if (c.signalFlags && Object.keys(c.signalFlags).some((k) => c.signalFlags[k])) {
    return { flags: c.signalFlags, reason: c.signalReason || '' };
  }
  const flags = {}; const reasons = [];
  const g = Number(c.growth), p = Number(c.projectAmount), o = Number(c.outofTown),
        ce = Number(c.contractExpire), im = Number(c.industryMatch), rn = Number(c.renewal);
  if (g >= 80) { flags['融资'] = true; reasons.push('高成长性企业常伴随融资'); }
  if (p >= 85) { flags['扩产'] = true; reasons.push('重大项目线索，存在扩产可能'); }
  if (o >= 70) { flags['迁址'] = true; reasons.push('外地企业，存在跨区域落地/迁址机会'); }
  if (ce >= 85) { flags['投资'] = true; reasons.push('合同临期，存在再投资/续约窗口'); }
  if (im >= 70) { flags['合作'] = true; reasons.push('匹配本地重点产业，具备产业链合作基础'); }
  if (rn >= 85) { flags['招聘'] = true; reasons.push('续标意愿强，存在人员扩招信号'); }
  const h = hashStr(c.name + (c.region || ''));
  if (h > 0.82) { flags['中标'] = true; reasons.push('近期存在项目中标可能'); }
  if (h < 0.12) { flags['获奖'] = true; reasons.push('近期存在资质/荣誉获奖可能'); }
  return { flags, reason: reasons.join('；') };
}
function computeSignals() {
  const companies = loadRes('companies');
  const w = loadRes('signalWeights')[0] || {};
  const signals = companies.map((c) => {
    const { flags, reason } = deriveSignalFlags(c);
    const types = Object.keys(flags).filter((k) => flags[k]);
    if (!types.length) return null;
    let s = 0; types.forEach((t) => (s += Number(w[t]) || 0));
    const status = s >= 40 ? '已推荐' : s >= 25 ? '待定' : '观察';
    return { id: c.id, companyId: c.id, company: c.name, types: types.join('+'), score: s, reason: reason || c.signalReason || '', status, time: now() };
  }).filter(Boolean);
  signals.sort((a, b) => b.score - a.score);
  saveRes('signals', signals);
  return signals;
}

/* ---------- 审计日志 ---------- */
function logAudit(kind, text, tag) {
  const map = { op: 'auditOps', data: 'auditData', api: 'auditApi' };
  const name = map[kind] || 'auditOps';
  const arr = loadRes(name);
  const item = { id: nextId(arr), time: nowHMS(), text: text || '', tag: tag || '系统' };
  if (name === 'auditApi') { // 兼容API日志字段结构
    item.scene = '外部API'; item.model = '-'; item.inTok = '-'; item.outTok = '-'; item.cost = '—'; item.money = '¥0.00'; item.status = '成功';
  }
  arr.unshift(item);
  saveRes(name, arr);
  return item;
}

/* ---------- 鉴权（token 持久化到 data/tokens.json，重启不失效） ---------- */
const TOKENS = new Map();
const TOKENS_FILE = fileOf('tokens');
function loadTokens() {
  if (!fs.existsSync(TOKENS_FILE)) return;
  try {
    const list = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8'));
    if (Array.isArray(list)) list.forEach((t) => { if (t && t.token && t.user) TOKENS.set(t.token, t.user); });
  } catch (e) {}
}
function saveTokens() {
  const list = [];
  TOKENS.forEach((user, token) => list.push({ token, user, time: new Date().toISOString() }));
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(list, null, 2));
}
function makeToken() { return crypto.randomBytes(16).toString('hex'); }
loadTokens();

/* ---------- 外部 API 适配器（填 key 即真，无网/无key 回退 mock） ---------- */
function externalQuery(source, q) {
  const settings = loadRes('settings')[0] || {};
  const keyMap = { 天眼查: 'tianyanchaKey', 企查查: 'qccKey', DeepSeek: 'deepseekKey' };
  const key = keyMap[source] ? settings[keyMap[source]] : '';
  const hasKey = !!(key && key.indexOf('*') < 0); // 含掩码(*)视为未配置（演示模式）
  if (!hasKey) {
    // 本地 mock：从 companies 命中则返回，否则构造通用占位
    const hit = loadRes('companies').find((c) => c.name.indexOf(q) >= 0);
    return { mode: 'mock', source, query: q, result: hit ? { name: hit.name, industry: hit.industry, region: hit.region, scoreHint: '本地画像可用' } : { name: q, note: '未配置真实Key，返回演示数据' } };
  }
  // 已配置真实 Key：尝试真实请求（沙箱无外网会超时回退）
  return new Promise((resolve) => {
    const url = source === '天眼查' ? 'https://open.api.tianyancha.com/services/open/2.0/baseinfo/normalOne'
      : source === '企查查' ? 'https://api.qcc.com/api/user/GetBasic' : 'https://api.deepseek.com/v1/chat/completions';
    const req = https.request(url, { method: 'GET', timeout: 2500, headers: { 'Authorization': 'Bearer ' + key } }, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => resolve({ mode: 'live', source, query: q, httpStatus: r.statusCode, result: d.slice(0, 200) })); });
    req.on('timeout', () => { req.destroy(); resolve({ mode: 'mock', source, query: q, note: '真实请求超时，已回退演示数据' }); });
    req.on('error', () => resolve({ mode: 'mock', source, query: q, note: '网络不可达，已回退演示数据' }));
    req.end();
  });
}

/* ---------- 企业评分维度补全（打通工商源 + 规则，消除"待分析"） ---------- */
function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return (h % 1000) / 1000; }
async function enrichCompany(c) {
  const settings = loadRes('settings')[0] || {};
  const source = (settings.tianyanchaKey && settings.tianyanchaKey.indexOf('*') < 0) ? '天眼查'
    : (settings.qccKey && settings.qccKey.indexOf('*') < 0) ? '企查查' : null;
  let live = false;
  if (source) {
    try {
      const ext = await externalQuery(source, c.name);
      const res = ext && ext.result;
      if (res && typeof res === 'object') {
        if (!c.industry && res.industry) c.industry = res.industry;
        if (!c.region && res.region) c.region = res.region;
        if (!c.registerCapital && res.registerCapital) c.registerCapital = res.registerCapital;
      }
      live = true; // 已尝试真实工商源（是否命中字段另说）
    } catch (e) { live = false; }
  }
  // 规则补全 6 个评分维度（0-100），基于企业属性 + 名字稳定扰动
  const h = hashStr(c.name + (c.region || ''));
  const local = /成都|四川|蓉|川|绵阳|德阳|宜宾|泸州|南充/.test(c.region || '');
  c.outofTown = local ? Math.round(28 + h * 22) : Math.round(78 + h * 22);
  const keyInd = ['电子信息', '新能源', '装备制造', '食品饮料', '人工智能', '集成电路', '光伏', '锂电', '动力电池', '医药', '数字经济', '新材料'];
  const match = keyInd.some((k) => (c.industry || '').indexOf(k) >= 0);
  c.industryMatch = match ? Math.round(72 + h * 28) : Math.round(38 + h * 30);
  const yr = Number(c.foundedYear) || 0;
  const age = yr ? (2026 - yr) : 12;
  const young = age < 4 ? 1 : age < 8 ? 0.75 : age < 15 ? 0.55 : 0.35;
  const scale = Math.min(1, (Number(c.employees) || 80) / 600);
  c.growth = Math.round((young * 0.6 + scale * 0.4) * 100);
  c.contractExpire = Math.round(38 + h * 55);
  c.projectAmount = Math.round(32 + h * 60);
  c.renewal = Math.round(28 + h * 52);
  return { mode: live ? 'live' : 'local', sourceName: source || '本地规则' };
}

/* ---------- DeepSeek 对话（填 key 即真，无网/无key 回退 mock） ---------- */
function deepseekChat(systemPrompt, userPrompt, key, timeoutMs) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.7, max_tokens: 800 });
    const req = https.request('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST', timeout: timeoutMs || 6000, headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    }, (r) => { let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { const j = JSON.parse(d); if (j.choices && j.choices[0]) resolve(j.choices[0].message.content); else resolve(d.slice(0, 400)); } catch (e) { resolve(d.slice(0, 400)); } }); });
    req.on('timeout', () => { req.destroy(); reject(new Error('DeepSeek 请求超时')); });
    req.on('error', (e) => reject(e));
    req.write(body); req.end();
  });
}

/* ---------- 真实资讯获取（免费 RSS + DeepSeek 摘要） ---------- */
function deepseekUsage(systemPrompt, userPrompt, key, timeoutMs) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }], temperature: 0.5, max_tokens: 200 });
    const req = https.request('https://api.deepseek.com/v1/chat/completions', { method: 'POST', timeout: timeoutMs || 8000, headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key } }, (r) => {
      let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => { try { const j = JSON.parse(d); resolve({ content: j.choices && j.choices[0] ? j.choices[0].message.content : '', usage: j.usage || { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 } }); } catch (e) { resolve({ content: '', usage: { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 } }); } });
    });
    req.on('timeout', () => { req.destroy(); resolve({ content: '', usage: { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 } }); });
    req.on('error', () => resolve({ content: '', usage: { total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 } }));
    req.write(body); req.end();
  });
}
function stripTags(s) { return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }
function cdata(s) { let t = String(s || ''); const m = t.match(/<!\[CDATA\[([\s\S]*?)\]\]>/); if (m) t = m[1]; return stripTags(t); }
function hashId(s) { let h = 0; s = String(s); for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; } return 'n' + Math.abs(h).toString(36); }
function ymd(d) { const x = d instanceof Date ? d : new Date(d); if (isNaN(x.getTime())) return ''; const p = (n) => String(n).padStart(2, '0'); return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate()); }

const NEWS_SOURCES = [
  { key: 'ithome', name: 'IT之家', cat: '科技产业资讯', url: 'https://www.ithome.com/rss/', type: 'rss', per: 12 },
  { key: 'people', name: '人民网时政', cat: '政策时政资讯', url: 'http://www.people.com.cn/rss/politics.xml', type: 'rss', per: 12 },
  { key: 'sina', name: '新浪滚动', cat: '综合财经资讯', url: 'https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2516&k=&num=20&r=1', type: 'sina', per: 12 },
];

async function fetchRss(url) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, signal: ctrl.signal });
    const xml = await r.text();
    const items = []; const re = /<item>([\s\S]*?)<\/item>/g; let m;
    while ((m = re.exec(xml))) {
      const block = m[1];
      const g = (tag) => { const mm = block.match(new RegExp('<' + tag + '>([\\s\\S]*?)<\\/' + tag + '>', 'i')); return mm ? mm[1] : ''; };
      items.push({ title: cdata(g('title')), link: cdata(g('link')), pubDate: cdata(g('pubDate')), desc: cdata(g('description')) });
    }
    return items;
  } catch (e) { return []; } finally { clearTimeout(t); }
}
async function fetchSina(url) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: ctrl.signal });
    const j = await r.json();
    const arr = (j.result && j.result.data) || [];
    return arr.slice(0, 20).map((it) => ({ title: stripTags(it.title || ''), link: it.url || '', pubDate: it.ctime ? ymd(new Date(Number(it.ctime) * 1000)) : '', desc: stripTags(it.intro || it.summary || '') }));
  } catch (e) { return []; } finally { clearTimeout(t); }
}

async function fetchNews() {
  const settings = loadRes('settings')[0] || {};
  const key = settings.deepseekKey && !settings.deepseekKey.includes('*') ? settings.deepseekKey : '';
  const news = loadRes('news');
  const map = {}; news.forEach((n) => (map[n.id] = n));
  const stat = { total: 0, perCat: {}, aiCount: 0, cacheHit: 0, token: 0, cost: 0 };
  const MAX_AI = 8;
  for (const src of NEWS_SOURCES) {
    let items = src.type === 'sina' ? await fetchSina(src.url) : await fetchRss(src.url);
    items = items.filter((it) => it.title && it.link).slice(0, src.per);
    let aiDone = 0;
    for (const it of items) {
      const id = hashId(it.link);
      stat.total++; stat.perCat[src.cat] = (stat.perCat[src.cat] || 0) + 1;
      if (map[id]) { stat.cacheHit++; continue; }
      let summary = it.desc || it.title; let ai = false;
      if (key && aiDone < MAX_AI) {
        const r = await deepseekUsage('你是招商情报摘要助手。用一句不超过25字的中文，概括该资讯对地方产业招商的要点或价值。只输出摘要本身，不要解释。', it.title + '\n' + (it.desc || ''), key, 8000);
        if (r.content && r.content.trim()) { summary = r.content.trim().slice(0, 80); ai = true; aiDone++; stat.aiCount++; stat.token += (r.usage.total_tokens || 0); stat.cost += ((r.usage.prompt_tokens || 0) * 1e-6 + (r.usage.completion_tokens || 0) * 2e-6); }
      }
      const rec = { id, title: it.title, link: it.link, source: src.name, cat: src.cat, date: ymd(new Date()), pubDate: it.pubDate || ymd(new Date()), summary, ai, ts: Date.now() };
      news.push(rec); map[id] = rec;
    }
  }
  const cutoff = Date.now() - 30 * 864e5;
  saveRes('news', news.filter((n) => (n.ts || 0) >= cutoff));
  const meta = loadRes('newsMeta')[0] || {};
  meta.tokenTotal = (meta.tokenTotal || 0) + stat.token;
  meta.costTotal = Math.round(((meta.costTotal || 0) + stat.cost) * 100) / 100;
  meta.cacheHitTotal = (meta.cacheHitTotal || 0) + stat.cacheHit;
  meta.lastFetch = now();
  saveRes('newsMeta', [meta]);
  return stat;
}

/* ---------- Excel 解析工具 ---------- */
const HEADER_ALIAS = {
  name: ['企业名称', '企业名', '名称', '公司名称', '公司', '企业', '单位名称'],
  region: ['所在地', '地区', '城市', '区域', '注册地', '省份', '地市', '所在地区'],
  industry: ['行业', '所属行业', '产业', '主营', '主营业务'],
  registerCapital: ['注册资本', '注册资本(万)', '注册资金', '资本', '注册资本万元'],
  employees: ['员工数', '员工人数', '人数', '从业人数', '职工', '员工总数'],
  foundedYear: ['成立年份', '成立时间', '成立年', '注册年份', '创办年份', '成立日期'],
};
function mapCompanyRow(row) {
  const get = (aliases) => { for (const a of aliases) { if (row[a] != null && String(row[a]).trim() !== '') return String(row[a]).trim(); } return ''; };
  const name = get(HEADER_ALIAS.name);
  if (!name) return null;
  const num = (v) => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? 0 : n; };
  return {
    name,
    region: get(HEADER_ALIAS.region),
    industry: get(HEADER_ALIAS.industry),
    registerCapital: num(get(HEADER_ALIAS.registerCapital)),
    employees: num(get(HEADER_ALIAS.employees)),
    foundedYear: num(get(HEADER_ALIAS.foundedYear)),
  };
}

/* ---------- 工具 ---------- */
function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { resolve({}); } });
  });
}
function authUser(req) {
  const h = req.headers['authorization'] || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  return TOKENS.get(t);
}

/* ---------- 路由 ---------- */
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;
  const method = req.method;

  if (method === 'GET' && !p.startsWith('/api/')) {
    let fp = path.join(PUBLIC, p === '/' ? 'index.html' : p);
    if (!fp.startsWith(PUBLIC)) return send(res, 403, { error: 'forbidden' });
    fs.readFile(fp, (err, buf) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      const ext = path.extname(fp);
      const ct = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' }[ext] || 'text/plain';
      res.writeHead(200, { 'Content-Type': ct + '; charset=utf-8' });
      res.end(buf);
    });
    return;
  }

  if (p === '/api/login' && method === 'POST') {
    const b = await readBody(req);
    const users = loadRes('users');
    const user = users.find((x) => x.username === b.username && x.password === b.password);
    if (!user) return send(res, 401, { error: '用户名或密码错误' });
    const token = makeToken();
    TOKENS.set(token, user.username);
    saveTokens();
    user.lastLogin = now();
    saveRes('users', users);
    const { password, ...safe } = user;
    return send(res, 200, { token, user: safe });
  }

  if (p === '/api/me' && method === 'GET') {
    const uname = authUser(req);
    if (!uname) return send(res, 401, { error: '未登录' });
    const users = loadRes('users');
    const user = users.find((x) => x.username === uname);
    const { password, ...safe } = user || {};
    return send(res, 200, { user: safe });
  }

  if (p === '/api/schema' && method === 'GET') {
    const schema = {};
    for (const [k, v] of Object.entries(RESOURCES)) {
      if (v.isSingle && k !== 'settings') continue;
      schema[k] = { label: v.label, columns: v.columns };
    }
    return send(res, 200, { schema });
  }

  if (p === '/api/stats/overview' && method === 'GET') {
    const knowledge = loadRes('knowledge');
    const pending = knowledge.filter((x) => x.status === '待审核').length;
    return send(res, 200, {
      kbTotal: 86420, aiToday: 2386, cacheHit: 73.2, pendingReview: pending,
      trend1: [1820, 2150, 1980, 2360, 2100, 2480, 2386],
      trend2: [142, 168, 156, 186, 172, 198, 186],
    });
  }

  /* 引擎端点 */
  if (p === '/api/engine/score/recompute' && method === 'POST') {
    const uname = authUser(req); if (!uname) return send(res, 401, { error: '未登录' });
    const scores = computeScores();
    logAudit('data', scores.length + '家企业 → 招商评分重算完成（权重 r1.6）', '评分更新');
    return send(res, 200, { data: scores });
  }
  if (p === '/api/engine/signal/scan' && method === 'POST') {
    const uname = authUser(req); if (!uname) return send(res, 401, { error: '未登录' });
    const signals = computeSignals();
    logAudit('data', signals.length + '家企业 → 招商机会信号扫描完成', '机会发现');
    return send(res, 200, { data: signals });
  }
  if (p === '/api/engine/profile/build' && method === 'POST') {
    const uname = authUser(req); if (!uname) return send(res, 401, { error: '未登录' });
    const tags = loadRes('profileTags');
    tags.forEach((t) => { t.status = t.dim === '成长能力' ? '优化中' : '正常'; });
    saveRes('profileTags', tags);
    logAudit('op', uname + ' → 触发企业画像批量生成（7维标签）', '企业画像');
    return send(res, 200, { data: tags });
  }

  /* 通用审计写入（前端按钮动作调用） */
  if (p === '/api/audit/log' && method === 'POST') {
    const uname = authUser(req); if (!uname) return send(res, 401, { error: '未登录' });
    const b = await readBody(req);
    const item = logAudit(b.kind || 'op', (uname && b.kind !== 'api' ? uname + ' → ' : '') + (b.text || ''), b.tag || '系统');
    return send(res, 200, { data: item });
  }

  /* 外部 API 适配 */
  if (p === '/api/external/test' && method === 'POST') {
    const uname = authUser(req); if (!uname) return send(res, 401, { error: '未登录' });
    const b = await readBody(req);
    const settings = loadRes('settings')[0] || {};
    const keyMap = { 天眼查: 'tianyanchaKey', 企查查: 'qccKey', DeepSeek: 'deepseekKey' };
    const key = keyMap[b.source] ? settings[keyMap[b.source]] : '';
    const configured = !!(key && key.indexOf('*') < 0);
    return send(res, 200, { source: b.source, configured });
  }
  if (p === '/api/external/company' && method === 'POST') {
    const uname = authUser(req); if (!uname) return send(res, 401, { error: '未登录' });
    const b = await readBody(req);
    const r = await externalQuery(b.source || '天眼查', b.name || '');
    if (r.mode === 'mock') logAudit('api', '外部API查询（' + (b.source || '天眼查') + '·' + (b.name || '') + '）→ 演示数据', '外部API');
    return send(res, 200, r);
  }

  /* ---------- Excel 模板下载（真实生成 xlsx） ---------- */
  if (p === '/api/excel/template' && method === 'GET') {
    const uname = authUser(req); if (!uname) return send(res, 401, { error: '未登录' });
    if (!XLSX) return send(res, 500, { error: '服务端未安装 xlsx 依赖（npm install xlsx）' });
    const type = u.searchParams.get('type') || '企业信息';
    let aoa;
    if (type === '企业信息') {
      aoa = [['企业名称', '所在地', '行业', '注册资本(万)', '员工数', '成立年份'],
        ['示例科技有限责任公司', '成都', '电子信息', '5000', '320', '2015'],
        ['示例新能源有限公司', '宜宾', '新能源', '120000', '2100', '2018']];
    } else if (type === '招商案例') {
      aoa = [['标题', '类型', '内容', '时间'], ['示例招商案例', '成功', '某新能源企业落地，投资额20亿', '2026-08-01']];
    } else {
      aoa = [['名称', '类型', '数值', '说明'], ['示例内部数据', '台账', '100', '内部统计']];
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '模板');
    const b64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    return send(res, 200, { filename: type + '模板.xlsx', b64 });
  }

  /* ---------- Excel 真实导入（解析→落库→重算） ---------- */
  if (p === '/api/excel/import' && method === 'POST') {
    const uname = authUser(req); if (!uname) return send(res, 401, { error: '未登录' });
    if (!XLSX) return send(res, 500, { error: '服务端未安装 xlsx 依赖（npm install xlsx）' });
    const b = await readBody(req);
    let rows = [];
    try {
      const buf = Buffer.from(b.b64 || '', 'base64');
      const wb = XLSX.read(buf, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    } catch (e) { return send(res, 400, { error: '文件解析失败：' + e.message }); }
    if (!rows.length) return send(res, 400, { error: '未读取到任何数据行' });
    const companies = loadRes('companies');
    let success = 0, fail = 0, added = 0, updated = 0;
    const newIds = []; let liveCount = 0, localCount = 0;
    for (const r of rows) {
      const m = mapCompanyRow(r);
      if (!m) { fail++; continue; }
      let c;
      const ex = companies.find((x) => x.name === m.name);
      if (ex) { Object.assign(ex, m); c = ex; updated++; } else { m.id = nextId(companies); companies.push(m); c = m; added++; newIds.push(m.id); }
      success++;
      if (!c.outofTown) {
        const er = await enrichCompany(c);
        if (er.mode === 'live') liveCount++; else localCount++;
      }
    }
    saveRes('companies', companies);
    computeScores();
    computeSignals();
    const scores = loadRes('scores');
    const newScores = scores.filter((s) => newIds.includes(s.id)).map((s) => ({
      company: s.company, score: s.score, level: s.level,
      source: s.score == null ? '待分析' : (liveCount ? '工商源' : '本地规则'),
    }));
    const up = loadRes('excelUploads');
    up.push({ id: nextId(up), filename: b.filename || '未命名.xlsx', type: b.type || '企业信息', uploader: uname, total: rows.length, success, fail, time: now(), status: fail === rows.length ? '失败' : '成功' });
    saveRes('excelUploads', up);
    logAudit('op', uname + ' → 上传Excel（' + (b.filename || '') + '，' + rows.length + '行，成功' + success + '/失败' + fail + '）', '数据上传');
    logAudit('data', added + '家企业新增 + ' + updated + '家更新（Excel导入，评分维度已自动补全）', '数据新增');
    return send(res, 200, {
      total: rows.length, success, fail, added, updated,
      enrichMode: liveCount ? 'live' : 'local',
      newCompanies: newIds.map((id) => (companies.find((x) => x.id === id) || {}).name),
      newScores,
    });
  }

  /* ---------- 知识库：DeepSeek 真生成 ---------- */
  if (p === '/api/knowledge/generate' && method === 'POST') {
    const uname = authUser(req); if (!uname) return send(res, 401, { error: '未登录' });
    const b = await readBody(req);
    const settings = loadRes('settings')[0] || {};
    const key = settings.deepseekKey || '';
    const hasKey = !!(key && key.indexOf('*') < 0);
    let content;
    const topic = b.topic || '未命名主题';
    const type = b.type || '产业';
    if (hasKey) {
      try {
        content = await deepseekChat(
          '你是产业招商知识库编辑，擅长把主题整理为结构化知识。输出不超过120字：先一句话结论，再列2-3个关键要点，最后打2-4个产业标签（用/分隔）。',
          '请生成关于「' + topic + '」的' + type + '知识摘要。', key);
      } catch (e) { content = '【生成失败：' + e.message + '】请稍后重试或检查 DeepSeek Key。'; }
    } else {
      content = '【未配置 DeepSeek Key · 占位内容】关于「' + topic + '」的' + type + '知识：当前系统未接入 DeepSeek，以下内容为占位示例，非真实 AI 生成。配置 Key 后将自动生成结构化摘要。标签：' + type + '/待配置。';
    }
    const data = loadRes('knowledge');
    const item = { id: nextId(data), title: topic + ' - ' + type + '知识', source: 'DeepSeek摘要', type, content, status: '待审核', reviewer: '', time: now() };
    data.push(item); saveRes('knowledge', data);
    logAudit('op', uname + ' → 用DeepSeek生成知识「' + item.title + '」', '知识生成');
    logAudit('data', uname + ' → 新增1条待审核知识（来源DeepSeek，ID ' + item.id + '）', '知识新增');
    return send(res, 200, { data: item });
  }

  /* ---------- 推送规则：测试触达（真实写入站内信，零第三方依赖） ---------- */
  if (p === '/api/push/test' && method === 'POST') {
    const uname = authUser(req); if (!uname) return send(res, 401, { error: '未登录' });
    const b = await readBody(req);
    const rules = loadRes('pushRules');
    const enabled = rules.filter((r) => r.status === '启用');
    const hit = b.event ? enabled.filter((r) => r.event === b.event) : enabled;
    const ts = now(); const hms = nowHMS();
    const users = loadRes('users');
    const messages = loadRes('messages');
    const sent = [];
    for (const r of hit) {
      let tos;
      const t = r.target || '';
      if (/管理员/.test(t)) tos = users.filter((u) => u.role === '超级管理员' || u.role === '招商主管').map((u) => u.username);
      else if (/招商|全体|用户|人员/.test(t)) tos = users.map((u) => u.username);
      else if (t && t !== '全体') tos = [t];
      else tos = users.map((u) => u.username);
      for (const to of (tos.length ? tos : ['全体'])) {
        const item = { id: nextId(messages), to, title: '【' + (r.event || '推送') + '】' + (r.content || '').slice(0, 18), content: r.content || '', event: r.event, method: r.method, time: ts, read: false, source: '推送引擎' };
        messages.push(item); sent.push(item);
      }
    }
    saveRes('messages', messages);
    const log = { id: nextId(loadRes('auditApi')), time: hms, text: uname + ' → 触发测试推送（命中 ' + hit.length + ' 条规则，真实送达 ' + sent.length + ' 条站内信）', tag: '推送触达', scene: '触达引擎', model: '-', inTok: '-', outTok: '-', cost: '—', money: '¥0.00', status: '已送达' };
    const api = loadRes('auditApi'); api.unshift(log); saveRes('auditApi', api);
    return send(res, 200, { success: true, hit: hit.length, sent: sent.length, targets: sent.map((m) => ({ to: m.to, event: m.event, method: m.method })) });
  }

  /* ---------- AI 模型校准（真实基于现有数据计算覆盖率/命中率/样本量） ---------- */
  if (p === '/api/models/calibrate' && method === 'POST') {
    const uname = authUser(req); if (!uname) return send(res, 401, { error: '未登录' });
    const b = await readBody(req);
    const models = loadRes('models');
    const m = models.find((x) => x.id === Number(b.id));
    if (!m) return send(res, 404, { error: '未找到模型' });
    const companies = loadRes('companies');
    const scores = loadRes('scores');
    const signals = loadRes('signals');
    const coverage = companies.length ? Math.round(scores.filter((s) => s.score != null).length / companies.length * 100) : 0;
    const recommended = signals.filter((s) => s.status === '已推荐').length;
    const hitRate = signals.length ? Math.round(recommended / signals.length * 100) : 0;
    const metrics = { coverage: coverage + '%', hitRate: hitRate + '%', samples: String(companies.length), calibratedAt: now() };
    m.metrics = metrics;
    if (!(m.type === '大语言模型' || m.type === '向量化')) {
      m.accuracy = coverage + '%覆盖 / ' + hitRate + '%命中';
      m.samples = String(companies.length);
    }
    saveRes('models', models);
    logAudit('op', uname + ' → 校准模型「' + m.name + '」（覆盖' + coverage + '% / 命中' + hitRate + '% / 样本' + companies.length + '）', '模型训练');
    return send(res, 200, { data: m, metrics });
  }

  /* 资讯获取（真实 RSS + DeepSeek 摘要） */
  if (p === '/api/news/fetch' && method === 'POST') {
    const uname = authUser(req); if (!uname) return send(res, 401, { error: '未登录' });
    try {
      const stat = await fetchNews();
      logAudit('api', uname + ' → 触发DeepSeek资讯获取（新增' + (stat.total - stat.cacheHit) + ' / 缓存' + stat.cacheHit + ' / AI摘要' + stat.aiCount + '）', '外部API');
      return send(res, 200, { success: true, ...stat });
    } catch (e) { return send(res, 500, { error: '资讯获取失败: ' + e.message }); }
  }
  if (p === '/api/news' && method === 'GET') {
    const uname = authUser(req); if (!uname) return send(res, 401, { error: '未登录' });
    const news = loadRes('news').sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const limit = Math.min(parseInt(u.searchParams.get('limit')) || 80, 300);
    return send(res, 200, { data: news.slice(0, limit) });
  }
  if (p === '/api/news/stats' && method === 'GET') {
    const uname = authUser(req); if (!uname) return send(res, 401, { error: '未登录' });
    const news = loadRes('news'); const meta = loadRes('newsMeta')[0] || {};
    const today = ymd(new Date());
    const todayItems = news.filter((n) => n.date === today);
    const perCat = {}; todayItems.forEach((n) => (perCat[n.cat] = (perCat[n.cat] || 0) + 1));
    return send(res, 200, { data: { totalToday: todayItems.length, perCat, aiTotal: news.filter((n) => n.ai).length, tokenTotal: meta.tokenTotal || 0, costTotal: meta.costTotal || 0, cacheHitTotal: meta.cacheHitTotal || 0, lastFetch: meta.lastFetch || '-' } });
  }

  /* 资源 CRUD: /api/:resource[/:id] */
  const m = p.match(/^\/api\/([a-zA-Z0-9_]+)(?:\/(\d+))?$/);
  if (m) {
    const name = m[1];
    const id = m[2] ? parseInt(m[2], 10) : null;
    if (!RESOURCES[name]) return send(res, 404, { error: '未知资源: ' + name });
    const user = authUser(req);
    if (!user) return send(res, 401, { error: '未登录' });

    if (method === 'GET' && !id) {
      const data = loadRes(name);
      if (RESOURCES[name].isSingle) return send(res, 200, { data: data[0] || {} });
      return send(res, 200, { data });
    }
    if (method === 'GET' && id) {
      const data = loadRes(name);
      const item = data.find((x) => x.id === id);
      return item ? send(res, 200, { data: item }) : send(res, 404, { error: '未找到' });
    }
    if (method === 'POST') {
      const b = await readBody(req);
      const data = loadRes(name);
      if (RESOURCES[name].isSingle) {
        if (data[0]) { data[0] = { ...data[0], ...b, id: data[0].id }; }
        else { data[0] = { id: 1, ...b }; }
        saveRes(name, data);
        return send(res, 200, { data: data[0] });
      }
      const item = { id: nextId(data), ...b };
      data.push(item); saveRes(name, data);
      auditCrud(user, '新增', name, item);
      return send(res, 201, { data: item });
    }
    if (method === 'PUT') {
      const b = await readBody(req);
      const data = loadRes(name);
      if (RESOURCES[name].isSingle) {
        if (data[0]) data[0] = { ...data[0], ...b, id: data[0].id }; else data[0] = { id: 1, ...b };
        saveRes(name, data);
        auditCrud(user, '编辑', name, data[0]);
        return send(res, 200, { data: data[0] });
      }
      if (!id) return send(res, 400, { error: '缺少 id' });
      const idx = data.findIndex((x) => x.id === id);
      if (idx < 0) return send(res, 404, { error: '未找到' });
      const old = data[idx];
      data[idx] = { ...data[idx], ...b, id };
      if (name === 'knowledge' && b.status === '已通过' && !old.publishedAt) data[idx].publishedAt = now();
      saveRes(name, data);
      auditCrud(user, '编辑', name, data[idx], old);
      return send(res, 200, { data: data[idx] });
    }
    if (method === 'DELETE' && id) {
      const data = loadRes(name);
      if (RESOURCES[name].isSingle) return send(res, 400, { error: '单条记录不可删除' });
      const target = data.find((x) => x.id === id);
      const filtered = data.filter((x) => x.id !== id);
      saveRes(name, filtered);
      auditCrud(user, '删除', name, target);
      return send(res, 200, { ok: true });
    }
  }

  send(res, 404, { error: 'not found' });
});

/* CRUD 自动写审计（操作日志） */
function auditCrud(user, action, name, item, old) {
  const label = RESOURCES[name] ? RESOURCES[name].label : name;
  let nameField = item && (item.name || item.title || item.username || item.keyword || item.company || ('#' + item.id));
  let extra = '';
  if (action === '编辑' && old && item) {
    // 找出变化字段
    const changed = [];
    for (const k of Object.keys(item)) { if (JSON.stringify(item[k]) !== JSON.stringify(old[k])) changed.push(k); }
    if (changed.length) extra = '（变更: ' + changed.slice(0, 3).join('/') + (changed.length > 3 ? '…' : '') + '）';
  }
  logAudit('op', user + ' → ' + action + label + '「' + nameField + '」' + extra, label);
}

/* 启动引导：确保评分/信号已计算 */
try { if (!fs.existsSync(fileOf('scores')) || loadRes('scores').length === 0) computeScores(); } catch (e) {}
try { if (!fs.existsSync(fileOf('signals')) || loadRes('signals').length === 0) computeSignals(); } catch (e) {}

/* 示例企业种子（四川招商典型，去重追加，经 enrichCompany 补全维度 + 重算评分/信号） */
const SAMPLE_COMPANIES = [
  { name: '成都京东方光电', region: '成都', industry: '电子信息', registerCapital: 500000, employees: 8000, foundedYear: 2015 },
  { name: '成都中电熊猫', region: '成都', industry: '电子信息', registerCapital: 300000, employees: 6000, foundedYear: 2010 },
  { name: '绵阳惠科光电', region: '绵阳', industry: '电子信息', registerCapital: 200000, employees: 5000, foundedYear: 2017 },
  { name: '成都卫士通信息', region: '成都', industry: '电子信息/安全', registerCapital: 150000, employees: 4000, foundedYear: 1998 },
  { name: '宜宾宁德时代', region: '宜宾', industry: '新能源', registerCapital: 1000000, employees: 12000, foundedYear: 2019 },
  { name: '成都中创新航', region: '成都', industry: '新能源', registerCapital: 600000, employees: 9000, foundedYear: 2020 },
  { name: '眉山阳光电源', region: '眉山', industry: '新能源', registerCapital: 400000, employees: 6000, foundedYear: 2018 },
  { name: '遂宁盛新锂能', region: '遂宁', industry: '新能源/锂电', registerCapital: 250000, employees: 3500, foundedYear: 2016 },
  { name: '成都亿纬锂能', region: '成都', industry: '新能源', registerCapital: 300000, employees: 4500, foundedYear: 2021 },
  { name: '德阳国机重装', region: '德阳', industry: '装备制造', registerCapital: 700000, employees: 18000, foundedYear: 1958 },
  { name: '成都中车长客', region: '成都', industry: '装备制造/轨交', registerCapital: 350000, employees: 7000, foundedYear: 2012 },
  { name: '资阳中车电气', region: '资阳', industry: '装备制造', registerCapital: 200000, employees: 4000, foundedYear: 2008 },
  { name: '自贡运机股份', region: '自贡', industry: '装备制造', registerCapital: 120000, employees: 2500, foundedYear: 2003 },
  { name: '泸州老窖股份', region: '泸州', industry: '食品饮料', registerCapital: 450000, employees: 16000, foundedYear: 1995 },
  { name: '四川剑南春', region: '绵竹', industry: '食品饮料', registerCapital: 200000, employees: 9000, foundedYear: 1996 },
  { name: '沱牌舍得', region: '射洪', industry: '食品饮料', registerCapital: 180000, employees: 6000, foundedYear: 1997 },
  { name: '郎酒股份', region: '古蔺', industry: '食品饮料', registerCapital: 220000, employees: 11000, foundedYear: 1998 },
  { name: '新希望集团', region: '成都', industry: '食品饮料/农业', registerCapital: 900000, employees: 60000, foundedYear: 1982 },
  { name: '成都康弘药业', region: '成都', industry: '医药', registerCapital: 300000, employees: 8000, foundedYear: 1996 },
  { name: '科伦药业', region: '成都', industry: '医药', registerCapital: 500000, employees: 20000, foundedYear: 1996 },
  { name: '成都先导药物', region: '成都', industry: '医药/生物', registerCapital: 150000, employees: 2000, foundedYear: 2012 },
  { name: '成都腾讯AI', region: '成都', industry: '数字经济/AI', registerCapital: 400000, employees: 5000, foundedYear: 2018 },
  { name: '阿里云西部中心', region: '成都', industry: '数字经济/云', registerCapital: 500000, employees: 4000, foundedYear: 2017 },
  { name: '商汤科技四川', region: '成都', industry: '人工智能', registerCapital: 250000, employees: 2500, foundedYear: 2019 },
  { name: '科大讯飞四川', region: '成都', industry: '人工智能', registerCapital: 200000, employees: 3000, foundedYear: 2016 },
  { name: '成都极米科技', region: '成都', industry: '电子信息/智能硬件', registerCapital: 160000, employees: 3500, foundedYear: 2013 },
  { name: '泸州智同化工', region: '泸州', industry: '化工', registerCapital: 180000, employees: 2800, foundedYear: 2005 },
  { name: '四川能投', region: '成都', industry: '能源', registerCapital: 800000, employees: 15000, foundedYear: 2011 },
];
async function seedCompanies() {
  let companies = loadRes('companies');
  const existing = new Set(companies.map((c) => c.name));
  let added = 0;
  for (const s of SAMPLE_COMPANIES) {
    if (existing.has(s.name)) continue;
    const c = Object.assign({ id: nextId(companies) }, s);
    companies.push(c);
    if (!c.outofTown) await enrichCompany(c);
    existing.add(s.name); added++;
  }
  saveRes('companies', companies);
  computeScores();
  computeSignals();
  console.log('[seed] 企业总数: ' + companies.length + '（新增 ' + added + '）');
}

if (process.argv.includes('--seed')) {
  (async () => { await seedCompanies(); console.log('[seed] 示例企业数据已生成，评分/信号已重算'); process.exit(0); })();
} else {
  server.listen(PORT, '127.0.0.1', () => {
    console.log('AI招商智能体管理端 已启动: http://127.0.0.1:' + PORT + '/');
  });
}
