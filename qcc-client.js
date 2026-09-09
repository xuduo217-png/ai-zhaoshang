'use strict';
const GROUPS = Object.freeze({ company: '企业基础', risk: '企业风险', ipr: '知识产权', operation: '经营信息', executive: '董监高' });
const fail = (message, statusCode = 502) => Object.assign(new Error(message), { statusCode });

function createQccClient({ token = process.env.QCC_MCP_TOKEN || '', fetchImpl = fetch, timeoutMs = 20000 } = {}) {
  const sessions = new Map();
  let sequence = 0;
  const redact = value => token ? String(value).split(token).join('[已隐藏凭据]') : String(value);
  async function rpc(group, method, params, session = {}) {
    if (!Object.hasOwn(GROUPS, group)) throw fail('不支持的企查查服务', 400);
    if (!token) throw fail('企查查尚未配置访问凭据', 503);
    const id = method.startsWith('notifications/') ? undefined : ++sequence;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let reader;
    try {
      const response = await fetchImpl(`https://agent.qcc.com/mcp/${group}/stream`, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
          ...(session.id ? { 'Mcp-Session-Id': session.id } : {}), ...(session.version ? { 'MCP-Protocol-Version': session.version } : {}) },
        body: JSON.stringify({ jsonrpc: '2.0', ...(id === undefined ? {} : { id }), method, params }),
      });
      if (!response.ok) throw fail([401,403].includes(response.status) ? '企查查认证失败或当前服务未授权' : response.status === 429 ? '企查查额度不足或请求过于频繁，请检查账号' : `企查查服务请求失败（HTTP ${response.status}）`);
      const sessionId = response.headers.get('mcp-session-id');
      if (sessionId) session.id = sessionId;
      if (id === undefined) { await response.body?.cancel(); return {}; }
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', bytes = 0;
      const isSSE = (response.headers.get('content-type') || '').includes('text/event-stream');
      const unpack = j => {
        if (j.id !== id) return undefined;
        if (j.error) throw fail('企查查协议调用失败，请稍后重试');
        if (!Object.hasOwn(j, 'result')) throw fail('企查查返回格式不正确');
        return j.result;
      };
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 2 * 1024 * 1024) throw fail('企查查返回数据过大，请缩小查询范围');
        buffer += decoder.decode(value, { stream: true });
        buffer = buffer.replace(/\r\n/g, '\n');
        if (isSSE) {
          let boundary;
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
            const data = frame.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
            if (!data) continue;
            const result = unpack(JSON.parse(data));
            if (result !== undefined) return result;
          }
        }
      }
      if (!isSSE) { const result = unpack(JSON.parse(buffer)); if (result !== undefined) return result; }
      throw fail('企查查未返回有效结果');
    } catch (error) {
      if (error.statusCode) throw error;
      throw fail(error.name === 'AbortError' ? '企查查请求超时，请稍后重试' : '企查查连接或响应异常，请稍后重试');
    } finally { clearTimeout(timer); if (reader) await reader.cancel().catch(() => {}); }
  }
  async function tools(group) {
    if (!Object.hasOwn(GROUPS, group)) throw fail('不支持的企查查服务', 400);
    const cached = sessions.get(group);
    if (cached && cached.until > Date.now()) return cached.promise;
    const promise = (async () => {
      const session = {};
      const init = await rpc(group, 'initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'ai-zhaoshang', version: '1.0' } }, session);
      session.version = init.protocolVersion;
      await rpc(group, 'notifications/initialized', {}, session);
      let cursor, all = [];
      for (let page = 0; page < 10; page++) {
        const result = await rpc(group, 'tools/list', cursor ? { cursor } : {}, session);
        if (!Array.isArray(result.tools)) throw fail('企查查工具目录格式异常');
        all.push(...result.tools.filter(t => /^(get_|verify_)/.test(t.name)));
        cursor = result.nextCursor;
        if (!cursor) return { session, tools: all };
      }
      throw fail('企查查工具目录分页异常');
    })();
    sessions.set(group, { promise, until: Date.now() + 5 * 60 * 1000 });
    try { return await promise; } catch (error) { sessions.delete(group); throw error; }
  }
  async function call(group, name, args) {
    const catalog = await tools(group);
    const tool = catalog.tools.find(t => t.name === name);
    if (!tool) throw fail('当前企查查服务未提供该查询工具', 400);
    if (!args || typeof args !== 'object' || Array.isArray(args)) throw fail('查询参数必须为对象', 400);
    const schema = tool.inputSchema || {}, properties = schema.properties || {};
    for (const key of schema.required || []) if (args[key] === undefined || args[key] === '') throw fail(`请填写参数：${key}`, 400);
    function valid(p, value) {
      if (p.type === 'array') return Array.isArray(value) && value.length <= 30 && value.every(v => valid(p.items || {}, v));
      if (p.type === 'string') return typeof value === 'string' && !!value.trim() && value.length <= 200 && (!p.enum || p.enum.includes(value));
      if (p.type === 'boolean') return typeof value === 'boolean';
      if (['number','integer'].includes(p.type)) return typeof value === 'number' && Number.isFinite(value) && (p.type !== 'integer' || Number.isInteger(value)) && (p.minimum === undefined || value >= p.minimum) && (p.maximum === undefined || value <= p.maximum);
      return false;
    }
    for (const [key, value] of Object.entries(args)) {
      const p = properties[key];
      if (!p) throw fail(`不支持的参数：${key}`, 400);
      if (!valid(p,value)) throw fail(`参数格式错误：${key}`, 400);
      if (p.enum && !p.enum.includes(value)) throw fail(`参数选项无效：${key}`, 400);
    }
    // Never retry a business call automatically: it may already have consumed credits.
    const result = await rpc(group, 'tools/call', { name, arguments: args }, catalog.session);
    if (result.isError) throw fail('企查查查询未成功，请检查账号额度、权限及查询条件；未返回可用数据');
    return { mode: 'live', source: '企查查', group, tool: name, queriedAt: new Date().toISOString(), result: JSON.parse(redact(JSON.stringify(result))), note: '以下为企查查原始返回；未发现公开记录不等于不存在风险，未披露字段不自动补全。' };
  }
  return { configured: !!token, groups: GROUPS, tools, call };
}
function resolvedCompany(response) {
  if (response.group !== 'company' || response.tool !== 'get_company_by_query') return null;
  for (const block of response.result?.content || []) {
    if (block.type !== 'text') continue;
    let parsed; try { parsed = JSON.parse(block.text); } catch { continue; }
    if (!parsed || typeof parsed !== 'object' || parsed['匹配结果'] !== '唯一精确匹配') continue;
    const entity = parsed['企业信息'];
    const name = entity?.['企业名称'], creditCode = entity?.['统一社会信用代码'];
    if (typeof name === 'string' && name.trim() && name.length <= 200 && typeof creditCode === 'string' && /^[0-9A-Z]{18}$/.test(creditCode)) return { name:name.trim(), creditCode };
  }
  return null;
}
module.exports = { createQccClient, resolvedCompany };
