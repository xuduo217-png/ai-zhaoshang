/* AI招商智能体管理端 · 前端数据驱动层
 * 登录鉴权 + 通用表格/表单 CRUD + 总览 + API卡片 + 设置
 * 第二批：四大引擎 + 知识库/审核 + AI模型 + 规则 + 审计(3栏) + 缓存/成本开关 + 接入日志 + 外部API
 */
(function () {
  const API = 'api';
  const PAGE_RES = {
    'page-user': 'users',
    'page-bid-config': 'bidKeywords',
    'page-push-config': 'pushRules',
    'page-workmgr-config': 'workStages',
  };
  let SCHEMA = {}, TOKEN = localStorage.getItem('zs_token') || '', USER = null;

  const el = (id) => document.getElementById(id);
  const q = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));
  function showToast(msg) { const t = el('toast'); if (!t) { if (window.showToast) return window.showToast(msg); return; } el('toastMsg').textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2500); }

  async function req(method, path, body) {
    const opt = { method, headers: { 'Content-Type': 'application/json' } };
    if (TOKEN) opt.headers['Authorization'] = 'Bearer ' + TOKEN;
    if (body) opt.body = JSON.stringify(body);
    const r = await fetch(API + path, opt);
    if (r.status === 401) { TOKEN = ''; localStorage.removeItem('zs_token'); showLogin(); throw new Error('unauth'); }
    return r.json().catch(() => ({}));
  }
  const apiGet = (p) => req('GET', p);
  const apiPost = (p, b) => req('POST', p, b);
  const apiPut = (p, b) => req('PUT', p, b);
  const apiDel = (p) => req('DELETE', p);
  const fmt = (v) => (v === undefined || v === null || v === '' ? '—' : v);

  async function init() {
    if (TOKEN) { try { const me = await apiGet('/me'); if (me.user) { USER = me.user; enter(); return; } } catch (e) {} }
    showLogin();
  }
  function showLogin() { el('loginMask').style.display = 'flex'; }
  function hideLogin() { el('loginMask').style.display = 'none'; }
  async function doLogin() {
    const u = el('loginUser').value.trim(), p = el('loginPass').value;
    if (!u || !p) { showToast('请输入账号和密码'); return; }
    const r = await apiPost('/login', { username: u, password: p });
    if (r.token) { TOKEN = r.token; localStorage.setItem('zs_token', TOKEN); USER = r.user; el('loginUser').value = ''; el('loginPass').value = ''; hideLogin(); enter(); }
    else showToast(r.error || '登录失败');
  }

  function enter() {
    hideLogin();
    setupCreateBtns();
    bindNav();
    apiGet('/schema').then((s) => { SCHEMA = s.schema; renderCurrent(); }).catch(() => renderCurrent());
    loadMessages();
  }
  /* ---------- 站内信消息中心（零第三方依赖，真实送达） ---------- */
  async function loadMessages() {
    try { const { data } = await apiGet('/messages'); window.__messages = data || []; renderMsgBell(); }
    catch (e) {}
  }
  function renderMsgBell() {
    const bell = el('msgBell'); if (!bell) return;
    const list = window.__messages || [];
    const unread = list.filter((m) => !m.read).length;
    let badge = el('msgBadge');
    if (!badge) { badge = document.createElement('span'); badge.id = 'msgBadge'; badge.className = 'msg-badge'; bell.appendChild(badge); }
    badge.textContent = unread > 0 ? (unread > 99 ? '99+' : String(unread)) : '';
    badge.style.display = unread > 0 ? 'flex' : 'none';
    renderMsgPanel();
  }
  window.ZS.toggleMsg = function () {
    const p = el('msgPanel'); if (!p) return;
    p.style.display = p.style.display === 'block' ? 'none' : 'block';
    if (p.style.display === 'block') renderMsgPanel();
  };
  async function renderMsgPanel() {
    const p = el('msgPanel'); if (!p) return;
    const list = (window.__messages || []).slice().sort((a, b) => (b.id || 0) - (a.id || 0));
    const unread = list.filter((m) => !m.read).length;
    p.innerHTML = '<div class="mp-head"><span>站内信' + (unread ? '（' + unread + ' 未读）' : '') + '</span><button class="btn btn-ghost btn-sm" onclick="ZS.markAllRead()">全部已读</button></div>' +
      (list.length ? list.map((m) => '<div class="mp-item' + (m.read ? '' : ' unread') + '" onclick="ZS.markMsgRead(' + m.id + ')"><div class="mp-title">' + fmt(m.title) + '</div><div class="mp-meta">' + fmt(m.to) + ' · ' + fmt(m.time) + ' · ' + fmt(m.method) + '</div><div class="mp-content">' + fmt(m.content) + '</div></div>').join('') : '<div class="mp-empty">暂无站内信</div>');
  }
  window.ZS.markMsgRead = async function (id) {
    const r = await apiPut('/messages/' + id, { read: true });
    if (r.data) await loadMessages();
  };
  window.ZS.markAllRead = async function () {
    for (const m of (window.__messages || []).filter((x) => !x.read)) { await apiPut('/messages/' + m.id, { read: true }); }
    await loadMessages();
  };
  document.addEventListener('click', (e) => {
    const p = el('msgPanel'); const bell = el('msgBell');
    if (p && p.style.display === 'block' && !p.contains(e.target) && e.target !== bell && !(bell && bell.contains(e.target))) p.style.display = 'none';
  });
  function bindNav() { qa('.nav-item').forEach((it) => it.addEventListener('click', () => setTimeout(renderCurrent, 0))); }
  function renderCurrent() {
    const p = q('.page.active'); if (!p) return; const pid = p.id;
    if (pid === 'page-data-ds') return renderNews();
    if (PAGE_RES[pid]) return renderTable(pid, PAGE_RES[pid]);
    if (pid === 'page-overview') return renderOverview();
    if (pid === 'page-data-api') return renderApiCards();
    if (pid === 'page-data-excel') return renderExcel();
    if (pid === 'page-setting') return renderSettings();
    if (pid === 'page-engine-profile') return renderEngineProfile();
    if (pid === 'page-engine-score') return renderEngineScore();
    if (pid === 'page-engine-signal') return renderEngineSignal();
    if (pid === 'page-engine-industry') return renderEngineIndustry();
    if (pid === 'page-kb') return renderKb();
    if (pid === 'page-kb-review') return renderReview();
    if (pid === 'page-model') return renderModel();
    if (pid === 'page-rule') return renderRule();
    if (pid === 'page-audit') return renderAudit();
    if (pid === 'page-data-cache') return renderDataCache();
    if (pid === 'page-data-log') return renderDataLog();
  }

  /* ---------- 通用表格 CRUD ---------- */
  async function renderTable(pid, res) {
    const page = el(pid); const tb = page.querySelector('tbody'); if (!tb) return;
    const sc = SCHEMA[res]; if (!sc) return;
    const { data } = await apiGet('/' + res);
    const thr = page.querySelector('thead tr');
    if (thr) thr.innerHTML = sc.columns.map((c) => '<th>' + c.label + '</th>').join('') + '<th>操作</th>';
    tb.innerHTML = (data.length ? data.map((it) => {
      const tds = sc.columns.map((c) => '<td>' + fmt(it[c.key]) + '</td>').join('');
      const extra = res === 'pushRules' ? ' <button class="btn btn-blue btn-sm" onclick="ZS.testPush(' + it.id + ')">测试推送</button>' : '';
      return '<tr>' + tds + '<td><button class="btn btn-ghost btn-sm" onclick="ZS.edit(\'' + res + '\',' + it.id + ')">编辑</button> <button class="btn btn-red btn-sm" onclick="ZS.del(\'' + res + '\',' + it.id + ')">删除</button>' + extra + '</td></tr>';
    }).join('') : '<tr><td colspan="' + (sc.columns.length + 1) + '" style="text-align:center;color:var(--txt-3);padding:24px">暂无数据，点击右上角“新增”添加</td></tr>');
  }

  function setupCreateBtns() {
    qa('button').forEach((b) => {
      const t = b.textContent.trim();
      if (/新增|添加|\+ /.test(t) && !b.dataset.zsbound) {
        b.dataset.zsbound = '1';
        b.addEventListener('click', () => { const pid = b.closest('.page').id; if (PAGE_RES[pid]) openCrud(pid, PAGE_RES[pid], null); else showToast('该模块暂未开放新增'); });
      }
    });
  }
  function openCrud(pid, res, item) {
    const sc = SCHEMA[res]; if (!sc) return;
    el('crudTitle').textContent = (item ? '编辑' : '新增') + ' · ' + sc.label;
    const form = el('crudForm');
    form.innerHTML = sc.columns.map((c) => {
      const val = item ? item[c.key] : '';
      let input;
      if (c.type === 'textarea') input = '<textarea data-key="' + c.key + '" rows="4" style="width:100%;background:var(--panel-2);border:1px solid var(--border);color:var(--txt-0);border-radius:8px;padding:9px 11px;font-size:13px;resize:vertical">' + String(val).replace(/</g, '&lt;') + '</textarea>';
      else if (c.type === 'select') input = '<select data-key="' + c.key + '">' + c.options.map((o) => '<option' + (o == val ? ' selected' : '') + '>' + o + '</option>').join('') + '</select>';
      else { const ty = c.type === 'number' ? 'number' : 'text'; input = '<input data-key="' + c.key + '" type="' + ty + '" value="' + String(val).replace(/"/g, '&quot;') + '"' + (c.required ? ' required' : '') + '>'; }
      return '<div class="form-row"><label>' + c.label + (c.required ? ' *' : '') + '</label>' + input + '</div>';
    }).join('');
    el('crudModal').dataset.res = res;
    el('crudModal').dataset.id = item ? item.id : '';
    el('crudModal').style.display = 'flex';
  }
  function closeCrud() { el('crudModal').style.display = 'none'; }
  async function saveCrud() {
    const m = el('crudModal'); const res = m.dataset.res; const id = m.dataset.id;
    const body = {}; qa('#crudForm [data-key]').forEach((inp) => { body[inp.dataset.key] = inp.value; });
    let r; if (id) r = await apiPut('/' + res + '/' + id, body); else r = await apiPost('/' + res, body);
    if (r.data) { showToast('保存成功'); closeCrud(); const pid = Object.keys(PAGE_RES).find((k) => PAGE_RES[k] === res); renderCurrent(); }
    else showToast('保存失败');
  }
  window.ZS = {
    login: doLogin,
    close: closeCrud,
    save: saveCrud,
    edit: function (res, id) { apiGet('/' + res + '/' + id).then((r) => openCrud(null, res, r.data)); },
    del: async function (res, id) { if (!confirm('确认删除该记录？')) return; const r = await apiDel('/' + res + '/' + id); if (r.ok) { showToast('已删除'); renderCurrent(); } else showToast('删除失败'); },
    testPush: async function (id) {
      const { data } = await apiGet('/pushRules'); const rule = data.find((x) => x.id === id);
      if (!rule) return showToast('规则不存在');
      const r = await apiPost('/push/test', { event: rule.event });
      if (r.success) showToast('测试推送已送达（' + rule.event + '）：命中 ' + r.hit + ' 条启用规则，详见「接入日志」'); else showToast('测试推送失败');
    },
  };

  /* ---------- 总览 ---------- */
  async function renderOverview() {
    const s = await apiGet('/stats/overview');
    qa('#page-overview .stat-card .ds-num').forEach((e, i) => {
      const v = [s.kbTotal, s.aiToday, s.cacheHit + '%', s.pendingReview][i];
      e.textContent = v == null ? '—' : (i === 0 ? Number(v).toLocaleString() : v);
    });
    drawOverviewReal(s.trend1, s.trend2);
  }
  function drawOverviewReal(d1, d2) {
    const svg = el('overviewChart'); if (!svg) return;
    const w = 400, h = 180, days = ['08-02', '08-03', '08-04', '08-05', '08-06', '08-07', '08-08'];
    const max1 = Math.max.apply(null, d1), max2 = Math.max.apply(null, d2);
    let html = '<defs><linearGradient id="og1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="rgba(30,64,175,.3)"/><stop offset="100%" stop-color="rgba(30,64,175,0)"/></linearGradient></defs>';
    let p1 = '', a1 = ''; d1.forEach((v, i) => { const x = 30 + (w - 50) * i / 6; const y = h - 25 - (h - 50) * v / max1; p1 += (i ? 'L' : 'M') + x + ' ' + y + ' '; if (i === 0) a1 = 'M' + x + ' ' + (h - 25) + ' '; a1 += 'L' + x + ' ' + y + ' '; });
    a1 += 'L' + (30 + (w - 50)) + ' ' + (h - 25) + ' Z';
    html += '<path d="' + a1 + '" fill="url(#og1)"/><path d="' + p1 + '" fill="none" stroke="#1e40af" stroke-width="2.5"/>';
    let p2 = ''; d2.forEach((v, i) => { const x = 30 + (w - 50) * i / 6; const y = h - 25 - (h - 50) * v / max2; p2 += (i ? 'L' : 'M') + x + ' ' + y + ' '; });
    html += '<path d="' + p2 + '" fill="none" stroke="#dc2626" stroke-width="2.5" stroke-dasharray="4"/>';
    d1.forEach((v, i) => { const x = 30 + (w - 50) * i / 6; const y = h - 25 - (h - 50) * v / max1; html += '<circle cx="' + x + '" cy="' + y + '" r="3" fill="#1e40af"/>'; });
    days.forEach((d, i) => { const x = 30 + (w - 50) * i / 6; html += '<text x="' + x + '" y="' + (h - 8) + '" text-anchor="middle" fill="#64748b" font-size="9">' + d + '</text>'; });
    svg.innerHTML = html;
  }

  /* ---------- API 卡片 + 外部API ---------- */
  async function renderApiCards() {
    const { data } = await apiGet('/apiSources');
    const grid = q('#page-data-api .grid-3'); if (!grid) return;
    const color = { '已连接': 'sb-success', '额度预警': 'sb-fail', '已断开': 'sb-normal' };
    grid.innerHTML = data.map((a) => {
      const ci = color[a.status] || 'sb-normal'; const pct = a.usage || 0;
      return '<div class="card"><div class="card-head"><div class="card-title">' + a.name + '</div><span class="status-badge ' + ci + '"><span class="sb-dot"></span>' + a.status + '</span></div><div class="field-list"><div class="field"><span class="fk">今日调用</span><span class="fv">' + fmt(a.todayCalls) + ' 次</span></div><div class="field"><span class="fk">剩余额度</span><span class="fv"><span class="hl">' + fmt(a.remain) + ' 次</span></span></div><div class="field"><span class="fk">获取内容</span><span class="fv">' + fmt(a.content) + '</span></div></div><div style="margin-top:12px"><div class="progress-bar"><i style="width:' + pct + '%"></i></div><div style="font-size:11px;color:var(--txt-3);margin-top:5px">额度使用 ' + pct + '%</div></div><div style="margin-top:10px"><button class="btn btn-ghost btn-sm" data-test="' + a.name + '">测试连接</button></div></div>';
    }).join('');
    grid.querySelectorAll('[data-test]').forEach((btn) => { btn.onclick = async () => { const r = await apiPost('/external/test', { source: btn.dataset.test }); showToast(btn.dataset.test + (r.configured ? '：Key 已配置，可真实调用' : '：未配置 Key，当前演示模式')); }; });
    const page = el('page-data-api');
    const syncBtn = Array.from(page.querySelectorAll('button')).find((b) => /立即同步/.test(b.textContent));
    if (syncBtn) syncBtn.onclick = async () => { await apiPost('/audit/log', { kind: 'api', text: '企业工商变更同步任务已触发', tag: '外部API' }); showToast('已触发工商变更同步任务'); };
  }

  /* ---------- Excel 数据上传（真实解析导入） ---------- */
  async function renderExcel() {
    const page = el('page-data-excel');
    // 隐藏文件选择器
    let fi = el('excelFileInput');
    if (!fi) {
      fi = document.createElement('input'); fi.id = 'excelFileInput'; fi.type = 'file';
      fi.accept = '.xlsx,.xls,.csv'; fi.style.display = 'none'; page.appendChild(fi);
      fi.addEventListener('change', (e) => {
        const f = e.target.files[0]; if (!f) return;
        const reader = new FileReader();
        reader.onload = () => { const b64 = String(reader.result).split(',')[1]; doExcelImport(f.name, window.__excelType || '企业信息', b64); };
        reader.readAsDataURL(f);
      });
    }
    // 三张上传卡片 → 触发真实选择文件
    const cards = page.querySelectorAll('.grid-3 .card');
    const types = ['企业信息', '招商案例', '内部数据'];
    cards.forEach((c, i) => {
      if (c.dataset.zsType) return;
      c.dataset.zsType = '1'; c.style.cursor = 'pointer';
      c.onclick = () => { window.__excelType = types[i] || '企业信息'; fi.value = ''; fi.click(); };
    });
    // 模板下载按钮 → 真实下载
    qa('#page-data-excel button').forEach((btn) => {
      if (!/下载/.test(btn.textContent) || btn.dataset.zsTpl) return;
      btn.dataset.zsTpl = '1';
      btn.onclick = () => {
        const card = btn.closest('.card');
        const title = card ? card.textContent : '';
        const type = /案例/.test(title) ? '招商案例' : /内部/.test(title) ? '内部数据' : '企业信息';
        downloadTemplate(type);
      };
    });
    // 上传记录表（读真实后端）
    const { data } = await apiGet('/excelUploads');
    const tb = page.querySelector('table tbody');
    if (tb) tb.innerHTML = data.length ? data.map((r) => '<tr><td>' + fmt(r.filename) + '</td><td>' + fmt(r.type) + '</td><td>' + fmt(r.uploader) + '</td><td>' + fmt(r.total) + '</td><td style="color:var(--dh-green)">' + fmt(r.success) + '</td><td style="color:var(--dh-red-2)">' + fmt(r.fail) + '</td><td>' + fmt(r.time) + '</td><td><span class="status-badge sb-success"><span class="sb-dot"></span>' + fmt(r.status) + '</span></td></tr>').join('') : '<tr><td colspan="8" style="text-align:center;color:var(--txt-3);padding:20px">暂无上传记录</td></tr>';
  }
  async function doExcelImport(filename, type, b64) {
    showToast('正在解析并导入「' + filename + '」…');
    const r = await apiPost('/excel/import', { filename, type, b64 });
    if (r.total != null) {
      showExcelResult(r);
      renderExcel();
      // 若评分/信号页正打开则刷新
      const ap = q('.page.active'); if (ap && (ap.id === 'page-engine-score' || ap.id === 'page-engine-signal')) renderCurrent();
    } else showToast(r.error || '导入失败');
  }
  async function downloadTemplate(type) {
    const r = await apiGet('/excel/template?type=' + encodeURIComponent(type));
    if (r.b64) {
      const a = document.createElement('a');
      a.href = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,' + r.b64;
      a.download = r.filename; document.body.appendChild(a); a.click(); a.remove();
      showToast('模板已开始下载：' + r.filename);
    } else showToast(r.error || '模板生成失败');
  }

  /* ---------- 上传结果弹窗 ---------- */
  function showResultModal(title, html) {
    let m = el('zsResultModal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'zsResultModal';
      m.style.cssText = 'position:fixed;inset:0;background:rgba(8,12,28,.6);display:none;align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(2px)';
      m.innerHTML = '<div style="background:var(--panel-1,#fff);min-width:440px;max-width:580px;border:1px solid var(--border,#ddd);border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.4)"><div style="padding:15px 20px;border-bottom:1px solid var(--border,#eee);font-weight:700;font-size:15px;color:var(--txt-0,#222);display:flex;justify-content:space-between;align-items:center"><span id="zsResultTitle"></span><button id="zsResultClose" style="background:none;border:none;color:var(--txt-3,#888);font-size:22px;cursor:pointer;line-height:1">×</button></div><div id="zsResultBody" style="padding:18px 20px;max-height:62vh;overflow:auto;color:var(--txt-1,#333);font-size:13.5px;line-height:1.6"></div></div>';
      document.body.appendChild(m);
      m.addEventListener('click', (e) => { if (e.target === m || e.target.id === 'zsResultClose') m.style.display = 'none'; });
    }
    el('zsResultTitle').textContent = title;
    el('zsResultBody').innerHTML = html;
    m.style.display = 'flex';
  }
  function showExcelResult(r) {
    const chip = (label, val, color) => '<div style="flex:1;background:var(--panel-2,#f4f6fb);border:1px solid var(--border,#e5e9f2);border-radius:10px;padding:10px 6px;text-align:center"><div style="font-size:21px;font-weight:800;color:' + (color || 'var(--txt-0)') + '">' + val + '</div><div style="font-size:11px;color:var(--txt-3,#888);margin-top:2px">' + label + '</div></div>';
    let html = '<div style="display:flex;gap:8px">' + chip('总行数', r.total, 'var(--dh-blue)') + chip('成功', r.success, 'var(--dh-green)') + chip('失败', r.fail, 'var(--dh-red-2)') + chip('新增', r.added, 'var(--dh-blue)') + chip('更新', r.updated, 'var(--dh-orange)') + '</div>';
    if (r.newScores && r.newScores.length) {
      html += '<div style="margin-top:14px;font-weight:700;color:var(--txt-0,#222)">新增企业 · 评分维度已自动补全并测算招商评分</div>';
      html += '<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:13px"><thead><tr style="text-align:left;color:var(--txt-3,#888);border-bottom:1px solid var(--border,#e5e9f2)"><th style="padding:6px 8px">企业</th><th style="padding:6px 8px">评分</th><th style="padding:6px 8px">等级</th><th style="padding:6px 8px">数据源</th></tr></thead><tbody>';
      const lvColor = { 'A类': 'var(--dh-green)', 'B类': 'var(--dh-orange)', 'C类': 'var(--txt-3,#888)', '待分析': 'var(--txt-3,#888)' };
      r.newScores.forEach((s) => {
        html += '<tr style="border-bottom:1px solid var(--border,#eef1f6)"><td style="padding:6px 8px">' + fmt(s.company) + '</td><td style="padding:6px 8px;font-weight:700;color:var(--dh-red-2)">' + (s.score == null ? '待分析' : s.score) + '</td><td style="padding:6px 8px;color:' + (lvColor[s.level] || 'var(--txt-3)') + '">' + fmt(s.level) + '</td><td style="padding:6px 8px;color:var(--txt-3,#888)">' + fmt(s.source) + '</td></tr>';
      });
      html += '</tbody></table>';
      html += '<div style="margin-top:10px;font-size:11px;color:var(--txt-3,#888)">评分维度由「' + (r.enrichMode === 'live' ? '真实工商源（天眼查/企查查）' : '本地规则 + 工商字段映射') + '」自动补全，可在「招商评分」页查看完整分布与等级。</div>';
    } else if (r.newCompanies && r.newCompanies.length) {
      html += '<div style="margin-top:12px;color:var(--txt-3,#888);font-size:12px">新增：' + r.newCompanies.map(fmt).join('、') + '</div>';
    }
    if (r.fail > 0) html += '<div style="margin-top:10px;color:var(--dh-red-2);font-size:12px">有 ' + r.fail + ' 行因缺少「企业名称」未被导入。</div>';
    showResultModal('Excel 导入结果', html);
  }

  /* ---------- 设置 ---------- */
  let settingsBound = false;
  async function renderSettings() {
    const { data } = await apiGet('/settings');
    const keys = ['platformName', 'domain', 'deepseekKey', 'tianyanchaKey', 'qccKey'];
    const fields = qa('#page-setting .field-list .field');
    fields.slice(0, 5).forEach((f, i) => {
      const fv = f.querySelector('.fv');
      if (fv && !fv.querySelector('input')) fv.innerHTML = '<input data-key="' + keys[i] + '" value="' + String(data[keys[i]] || '').replace(/"/g, '&quot;') + '" style="width:100%;background:var(--panel-2);border:1px solid var(--border);color:var(--txt-0);border-radius:8px;padding:8px 10px;font-size:13px">';
    });
    if (!settingsBound) {
      settingsBound = true;
      const saveBtn = qa('#page-setting button').find((b) => /保存/.test(b.textContent));
      if (saveBtn) { saveBtn.onclick = null; saveBtn.addEventListener('click', saveSettings); }
    }
  }
  async function saveSettings() {
    const body = {}; qa('#page-setting input[data-key]').forEach((inp) => body[inp.dataset.key] = inp.value);
    const r = await apiPut('/settings', body);
    if (r.data) showToast('参数已保存'); else showToast('保存失败');
  }

  /* ---------- 引擎：企业画像 ---------- */
  async function renderEngineProfile() {
    const page = el('page-engine-profile');
    const { data } = await apiGet('/profileTags');
    const tb = page.querySelector('table tbody'); if (!tb) return;
    const stColor = { '正常': 'sb-success', '优化中': 'sb-running', '待复核': 'sb-aging' };
    tb.innerHTML = data.map((t) => '<tr><td>' + fmt(t.dim) + '</td><td>' + fmt(t.method) + '</td><td>' + fmt(t.basis) + '</td><td>' + fmt(t.count) + '</td><td>' + fmt(t.accuracy) + '</td><td><span class="status-badge ' + (stColor[t.status] || 'sb-normal') + '"><span class="sb-dot"></span>' + fmt(t.status) + '</span></td></tr>').join('');
    const btn = Array.from(page.querySelectorAll('button')).find((b) => /批量生成/.test(b.textContent));
    if (btn) btn.onclick = async () => { const r = await apiPost('/engine/profile/build'); if (r.data) { showToast('画像批量生成任务已启动'); renderEngineProfile(); } };
  }

  /* ---------- 引擎：招商评分 ---------- */
  async function renderEngineScore() {
    const page = el('page-engine-score');
    const w = (await apiGet('/scoreWeights'))[0] || {};
    bindWeightRows(page, w);
    const saveBtn = Array.from(page.querySelectorAll('button')).find((b) => /保存配置/.test(b.textContent));
    if (saveBtn) saveBtn.onclick = async () => {
      const body = {}; page.querySelectorAll('.weight-row').forEach((r) => { body[r.querySelector('.wr-name').textContent.trim()] = Number(r.querySelector('.wr-slider').value); });
      await apiPut('/scoreWeights', body); showToast('权重已保存，正在重算评分…');
      await apiPost('/engine/score/recompute'); renderScoreTable();
    };
    renderScoreTable();
  }
  async function renderScoreTable() {
    const page = el('page-engine-score');
    let { data } = await apiGet('/scores');
    if (!data || !data.length) { data = (await apiPost('/engine/score/recompute')).data || []; }
    const tb = page.querySelector('table tbody'); if (!tb) return;
    const lvColor = { 'A类': 'sb-success', 'B类': 'sb-aging', 'C类': 'sb-normal', '待分析': 'sb-normal' };
    tb.innerHTML = data.map((s) => '<tr><td>' + fmt(s.company) + '</td><td style="color:var(--dh-red-2);font-weight:700">' + (s.score == null ? '<span style="color:var(--txt-3)">待分析</span>' : s.score) + '</td><td>' + fmt(s.modelVer) + '</td><td>' + fmt(s.ruleVer) + '</td><td>' + fmt(s.time) + '</td><td><span class="status-badge ' + (lvColor[s.level] || 'sb-normal') + '"><span class="sb-dot"></span>' + fmt(s.level) + '</span></td></tr>').join('');
    renderScoreDist(data);
  }
  function renderScoreDist(data) {
    const page = el('page-engine-score'); if (!page) return;
    let sec = el('scoreDistSec');
    if (!sec) {
      const titles = page.querySelectorAll('.section-title');
      let anchor = null;
      titles.forEach((t) => { const h = t.querySelector('h3'); if (h && /评分历史留痕/.test(h.textContent)) anchor = t; });
      sec = document.createElement('div'); sec.id = 'scoreDistSec';
      if (anchor) anchor.insertAdjacentElement('beforebegin', sec); else page.appendChild(sec);
    }
    const a = data.filter((x) => x.level === 'A类').length;
    const b = data.filter((x) => x.level === 'B类').length;
    const c = data.filter((x) => x.level === 'C类').length;
    const p = data.filter((x) => x.level === '待分析' || x.score == null).length;
    const total = data.length || 1;
    const segs = [{ v: a, c: '#dc2626', l: 'A类' }, { v: b, c: '#f59e0b', l: 'B类' }, { v: c, c: '#64748b', l: 'C类' }, { v: p, c: '#334155', l: '待分析' }].filter((s) => s.v > 0);
    const C = 2 * Math.PI * 70; let off = 0;
    const arcs = segs.map((s) => { const len = s.v / total * C; const dash = C - len; const arc = '<circle cx="100" cy="100" r="70" fill="none" stroke="' + s.c + '" stroke-width="26" stroke-dasharray="' + len.toFixed(2) + ' ' + dash.toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 100 100)"/>'; off += len; return arc; }).join('');
    const scored = data.filter((x) => x.score != null).map((x) => x.score);
    const avg = scored.length ? Math.round(scored.reduce((s, x) => s + x, 0) / scored.length) : 0;
    const maxv = Math.max(a, b, c, p, 1);
    const bars = segs.map((s) => '<div style="display:flex;align-items:center;gap:8px;margin:6px 0"><span style="width:52px;font-size:12px;color:var(--txt-2)">' + s.l + '</span><div style="flex:1;height:14px;background:var(--border,#e5e9f2);border-radius:7px;overflow:hidden"><i style="display:block;height:100%;width:' + (s.v / maxv * 100).toFixed(1) + '%;background:' + s.c + '"></i></div><span style="width:28px;text-align:right;font-size:12px;font-weight:700">' + s.v + '</span></div>').join('');
    sec.innerHTML = '<div class="section-title"><h3>评分等级分布</h3><span class="tag">实时统计</span><div class="line"></div></div>' +
      '<div class="card" style="margin-bottom:18px;display:flex;gap:24px;align-items:center;flex-wrap:wrap">' +
      '<svg viewBox="0 0 200 200" style="width:180px;height:180px;flex:0 0 auto">' + arcs +
      '<text x="100" y="94" text-anchor="middle" fill="var(--txt-3,#888)" font-size="12">参评企业</text>' +
      '<text x="100" y="120" text-anchor="middle" fill="var(--dh-red-2,#dc2626)" font-size="26" font-weight="800">' + (a + b + c) + '</text></svg>' +
      '<div style="flex:1;min-width:240px">' +
      '<div style="font-size:12px;color:var(--txt-3);margin-bottom:8px">A类（≥85）重点对接 · B类（75-84）跟踪 · C类（60-74）观察 · 待分析需补全评分维度</div>' +
      bars +
      '<div style="margin-top:10px;font-size:13px;color:var(--txt-2)">平均分 <b style="color:var(--dh-red-2)">' + avg + '</b> · 待分析 <b>' + p + '</b> 家</div>' +
      '</div></div>';
  }

  /* ---------- 引擎：机会信号 ---------- */
  async function renderEngineSignal() {
    const page = el('page-engine-signal');
    const w = (await apiGet('/signalWeights'))[0] || {};
    bindWeightRows(page, w);
    const saveBtn = Array.from(page.querySelectorAll('button')).find((b) => /保存配置/.test(b.textContent));
    if (saveBtn) saveBtn.onclick = async () => {
      const body = {}; page.querySelectorAll('.weight-row').forEach((r) => { body[r.querySelector('.wr-name').textContent.trim()] = Number(r.querySelector('.wr-slider').value); });
      await apiPut('/signalWeights', body); showToast('信号权重已保存，正在扫描…');
      await apiPost('/engine/signal/scan'); renderSignalTable();
    };
    renderSignalTable();
  }
  async function renderSignalTable() {
    const page = el('page-engine-signal');
    let { data } = await apiGet('/signals');
    if (!data || !data.length) { data = (await apiPost('/engine/signal/scan')).data || []; }
    const tb = page.querySelector('table tbody'); if (!tb) return;
    const stColor = { '已推荐': 'sb-success', '待定': 'sb-aging', '观察': 'sb-normal' };
    tb.innerHTML = data.map((s) => '<tr><td>' + fmt(s.company) + '</td><td>' + fmt(s.types) + '</td><td style="color:var(--dh-red-2);font-weight:700">' + s.score + '</td><td>' + fmt(s.reason) + '</td><td><span class="status-badge ' + (stColor[s.status] || 'sb-normal') + '"><span class="sb-dot"></span>' + fmt(s.status) + '</span></td><td><button class="btn btn-ghost btn-sm" onclick="ZS.markSignal(' + s.id + ')">查看</button></td></tr>').join('');
  }

  function bindWeightRows(page, w) {
    page.querySelectorAll('.weight-row').forEach((row) => {
      const key = row.querySelector('.wr-name').textContent.trim();
      const slider = row.querySelector('.wr-slider');
      const max = Number(slider.max) || 100;
      const val = Number(w[key]) || 0;
      slider.value = val;
      row.querySelector('.wr-val').textContent = val;
      const bar = row.querySelector('.wr-bar i');
      if (bar) bar.style.width = (val / max * 100) + '%';
      slider.oninput = function () { row.querySelector('.wr-val').textContent = slider.value; if (bar) bar.style.width = (slider.value / max * 100) + '%'; };
    });
  }
  window.ZS.markSignal = async function (id) {
    const r = await apiPut('/signals/' + id, { status: '已推荐' });
    if (r.data) { showToast('已标记为推荐'); renderEngineSignal(); }
  };

  /* ---------- 引擎：产业分析 ---------- */
  async function renderEngineIndustry() {
    const page = el('page-engine-industry');
    const { data: ins } = await apiGet('/industryInsights');
    const fl = page.querySelector('.field-list');
    if (fl) fl.innerHTML = (ins.length ? ins.map((t) => '<div class="field"><span class="fk">' + fmt(t.industry) + '</span><span class="fv">' + fmt(t.trend) + '</span> <button class="btn btn-ghost btn-sm" onclick="ZS.edit(\'industryInsights\',' + t.id + ')">编辑</button></div>').join('') : '<div style="color:var(--txt-3);padding:8px">暂无产业趋势数据</div>');
    // 在“产业趋势分析”标题处挂一个“新增”按钮
    const titles = page.querySelectorAll('.section-title');
    titles.forEach((t) => {
      if (/产业趋势分析/.test(t.textContent) && !t.dataset.zsAdd) {
        t.dataset.zsAdd = '1';
        const btn = document.createElement('button'); btn.className = 'btn btn-blue btn-sm'; btn.textContent = '+ 新增分析';
        btn.style.marginLeft = '10px';
        btn.onclick = () => openCrud('page-engine-industry', 'industryInsights', null);
        t.appendChild(btn);
      }
    });
    const svg = el('chainChart');
    if (svg) {
      const nodes = ['上游材料', '中游电芯制造', '下游储能/动力', '薄弱环节:正极材料'];
      let html = '<line x1="80" y1="90" x2="240" y2="90" stroke="#1e40af" stroke-width="2"/><line x1="240" y1="90" x2="400" y2="90" stroke="#1e40af" stroke-width="2"/><line x1="240" y1="90" x2="240" y2="160" stroke="#dc2626" stroke-width="2" stroke-dasharray="4"/>';
      const pos = [[80, 90], [240, 90], [400, 90], [240, 160]];
      nodes.forEach((n, i) => { const [x, y] = pos[i]; const col = i === 3 ? '#dc2626' : '#1e40af'; html += '<circle cx="' + x + '" cy="' + y + '" r="6" fill="' + col + '"/><text x="' + x + '" y="' + (y - 14) + '" text-anchor="middle" fill="#475569" font-size="11">' + n + '</text>'; });
      svg.innerHTML = html;
    }
  }

  /* ---------- 知识库 ---------- */
  let kbQuery = '';
  async function renderKb() {
    const page = el('page-kb');
    const { data } = await apiGet('/knowledge');
    // 检索框
    const input = el('kbSearch');
    const searchBtn = Array.from(page.querySelectorAll('button')).find((b) => /检索/.test(b.textContent));
    const doSearch = () => { kbQuery = (input.value || '').trim(); renderKbList(data); };
    if (input) input.oninput = doSearch;
    if (searchBtn) searchBtn.onclick = doSearch;
    // 用 DeepSeek 生成知识
    if (searchBtn && !searchBtn.dataset.zsGen) {
      searchBtn.dataset.zsGen = '1';
      const genBtn = document.createElement('button');
      genBtn.className = 'btn btn-blue btn-sm'; genBtn.textContent = '用DeepSeek生成'; genBtn.style.marginLeft = '8px';
      genBtn.onclick = async () => {
        const topic = prompt('请输入要生成知识的主题（如：钠离子电池产业）'); if (!topic) return;
        let type = prompt('知识类型：企业 / 产业 / 案例 / 政策（默认 产业）', '产业'); type = (type || '产业').trim() || '产业';
        showToast('正在用DeepSeek生成知识「' + topic + '」…');
        const r = await apiPost('/knowledge/generate', { topic, type });
        if (r.data) { showToast('已生成并进入待审核（ID ' + r.data.id + '）：' + r.data.title + ' —— 可在「知识审核」页处理'); renderKb(); } else showToast('生成失败');
      };
      searchBtn.insertAdjacentElement('afterend', genBtn);
    }
    // 列表容器
    let list = el('kbList');
    if (!list) {
      const secs = page.querySelectorAll('.section-title');
      list = document.createElement('div'); list.id = 'kbList';
      secs[0].nextElementSibling.insertAdjacentElement('afterend', list);
    }
    renderKbList(data);
    // 图谱
    const svg = el('kbGraph');
    if (svg) {
      const types = ['企业', '产业', '案例', '政策'];
      const counts = {}; types.forEach((t) => counts[t] = data.filter((d) => d.type === t).length);
      const cx = 300, cy = 100; let html = '<circle cx="' + cx + '" cy="' + cy + '" r="34" fill="rgba(30,64,175,.25)" stroke="#1e40af" stroke-width="2"/><text x="' + cx + '" y="' + (cy + 4) + '" text-anchor="middle" fill="#475569" font-size="12">知识库</text>';
      types.forEach((t, i) => { const ang = -Math.PI / 2 + i * Math.PI / 2; const x = cx + 200 * Math.cos(ang), y = cy + 70 * Math.sin(ang); html += '<line x1="' + cx + '" y1="' + cy + '" x2="' + x + '" y2="' + y + '" stroke="#475569" stroke-width="1.5"/><circle cx="' + x + '" cy="' + y + '" r="22" fill="rgba(139,92,246,.2)" stroke="#a78bfa" stroke-width="1.5"/><text x="' + x + '" y="' + (y + 4) + '" text-anchor="middle" fill="#475569" font-size="10">' + t + ' ' + counts[t] + '</text>'; });
      svg.innerHTML = html;
    }
  }
  function renderKbList(data) {
    const list = el('kbList'); if (!list) return;
    const filtered = kbQuery ? data.filter((d) => (d.title + ' ' + (d.content || '')).indexOf(kbQuery) >= 0) : data;
    const stColor = { '待审核': 'sb-aging', '已通过': 'sb-success', '已退回': 'sb-fail' };
    list.innerHTML = '<div style="margin:4px 0 12px;font-size:12px;color:var(--txt-3)">共 ' + filtered.length + ' 条知识' + (kbQuery ? '（匹配“' + kbQuery + '”）' : '') + '</div>' + (filtered.length ? filtered.map((d) => '<div class="review-item"><div class="ri-info"><div class="ri-cat">' + fmt(d.type) + '知识库 · ' + fmt(d.source) + '</div><div class="ri-title">' + fmt(d.title) + '</div><div class="ri-summary">' + fmt(d.content) + '</div></div><div class="ri-actions"><span class="status-badge ' + (stColor[d.status] || 'sb-normal') + '"><span class="sb-dot"></span>' + (d.status === '已通过' ? '已发布' : fmt(d.status)) + (d.status === '已通过' && d.publishedAt ? ' · ' + d.publishedAt : '') + '</span> <button class="btn btn-ghost btn-sm" onclick="ZS.edit(\'knowledge\',' + d.id + ')">编辑</button></div></div>').join('') : '<div style="color:var(--txt-3);padding:16px">无匹配结果</div>');
  }

  /* ---------- 知识审核 ---------- */
  let reviewFilter = 'all';
  let reviewStatus = '待审核';
  async function renderReview() {
    const page = el('page-kb-review');
    const { data } = await apiGet('/knowledge');
    const counts = { all: data.length, 企业: 0, 产业: 0, 案例: 0, 政策: 0 };
    data.forEach((k) => { if (counts[k.type] != null) counts[k.type]++; });
    const labels = ['全部', '企业', '产业', '案例', '政策'];
    const order = ['all', '企业', '产业', '案例', '政策'];
    page.querySelectorAll('.filter-chip').forEach((chip, i) => {
      chip.textContent = labels[i] + ' ' + counts[order[i]];
      chip.onclick = () => { page.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active')); chip.classList.add('active'); reviewFilter = order[i]; renderReviewList(data); };
    });
    // 状态筛选（默认「待审核」——DeepSeek 生成的条目自动进入此队列）
    let sf = el('reviewStatusFilter');
    if (!sf) {
      sf = document.createElement('div'); sf.id = 'reviewStatusFilter'; sf.style.cssText = 'display:flex;gap:8px;margin:14px 0 4px;flex-wrap:wrap';
      const list0 = el('reviewList'); if (list0) list0.insertAdjacentElement('beforebegin', sf);
    }
    const stCounts = { 待审核: 0, 已通过: 0, 已退回: 0 };
    data.forEach((k) => { if (stCounts[k.status] != null) stCounts[k.status]++; });
    const stOpts = [['待审核', stCounts['待审核']], ['已通过', stCounts['已通过']], ['已退回', stCounts['已退回']], ['全部', data.length]];
    sf.innerHTML = stOpts.map((o) => '<span class="filter-chip' + (reviewStatus === o[0] ? ' active' : '') + '" data-st="' + o[0] + '" style="cursor:pointer">' + o[0] + ' ' + o[1] + '</span>').join('');
    sf.querySelectorAll('.filter-chip').forEach((chip) => { chip.onclick = () => { reviewStatus = chip.dataset.st; sf.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active')); chip.classList.add('active'); renderReviewList(data); }; });
    renderReviewList(data);
  }
  function renderReviewList(data) {
    const list = el('reviewList'); if (!list) return;
    let filtered = reviewFilter === 'all' ? data : data.filter((d) => d.type === reviewFilter);
    if (reviewStatus !== '全部') filtered = filtered.filter((d) => d.status === reviewStatus);
    const aiTag = (d) => d.source === 'DeepSeek摘要' ? ' <span style="display:inline-block;margin-left:6px;padding:1px 7px;border-radius:10px;font-size:11px;background:rgba(30,64,175,.25);color:#2563eb;border:1px solid #1e40af">AI生成</span>' : '';
    list.innerHTML = filtered.length ? filtered.map((d) => '<div class="review-item"' + (d.source === 'DeepSeek摘要' ? ' style="border-left:3px solid #1e40af"' : '') + '>' + (d.source === 'DeepSeek摘要' ? '<div style="font-size:11px;color:#2563eb;margin-bottom:4px">⚡ AI 生成 · 待人工审核</div>' : '') + '<div class="ri-info"><div class="ri-cat">' + fmt(d.type) + '知识库 · ' + fmt(d.source) + aiTag(d) + '</div><div class="ri-title">' + fmt(d.title) + '</div><div class="ri-summary">' + fmt(d.content) + '</div></div><div class="ri-actions"><button class="btn btn-green btn-sm" onclick="ZS.review(' + d.id + ',\'已通过\')">通过</button> <button class="btn btn-red btn-sm" onclick="ZS.review(' + d.id + ',\'已退回\')">驳回</button> <button class="btn btn-ghost btn-sm" onclick="ZS.edit(\'knowledge\',' + d.id + ')">编辑</button></div></div>').join('') : '<div style="color:var(--txt-3);padding:16px">该条件下暂无待处理知识</div>';
  }
  window.ZS.review = async function (id, status) {
    const r = await apiPut('/knowledge/' + id, { status, reviewer: (USER && USER.name) || '管理员', time: new Date().toISOString().slice(0, 16).replace('T', ' ') });
    if (r.data) { showToast(status === '已通过' ? '已通过审核' : '已驳回'); renderReview(); }
  };

  /* ---------- AI 模型 ---------- */
  async function renderModel() {
    const page = el('page-model');
    const { data } = await apiGet('/models');
    const tb = page.querySelector('table tbody'); if (!tb) return;
    const roleColor = { '主模型': 'sb-success', '备模型': 'sb-normal', '运行中': 'sb-success' };
    tb.innerHTML = data.map((m) => '<tr><td>' + fmt(m.name) + '</td><td>' + fmt(m.type) + '</td><td>' + fmt(m.version) + '</td><td><span class="status-badge ' + (roleColor[m.role] || 'sb-normal') + '"><span class="sb-dot"></span>' + fmt(m.role) + '</span></td><td>' + fmt(m.accuracy) + '</td><td>' + fmt(m.samples) + '</td><td>' + (m.role === '备模型' ? '<button class="btn btn-blue btn-sm" onclick="ZS.switchModel(' + m.id + ')">切换为主</button> ' : '') + '<button class="btn btn-ghost btn-sm" onclick="showToast(\'版本对比\')">版本对比</button></td></tr>').join('');
    const trainBtn = Array.from(page.querySelectorAll('button')).find((b) => /发起训练任务/.test(b.textContent));
    if (trainBtn) trainBtn.onclick = async () => {
      showToast('正在基于现有企业/信号数据校准模型…');
      const primary = data.find((x) => x.role === '主模型') || data[0];
      const r = await apiPost('/models/calibrate', { id: primary.id });
      if (r.data) { showToast('校准完成：覆盖' + r.metrics.coverage + ' / 命中' + r.metrics.hitRate + ' / 样本' + r.metrics.samples); renderModel(); } else showToast('校准失败');
    };
  }
  window.ZS.switchModel = async function (id) {
    const { data } = await apiGet('/models');
    const target = data.find((x) => x.id === id); if (!target) return;
    for (const m of data) { if (m.name === target.name) { await apiPut('/models/' + m.id, { role: m.id === id ? '主模型' : '备模型' }); } }
    showToast('已切换 ' + target.name + ' 为主模型'); renderModel();
  };

  /* ---------- 规则配置 ---------- */
  async function renderRule() {
    const page = el('page-rule');
    const { data } = await apiGet('/prompts');
    const tb = page.querySelector('table tbody'); if (!tb) return;
    tb.innerHTML = data.map((p) => '<tr><td>' + fmt(p.name) + '</td><td>' + fmt(p.version) + '</td><td>' + fmt(p.date) + '</td><td><span class="status-badge sb-success"><span class="sb-dot"></span>' + fmt(p.status) + '</span></td><td><button class="btn btn-ghost btn-sm" onclick="ZS.edit(\'prompts\',' + p.id + ')">编辑</button> <button class="btn btn-blue btn-sm" onclick="showToast(\'版本对比\')">版本对比</button></td></tr>').join('');
    await bindToggles('page-rule', 'costConfig');
  }
  async function bindToggles(pageId, resName) {
    const page = el(pageId);
    const cfg = (await apiGet('/' + resName))[0] || { items: [] };
    const toggles = page.querySelectorAll('.toggle');
    toggles.forEach((tg, i) => {
      const it = cfg.items[i]; if (!it) return;
      tg.classList.toggle('on', !!it.on);
      tg.onclick = () => { it.on = !it.on; tg.classList.toggle('on', it.on); apiPut('/' + resName, cfg); };
    });
  }

  /* ---------- 审计日志（3栏） ---------- */
  async function renderAudit() {
    const ops = (await apiGet('/auditOps')).data || [];
    const dts = (await apiGet('/auditData')).data || [];
    const apis = (await apiGet('/auditApi')).data || [];
    const opColor = { '系统告警': 'warn', '报告导出': 'success' };
    const opBox = el('log-op');
    if (opBox) opBox.innerHTML = '<div class="card">' + ops.map((l) => '<div class="log-line ' + (opColor[l.tag] || 'success') + '"><span class="lt">' + l.time + '</span><span class="lm">' + l.text + '</span><span class="status-badge sb-normal">' + l.tag + '</span></div>').join('') + '</div>';
    const dtBox = el('log-data');
    if (dtBox) dtBox.innerHTML = '<div class="card">' + dts.map((l) => '<div class="log-line success"><span class="lt">' + l.time + '</span><span class="lm">' + l.text + '</span><span class="status-badge sb-' + (l.tag === '评分更新' ? 'success' : l.tag === '画像更新' ? 'aging' : 'new') + '">' + l.tag + '</span></div>').join('') + '</div>';
    const aiBox = el('log-ai');
    if (aiBox) { const tb = aiBox.querySelector('tbody'); if (tb) tb.innerHTML = apis.map((l) => '<tr><td>' + l.time + '</td><td>' + fmt(l.scene) + '</td><td>' + fmt(l.model) + '</td><td>' + fmt(l.inTok) + '</td><td>' + fmt(l.outTok) + '</td><td>' + fmt(l.cost) + '</td><td>' + fmt(l.money) + '</td><td><span class="status-badge sb-' + (l.status === '成功' ? 'success' : l.status === '缓存' ? 'normal' : 'fail') + '"><span class="sb-dot"></span>' + l.status + '</span></td></tr>').join(''); }
  }

  /* ---------- 数据校验与缓存 ---------- */
  async function renderDataCache() {
    await bindToggles('page-data-cache', 'cacheConfig');
  }

  /* ---------- 接入记录与监控 ---------- */
  async function renderDataLog() {
    const page = el('page-data-log');
    const { data } = await apiGet('/auditApi');
    const tb = page.querySelector('table tbody'); if (!tb) return;
    tb.innerHTML = data.map((l) => '<tr><td>' + l.time + '</td><td>' + fmt(l.scene === '外部API' ? l.text.split('→')[0].replace('外部API查询（', '').replace('）', '') : l.scene) + '</td><td>' + fmt(l.model) + '</td><td>' + fmt(l.inTok) + '</td><td>' + fmt(l.cost) + '</td><td><span class="status-badge sb-' + (l.status === '成功' ? 'success' : 'fail') + '"><span class="sb-dot"></span>' + l.status + '</span></td><td><button class="btn btn-ghost btn-sm" onclick="showToast(\'查看详情\')">查看</button></td></tr>').join('');
  }

  // data-ds 资讯获取（真实 RSS + DeepSeek 摘要）
  async function renderNews() {
    const page = el('page-data-ds'); if (!page) return;
    const { data: stats } = await apiGet('/news/stats');
    const { data: news } = await apiGet('/news');
    el('news-total').textContent = stats.totalToday;
    el('news-token').textContent = stats.tokenTotal >= 1000 ? (stats.tokenTotal / 1000).toFixed(1) + 'K' : stats.tokenTotal;
    el('news-cost').textContent = '成本 ¥' + (stats.costTotal || 0).toFixed(2);
    el('news-ai').textContent = stats.aiTotal;
    el('news-cache').textContent = stats.cacheHitTotal;
    el('news-cache-rate').textContent = '累计缓存命中';
    const agg = {};
    news.forEach((n) => { const a = agg[n.cat] || (agg[n.cat] = { source: n.source, count: 0, ai: 0 }); a.count++; if (n.ai) a.ai++; });
    const OFFLINE = [
      { cat: '招投标数据', source: '各省公共资源交易中心', freq: '每日' },
      { cat: '企业官网动态', source: '重点企业官网', freq: '每周' },
    ];
    const rows = Object.keys(agg).map((cat) => { const a = agg[cat]; return newsRow(cat, a.source, a.count, '每日', a.ai, '-', '完成'); });
    OFFLINE.forEach((o) => rows.push(newsRow(o.cat, o.source, 0, o.freq, 0, '-', '待接入')));
    const tb = el('news-tbody'); if (tb) tb.innerHTML = rows.join('') || '<tr><td colspan="7" style="text-align:center;color:var(--txt-3);padding:24px">暂无数据</td></tr>';
  }
  function newsRow(cat, source, count, freq, ai, token, status) {
    const aiBadge = ai > 0 ? '<span class="status-badge sb-success"><span class="sb-dot"></span>已生成(' + ai + ')</span>' : (status === '待接入' ? '-' : '<span class="status-badge sb-normal"><span class="sb-dot"></span>未摘要</span>');
    const st = status === '待接入' ? 'sb-normal' : 'sb-success';
    return '<tr><td>' + cat + '</td><td>' + source + '</td><td>' + count + '</td><td>' + freq + '</td><td>' + aiBadge + '</td><td>' + token + '</td><td><span class="status-badge ' + st + '"><span class="sb-dot"></span>' + status + '</span></td></tr>';
  }
  window.ZS.fetchNews = async function () {
    console.log('[ZS] fetchNews clicked');
    const btn = el('news-fetch-btn'); if (!btn) { console.warn('[ZS] news-fetch-btn not found'); return; }
    const old = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '获取中…';
    try {
      console.log('[ZS] calling /news/fetch');
      const r = await apiPost('/news/fetch', {});
      console.log('[ZS] fetch result', r);
      if (r.success) showToast('真实抓取 ' + r.total + ' 条（新增 ' + (r.total - r.cacheHit) + ' / 缓存 ' + r.cacheHit + ' / AI摘要 ' + r.aiCount + '）');
      else showToast('获取失败' + (r.error ? '：' + r.error : ''));
    } catch (e) { console.error('[ZS] fetch error', e); showToast('获取失败：' + e.message); }
    btn.disabled = false; btn.innerHTML = old;
    renderNews();
  };

  document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && el('loginMask') && el('loginMask').style.display === 'flex' && e.target.tagName === 'INPUT') doLogin(); });

  init();
})();
