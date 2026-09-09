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
    'page-projects': 'projects',
    'page-leads': 'leads',
  };
  let SCHEMA = {}, TOKEN = localStorage.getItem('zs_token') || '', USER = null;
  window.ZS = window.ZS || {};

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
  const escapeHtml = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v) => (v === undefined || v === null || v === '' ? '—' : escapeHtml(v));

  async function init() {
    if (TOKEN) { try { const me = await apiGet('/me'); if (me.user) { USER = me.user; enter(); return; } } catch (e) {} }
    showLogin();
  }
  function showLogin() { document.body.classList.add('auth-pending'); el('loginMask').style.display = 'flex'; }
  function hideLogin() { document.body.classList.remove('auth-pending'); el('loginMask').style.display = 'none'; }
  async function doLogin() {
    const u = el('loginUser').value.trim(), p = el('loginPass').value;
    if (!u || !p) { showToast('请输入账号和密码'); return; }
    const r = await apiPost('/login', { username: u, password: p });
    if (r.token) { TOKEN = r.token; localStorage.setItem('zs_token', TOKEN); USER = r.user; el('loginUser').value = ''; el('loginPass').value = ''; hideLogin(); enter(); }
    else showToast(r.error || '登录失败');
  }

  function enter() {
    hideLogin();
    setupMobileNav();
    setupCreateBtns();
    setupAcceptanceActions();
    bindNav();
    apiGet('/schema').then((s) => { SCHEMA = s.schema; renderCurrent(); }).catch(() => renderCurrent());
    loadMessages();
    loadDeepseekBalance();
  }
  /* DeepSeek 实时余额（顶栏动态显示，充值后刷新即最新） */
  async function loadDeepseekBalance() {
    const tag = el('dsBalanceTag'); if (!tag) return;
    try {
      const r = await apiGet('/deepseek/balance');
      if (!r.hasKey) {
        tag.innerHTML = '<span class="dot"></span>DeepSeek API 未配置';
        tag.style.borderColor = 'rgba(245,158,11,.4)'; tag.style.color = '#b45309'; tag.style.background = 'rgba(245,158,11,.1)';
        return;
      }
      if (r.isAvailable) {
        tag.innerHTML = '<span class="dot"></span>DeepSeek API 正常 · 余额 ¥' + (r.balance || '0');
        tag.style.borderColor = ''; tag.style.color = ''; tag.style.background = '';
      } else {
        const bal = (r.balance !== null && r.balance !== undefined) ? ('¥' + r.balance) : '不可用';
        tag.innerHTML = '<span class="dot"></span>DeepSeek 欠费 · 余额 ' + bal;
        tag.style.borderColor = 'rgba(220,38,38,.45)'; tag.style.color = '#dc2626'; tag.style.background = 'rgba(220,38,38,.08)';
        const dot = tag.querySelector('.dot'); if (dot) dot.style.background = '#dc2626';
      }
    } catch (e) { tag.textContent = 'DeepSeek 余额查询失败'; }
  }
  function setupMobileNav() {
    if (el('mobileMenuBtn')) return;
    const header = q('.topbar') || q('header');
    const sidebar = q('.sidebar');
    if (!header || !sidebar) return;
    const button = document.createElement('button');
    button.id = 'mobileMenuBtn'; button.type = 'button'; button.className = 'mobile-menu-btn';
    button.setAttribute('aria-label', '打开导航菜单'); button.textContent = '☰';
    button.onclick = () => sidebar.classList.toggle('mobile-open');
    header.insertBefore(button, header.firstChild);
    qa('.nav-item').forEach((item) => item.addEventListener('click', () => sidebar.classList.remove('mobile-open')));
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
  function setupAcceptanceActions() {
    const syncBtn=el('qccChangesBtn');
    if(syncBtn){syncBtn.onclick=()=>el('qccQueryPanel')?.scrollIntoView({behavior:'smooth'});}
    for(const pageId of ['page-push-config','page-workmgr-config']) qa('#'+pageId+' button').filter(button=>/保存配置/.test(button.textContent)).forEach(button=>{button.onclick=null;button.addEventListener('click',()=>showToast('该页配置通过每行“编辑”保存，当前数据已持久化'));});
  }
  function renderCurrent() {
    const p = q('.page.active'); if (!p) return; const pid = p.id;
    if (pid === 'page-data-ds') return renderNews();
    if (pid === 'page-bid-config') return renderBidConfig();
    if (pid === 'page-leads') return renderLeads();
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

  /* ---------- 客商线索：分配、阶段、跟进记录、到期提醒与导出 ---------- */
  let leadFilter = '全部';
  async function renderLeads() {
    const page = el('page-leads');
    const [{ data }, { data: users }, { data: stages }] = await Promise.all([apiGet('/leads'), apiGet('/users'), apiGet('/workStages')]);
    const rows = (data || []).filter((lead) => leadFilter === '全部' || (lead.status || '新线索') === leadFilter);
    let controls = el('leadControls');
    if (!controls) {
      controls = document.createElement('div'); controls.id = 'leadControls'; controls.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:12px 0';
      page.querySelector('.section-title').insertAdjacentElement('afterend', controls);
    }
    controls.innerHTML = '<label style="font-size:12px;color:var(--txt-3)">状态筛选 <select id="leadFilter" style="margin-left:6px"><option>全部</option><option>新线索</option><option>已联系</option><option>已转化</option><option>无效</option></select></label><span class="tag">共 '+data.length+' 条 · 当前 '+rows.length+' 条</span><button class="btn btn-ghost btn-sm" id="exportLeadsBtn">导出线索与跟进记录</button>';
    el('leadFilter').value=leadFilter;el('leadFilter').onchange=(event)=>{leadFilter=event.target.value;renderLeads();};
    el('exportLeadsBtn').onclick=()=>downloadAuthenticated('/leads/export','客商线索与跟进记录.xlsx');
    const tb=page.querySelector('tbody'),head=page.querySelector('thead tr');
    head.innerHTML='<th>企业 / 联系人</th><th>联系方式</th><th>意向与匹配项目</th><th>负责人</th><th>阶段</th><th>状态</th><th>下次跟进</th><th>操作</th>';
    const overdue=(value)=>value&&Date.parse(value)<Date.now();
    tb.innerHTML=rows.length?rows.map((lead)=>'<tr><td><b>'+fmt(lead.company||'未填写企业')+'</b><br><span style="color:var(--txt-3)">'+fmt(lead.name)+'</span></td><td>'+fmt(lead.phone)+(lead.email?'<br>'+fmt(lead.email):'')+'</td><td>'+fmt(lead.intention)+'<br><span style="color:var(--txt-3)">'+fmt(lead.matchedProjects)+'</span></td><td>'+fmt(lead.assignee||'未分配')+'</td><td>'+fmt(lead.stage||'初次接触')+'</td><td><span class="status-badge '+((lead.status==='已转化')?'sb-success':lead.status==='无效'?'sb-fail':lead.status==='已联系'?'sb-aging':'sb-new')+'"><span class="sb-dot"></span>'+fmt(lead.status||'新线索')+'</span></td><td '+(overdue(lead.nextFollowAt)?'style="color:var(--dh-red-2);font-weight:700"':'')+'>'+fmt(lead.nextFollowAt)+'</td><td><button class="btn btn-blue btn-sm" onclick="ZS.followLead('+lead.id+')">记录跟进</button> <button class="btn btn-ghost btn-sm" onclick="ZS.edit(\'leads\','+lead.id+')">编辑资料</button></td></tr>').join(''):'<tr><td colspan="8" style="text-align:center;color:var(--txt-3);padding:24px">当前筛选下暂无线索</td></tr>';
    window.__leadWorkflow={users:(users||[]).filter(user=>user.status==='启用'),stages:(stages||[]).filter(stage=>stage.status==='启用'),leads:data||[]};
  }
  async function downloadAuthenticated(path,filename) {
    const a=document.createElement('a');a.href=API+path;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  }
  window.ZS.followLead=async function(id){
    const state=window.__leadWorkflow||{users:[],stages:[],leads:[]},lead=state.leads.find(item=>item.id===id);if(!lead)return;
    const history=(await apiGet('/leads/'+id+'/followups')).data||[];
    const option=(value,label,current)=>'<option value="'+escapeHtml(value)+'"'+(value===current?' selected':'')+'>'+escapeHtml(label)+'</option>';
    const historyHtml=history.length?history.map(item=>'<div class="review-item"><div class="ri-info"><div class="ri-cat">'+fmt(item.createdAt)+' · '+fmt(item.actorName)+'</div><div class="ri-title">'+fmt(item.stage)+' / '+fmt(item.status)+'</div><div class="ri-summary">'+fmt(item.note)+'</div></div></div>').join(''):'<div style="color:var(--txt-3);padding:8px 0">暂无跟进记录</div>';
    showResultModal('记录跟进 · '+(lead.company||lead.name),'<div class="form-row"><label>负责人账号</label><select id="followAssignee"><option value="">未分配</option>'+state.users.map(user=>option(user.username,user.name+'（'+user.username+'）',lead.assignee||'')).join('')+'</select></div><div class="form-row"><label>优先级</label><select id="followPriority">'+['高','中','低'].map(value=>option(value,value,lead.priority||'中')).join('')+'</select></div><div class="form-row"><label>跟进阶段</label><select id="followStage">'+state.stages.map(stage=>option(stage.name,stage.name,lead.stage||'初次接触')).join('')+'</select></div><div class="form-row"><label>跟进状态</label><select id="followStatus">'+['新线索','已联系','已转化','无效'].map(value=>option(value,value,lead.status||'新线索')).join('')+'</select></div><div class="form-row"><label>下次跟进</label><input id="followNext" type="datetime-local" value="'+escapeHtml(String(lead.nextFollowAt||'').slice(0,16))+'"></div><div class="form-row"><label>本次记录 *</label><textarea id="followNote" rows="4" maxlength="1000"></textarea></div><button class="btn btn-blue" id="saveFollowBtn">保存跟进记录</button><div style="margin-top:18px;font-weight:700">历史记录（只追加、不删除）</div>'+historyHtml);
    el('saveFollowBtn').onclick=async()=>{const button=el('saveFollowBtn'),note=el('followNote').value.trim();if(!note)return showToast('请填写本次跟进记录');button.disabled=true;const result=await apiPost('/leads/'+id+'/followups',{assignee:el('followAssignee').value,priority:el('followPriority').value,stage:el('followStage').value,status:el('followStatus').value,nextFollowAt:el('followNext').value,note});if(result.data){showToast('跟进记录已保存');el('zsResultModal').style.display='none';await renderLeads();await loadMessages();}else{showToast(result.error||'保存失败');button.disabled=false;}};
  };

  async function renderBidConfig() {
    await renderTable('page-bid-config', 'bidKeywords');
    const page = el('page-bid-config');
    let box = el('bidCollectedBox');
    if (!box) {
      box = document.createElement('div'); box.id = 'bidCollectedBox'; box.style.marginTop = '18px';
      page.appendChild(box);
    }
    const response = await apiGet('/bids'); const rows = response.data || [];
    box.innerHTML = '<div class="section-title"><h3>测试采集结果</h3><span class="tag">公开公告 · 最多保留500条</span><div class="line"></div><button type="button" class="btn btn-red btn-sm" id="collectBidsBtn">立即采集</button></div>' +
      '<div class="table-wrap"><table><thead><tr><th>日期</th><th>类型</th><th>公告标题</th><th>匹配关键词</th><th>来源</th><th>链接</th></tr></thead><tbody>' +
      (rows.length ? rows.slice(0, 100).map((b) => '<tr><td>' + fmt(b.date) + '</td><td>' + fmt(b.noticeType) + '</td><td>' + fmt(b.title) + '</td><td>' + fmt(b.matchedKeywords) + '</td><td>' + fmt(b.source) + '</td><td><a href="' + encodeURI(String(b.url || '')) + '" target="_blank" rel="noopener noreferrer">查看原文</a></td></tr>').join('') : '<tr><td colspan="6" style="text-align:center;color:var(--txt-3);padding:24px">暂无数据，点击“立即采集”获取公开测试公告</td></tr>') + '</tbody></table></div>';
    el('collectBidsBtn').onclick = async () => {
      const btn = el('collectBidsBtn'); btn.disabled = true; btn.textContent = '采集中…';
      try {
        const result = await apiPost('/bids/collect');
        showToast(result.success ? ('采集完成：新增 ' + result.added + ' 条，关键词匹配 ' + result.matched + ' 条') : ('采集失败：' + ((result.errors || []).join('；') || result.error || '来源暂不可用')));
        await renderBidConfig(); await loadMessages();
      } catch (e) { showToast('采集请求失败'); btn.disabled = false; btn.textContent = '立即采集'; }
    };
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
      else { const ty = c.type === 'number' ? 'number' : (c.type === 'password' ? 'password' : 'text'); input = '<input data-key="' + c.key + '" type="' + ty + '" value="' + (ty === 'password' ? '' : String(val).replace(/"/g, '&quot;')) + '"' + (c.required && !item ? ' required' : '') + '>'; }
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
  Object.assign(window.ZS, {
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
  });

  /* ---------- 总览 ---------- */
  async function renderOverview() {
    const s = await apiGet('/stats/overview');
    qa('#page-overview .stat-card .ds-num').forEach((e, i) => {
      const v = [s.kbTotal, s.aiToday, s.cacheHit + '%', s.pendingReview][i];
      e.textContent = v == null ? '—' : (i === 0 ? Number(v).toLocaleString() : v);
    });
    const subs=qa('#page-overview .stat-card .ds-sub');
    if(subs[0]) subs[0].textContent=Object.entries(s.knowledgeByType||{}).map(([type,count])=>type+' '+count).join(' / ')||'暂无知识数据';
    if(subs[1]) subs[1].textContent='Token '+Number(s.aiTokenTotal||0).toLocaleString()+' · 成本 ¥'+Number(s.aiCostTotal||0).toFixed(2);
    if(subs[2]) subs[2].textContent='累计缓存命中 '+Number(s.cacheHitTotal||0).toLocaleString()+' 次';
    if(subs[3]) subs[3].textContent='仅统计真实待审核记录';
    const agentBox=el('overviewAgentStatus');
    if(agentBox) agentBox.innerHTML=(s.agents||[]).map(item=>'<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--panel-2);border-radius:10px"><span class="status-badge sb-success"><span class="sb-dot"></span>'+fmt(item.status)+'</span><span style="flex:1;font-size:13px;color:var(--txt-0)">'+fmt(item.name)+'</span><span style="font-size:11px;color:var(--txt-3)">'+fmt(item.detail)+'</span></div>').join('');
    const activityBox=el('overviewActivities');
    if(activityBox) activityBox.innerHTML=(s.activities||[]).length?(s.activities||[]).map((item,index)=>'<div class="tl-item"><div class="tl-dot '+(['green','blue','gold'][index%3])+'"></div><div class="tl-date">'+fmt(item.time)+(item.isSample?' · 初始样例':'')+'</div><div class="tl-title">'+fmt(item.title)+'</div><div class="tl-desc">'+fmt(item.detail)+'</div></div>').join(''):'<div style="color:var(--txt-3);padding:12px">暂无系统活动</div>';
    drawOverviewReal(s.trend1||[], s.trend2||[], s.trendDays||[]);
  }
  function drawOverviewReal(d1, d2, days) {
    const svg = el('overviewChart'); if (!svg) return;
    const w = 400, h = 180; days=(days||[]).map(day=>String(day).slice(5));
    if(!d1.length){svg.innerHTML='<text x="200" y="90" text-anchor="middle" fill="#64748b" font-size="12">暂无趋势数据</text>';return;}
    const max1 = Math.max(1,Math.max.apply(null, d1)), max2 = Math.max(1,Math.max.apply(null, d2));
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
    const sources=await Promise.all(data.map(async item=>{
      const source=String(item.name||'').replace(/\s*API.*$/i,'').trim();
      const status=await apiPost('/external/test',{source});
      return {...item,source,configured:!!status.configured};
    }));
    const grid = q('#page-data-api .grid-3'); if (!grid) return;
    grid.innerHTML = sources.map((a) => {
      const state=a.configured?'已配置':'待接入客户 API';
      return '<div class="card"><div class="card-head"><div class="card-title">' + fmt(a.name) + '</div><span class="status-badge ' + (a.configured?'sb-success':'sb-normal') + '"><span class="sb-dot"></span>' + state + '</span></div><div class="field-list"><div class="field"><span class="fk">今日调用</span><span class="fv">—</span></div><div class="field"><span class="fk">剩余额度</span><span class="fv">—</span></div><div class="field"><span class="fk">获取内容</span><span class="fv">' + fmt(a.content) + '</span></div></div><div style="margin-top:10px"><button class="btn btn-ghost btn-sm" data-test="' + fmt(a.source) + '">检查配置</button></div></div>';
    }).join('');
    grid.querySelectorAll('[data-test]').forEach((btn) => { btn.onclick = async () => { const r = await apiPost('/external/test', { source: btn.dataset.test }); showToast(btn.dataset.test + (r.configured ? '：已配置访问凭据' : '：待接入客户正式 API')); }; });
    const page = el('page-data-api');
    let testBar = el('companyTestImportBar');
    if (!testBar) {
      testBar = document.createElement('div'); testBar.id = 'companyTestImportBar'; testBar.style.margin = '14px 0';
      testBar.innerHTML = '<button type="button" class="btn btn-blue btn-sm" id="importCompanyTestBtn">导入公开企业测试数据</button> <span style="font-size:12px;color:var(--txt-3)">用于联调；正式上线替换为客户授权 API</span>';
      grid.parentNode.insertBefore(testBar, grid.nextSibling);
      el('importCompanyTestBtn').onclick = async () => {
        const btn = el('importCompanyTestBtn'); btn.disabled = true; btn.textContent = '导入中…';
        const r = await apiPost('/external/company/import-test');
        showToast(r.success ? ('已导入 ' + r.total + ' 条：新增 ' + r.added + '，更新 ' + r.updated) : (r.error || '导入失败'));
        btn.disabled = false; btn.textContent = '导入公开企业测试数据';
      };
    }
    const syncBtn = el('qccChangesBtn');
    if (syncBtn) { syncBtn.textContent='按需查询变更'; syncBtn.onclick = () => { el('qccQueryPanel')?.scrollIntoView({behavior:'smooth'}); showToast('请选择企业基础服务中的工商变更工具；不会自动批量调用'); }; }
    const syncBody=page.querySelector('.section-title + .table-wrap tbody');
    if(syncBody) syncBody.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--txt-3);padding:24px">未启用自动批量同步；请使用企查查按需查询。</td></tr>';
    renderQccQuery(page);
  }

  function renderQccQuery(page) {
    if (el('qccQueryPanel')) return;
    const panel=document.createElement('section'); panel.id='qccQueryPanel';panel.className='card';panel.style.margin='16px 0';
    panel.innerHTML='<h3>企查查 · 按需查询</h3><p style="color:var(--txt-3)">查询可能消耗企查查积分，不自动批量调用。先用企业检索确认主体，再用企业全称或统一社会信用代码查询其他维度。结果不自动计入尽调评分。</p><label>服务 <select data-qcc-group><option value="company">企业基础</option><option value="risk">企业风险</option><option value="ipr">知识产权</option><option value="operation">经营信息</option><option value="executive">董监高</option></select></label> <button class="btn btn-ghost btn-sm" data-qcc-load>连接并加载工具</button><form data-qcc-form hidden><p><label>查询工具 <select data-qcc-tool style="max-width:100%"></select></label></p><p data-qcc-description style="white-space:pre-wrap;font-size:12px;color:var(--txt-3)"></p><div data-qcc-fields style="display:flex;flex-wrap:wrap;gap:12px"></div><p><label><input type="checkbox" data-qcc-confirm required> 我确认本次查询可能消耗企查查积分</label></p><button class="btn btn-blue" type="submit">查询企查查</button></form><p data-qcc-status role="status" aria-live="polite"></p><pre data-qcc-result style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:520px;overflow:auto;font:13px/1.7 inherit"></pre>';
    page.insertBefore(panel,page.firstChild.nextSibling);
    const group=panel.querySelector('[data-qcc-group]'), load=panel.querySelector('[data-qcc-load]'),form=panel.querySelector('form'),select=panel.querySelector('[data-qcc-tool]'),fields=panel.querySelector('[data-qcc-fields]'),status=panel.querySelector('[data-qcc-status]'),output=panel.querySelector('[data-qcc-result]');
    let catalog=[], generation=0;
    const showFields=()=>{
      const tool=catalog.find(t=>t.name===select.value);fields.replaceChildren();
      panel.querySelector('[data-qcc-description]').textContent=tool?.description||'';
      for(const [key,schema] of Object.entries(tool?.inputSchema?.properties||{})){
        const label=document.createElement('label');label.style.display='grid';label.style.gap='5px';label.textContent=schema.description||key;
        const input=document.createElement(schema.enum?'select':'input'); input.name=key;
        if(schema.enum) for(const value of schema.enum){const option=document.createElement('option');option.value=value;option.textContent=value;input.append(option);}
        else {input.type=['integer','number'].includes(schema.type)?'number':schema.type==='boolean'?'checkbox':'text';input.maxLength=schema.type==='array'?2000:200;if(schema.type==='number')input.step='any';if(schema.type==='array')input.placeholder='JSON 数组，例如 ["选项一"]';}
        input.required=schema.type!=='boolean'&&(tool.inputSchema.required||[]).includes(key);label.append(input);fields.append(label);
      }
      panel.querySelector('[data-qcc-confirm]').checked=false;output.textContent='';
    };
    group.onchange=()=>{generation++;catalog=[];form.hidden=true;output.textContent='';status.textContent='请重新加载所选服务工具';};
    select.onchange=showFields;
    load.onclick=async()=>{
      const current=++generation;load.disabled=true;form.hidden=true;status.textContent='正在连接企查查…';output.textContent='';
      try{const result=await apiPost('/external/qcc/tools',{group:group.value});if(current!==generation)return;if(result.error)throw new Error(result.error);catalog=result.tools||[];select.replaceChildren();
        for(const tool of catalog){const option=document.createElement('option');option.value=tool.name;option.textContent=(tool.description||tool.name).split(/[。\r\n]/)[0].slice(0,55)+' · '+tool.name;select.append(option);}
        if(catalog.some(t=>t.name==='get_company_by_query'))select.value='get_company_by_query';
        form.hidden=!catalog.length;showFields();status.textContent='服务已连接，可用查询工具 '+catalog.length+' 个（不代表每项数据均已授权）';
      }catch(error){status.textContent=error.message;}finally{load.disabled=false;}
    };
    form.onsubmit=async event=>{
      event.preventDefault();const tool=catalog.find(t=>t.name===select.value);if(!tool)return;
      const args={};try{for(const input of fields.querySelectorAll('input,select')){const type=tool.inputSchema.properties[input.name].type;if(input.value!==''||type==='boolean')args[input.name]=type==='boolean'?input.checked:type==='array'?JSON.parse(input.value):['number','integer'].includes(type)?Number(input.value):input.value.trim();}}catch{status.textContent='数组参数需要填写有效的 JSON 数组';return;}
      const submit=form.querySelector('[type=submit]');submit.disabled=true;load.disabled=true;group.disabled=true;select.disabled=true;output.textContent='';status.textContent='正在查询，请勿重复提交…';
      try{const result=await apiPost('/external/qcc/query',{group:group.value,tool:tool.name,arguments:args,confirmCost:panel.querySelector('[data-qcc-confirm]').checked});if(result.error)throw new Error(result.error);
        status.textContent='来源：企查查 · '+result.tool+' · '+result.queriedAt;
        const parts=(result.result.content||[]).filter(item=>item.type==='text').map(item=>{try{return JSON.stringify(JSON.parse(item.text),null,2);}catch{return item.text;}});
        output.textContent=result.note+'\n\n'+(parts.length?parts.join('\n\n'):JSON.stringify(result.result,null,2));
      }catch(error){status.textContent=error.message;}finally{submit.disabled=false;load.disabled=false;group.disabled=false;select.disabled=false;panel.querySelector('[data-qcc-confirm]').checked=false;}
    };
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
      html += '<div style="margin-top:14px;font-weight:700;color:var(--txt-0,#222)">新增企业 · 七维尽调评分状态</div>';
      html += '<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:13px"><thead><tr style="text-align:left;color:var(--txt-3,#888);border-bottom:1px solid var(--border,#e5e9f2)"><th style="padding:6px 8px">企业</th><th style="padding:6px 8px">评分</th><th style="padding:6px 8px">完整度</th><th style="padding:6px 8px">状态</th></tr></thead><tbody>';
      const lvColor = { 'A类': 'var(--dh-green)', 'B类': 'var(--dh-orange)', 'C类': 'var(--txt-3,#888)', 'D类': 'var(--dh-red-2)', '待核实': 'var(--txt-3,#888)' };
      r.newScores.forEach((s) => {
        html += '<tr style="border-bottom:1px solid var(--border,#eef1f6)"><td style="padding:6px 8px">' + fmt(s.company) + '</td><td style="padding:6px 8px;font-weight:700;color:var(--dh-red-2)">' + (s.score == null ? '待核实' : s.score) + '</td><td style="padding:6px 8px">' + fmt(s.coverage || 0) + '%</td><td style="padding:6px 8px;color:' + (lvColor[s.level] || 'var(--txt-3)') + '">' + fmt(s.source) + '</td></tr>';
      });
      html += '</tbody></table>';
      html += '<div style="margin-top:10px;font-size:11px;color:var(--txt-3,#888)">只有评分和核验依据同时完整的板块才计入正式总分。可在「招商价值评分」页继续录入或核实。</div>';
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
    const keys = ['platformName', 'domain'];
    const fields = qa('#page-setting .field-list .field');
    fields.slice(0, 2).forEach((f, i) => {
      const fv = f.querySelector('.fv');
      if (fv && !fv.querySelector('input')) fv.innerHTML = '<input data-key="' + keys[i] + '" value="' + String(data[keys[i]] || '').replace(/"/g, '&quot;') + '" style="width:100%;background:var(--panel-2);border:1px solid var(--border);color:var(--txt-0);border-radius:8px;padding:8px 10px;font-size:13px">';
    });
    fields.slice(2, 5).forEach((f) => {
      const fv = f.querySelector('.fv');
      if (fv) fv.textContent = '由服务器环境变量配置';
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
    const standardResult = await apiGet('/score-standard');
    window.__scoreStandard = standardResult.data || [];
    const w = Object.fromEntries(window.__scoreStandard.map((dim) => [dim.name, dim.weight]));
    bindWeightRows(page, w);
    const grid = el('scoreStandardGrid');
    if (grid) grid.innerHTML = window.__scoreStandard.map((dim) => '<div class="card"><div class="card-title" style="margin-bottom:8px">' + fmt(dim.name) + ' <span style="color:var(--dh-purple);font-weight:700">' + fmt(dim.weight) + '%</span></div><div style="font-size:13px;line-height:1.65;color:var(--txt-2)">' + fmt(dim.criteria) + '</div></div>').join('');
    const saveBtn = Array.from(page.querySelectorAll('button')).find((b) => /保存配置/.test(b.textContent));
    if (saveBtn) saveBtn.onclick = async () => {
      const body = {}; page.querySelectorAll('.weight-row').forEach((r) => { body[r.querySelector('.wr-name').textContent.trim()] = Number(r.querySelector('.wr-slider').value); });
      const total = Object.values(body).reduce((sum, value) => sum + value, 0);
      if (total !== 100) { showToast('当前权重合计 ' + total + '，请调整为 100'); return; }
      await apiPut('/scoreWeights', body); showToast('权重已保存，正在重算评分…');
      await apiPost('/engine/score/recompute'); renderEngineScore();
    };
    renderScoreTable();
  }
  async function renderScoreTable() {
    const page = el('page-engine-score');
    let { data } = await apiGet('/scores');
    if (!data || !data.length) { data = (await apiPost('/engine/score/recompute')).data || []; }
    const tb = page.querySelector('table tbody'); if (!tb) return;
    const lvColor = { 'A类': 'sb-success', 'B类': 'sb-aging', 'C类': 'sb-normal', 'D类': 'sb-fail', '待核实': 'sb-normal' };
    tb.innerHTML = data.map((s) => {
      const scoreText = s.score == null ? '<span style="color:var(--txt-3)">待核实' + (s.provisionalScore == null ? '' : '（参考 ' + s.provisionalScore + '）') + '</span>' : s.score;
      const missing = (s.missing || []).length ? (s.missing || []).join('、') : '无';
      return '<tr><td><b>' + fmt(s.company) + '</b></td><td style="color:var(--dh-red-2);font-weight:700">' + scoreText + '</td><td><span class="status-badge ' + (s.coverage === 100 ? 'sb-success' : 'sb-aging') + '"><span class="sb-dot"></span>' + fmt(s.coverage || 0) + '%</span></td><td style="max-width:230px">' + fmt(missing) + '</td><td>' + fmt(s.ruleVer) + '</td><td>' + fmt(s.time) + '</td><td><span class="status-badge ' + (lvColor[s.level] || 'sb-normal') + '"><span class="sb-dot"></span>' + fmt(s.level) + '</span></td><td><button class="btn btn-blue btn-sm" onclick="ZS.editAssessment(' + s.companyId + ')">录入/查看</button></td></tr>';
    }).join('');
    renderScoreDist(data);
  }
  window.ZS.editAssessment = async function (companyId) {
    const companyResult = await apiGet('/companies/' + companyId);
    const company = companyResult.data;
    const standard = window.__scoreStandard || (await apiGet('/score-standard')).data || [];
    if (!company) return showToast('企业不存在');
    const fields = standard.map((dim) => '<div style="padding:13px 0;border-bottom:1px solid var(--border)"><div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start"><div><b style="color:var(--txt-0)">' + fmt(dim.name) + '</b><div style="font-size:12px;color:var(--txt-3);margin-top:3px">' + fmt(dim.criteria) + '</div></div><span class="tag">权重 ' + fmt(dim.weight) + '%</span></div><div class="grid-2" style="margin-top:10px"><div class="form-row"><label>评分（0-100）</label><input class="assessment-score" data-key="' + dim.scoreKey + '" type="number" min="0" max="100" step="0.1" value="' + escapeHtml(company[dim.scoreKey] == null ? '' : company[dim.scoreKey]) + '"></div><div class="form-row"><label>核验依据/资料来源</label><textarea class="assessment-evidence" data-key="' + dim.evidenceKey + '" rows="2" maxlength="2000" placeholder="填写财报、专利、合同、公开记录或人工核验结论">' + escapeHtml(company[dim.evidenceKey] || '') + '</textarea></div></div></div>').join('');
    showResultModal('企业尽调评分 · ' + company.name, '<div style="padding:10px 12px;border-radius:10px;background:#fefce8;color:#854d0e;font-size:13px">评分和核验依据必须同时填写才计入正式总分；缺少资料的板块会显示“待核实”。</div>' + fields + '<button class="btn btn-blue" style="width:100%;margin-top:16px" onclick="ZS.saveAssessment(' + companyId + ')">保存并重新计算</button>');
  };
  window.ZS.saveAssessment = async function (companyId) {
    const body = {};
    qa('#zsResultBody .assessment-score').forEach((input) => { body[input.dataset.key] = input.value; });
    qa('#zsResultBody .assessment-evidence').forEach((input) => { body[input.dataset.key] = input.value; });
    const result = await apiPut('/companies/' + companyId + '/assessment', body);
    if (!result.data) return showToast(result.error || '评分保存失败');
    el('zsResultModal').style.display = 'none';
    showToast('尽调评分已保存，资料完整度 ' + result.data.coverage + '%');
    renderScoreTable();
  };
  function renderScoreDist(data) {
    const page = el('page-engine-score'); if (!page) return;
    let sec = el('scoreDistSec');
    if (!sec) {
      const titles = page.querySelectorAll('.section-title');
      let anchor = null;
      titles.forEach((t) => { const h = t.querySelector('h3'); if (h && h.textContent.trim() === '企业尽调评分') anchor = t; });
      sec = document.createElement('div'); sec.id = 'scoreDistSec';
      if (anchor) anchor.insertAdjacentElement('beforebegin', sec); else page.appendChild(sec);
    }
    const a = data.filter((x) => x.level === 'A类').length;
    const b = data.filter((x) => x.level === 'B类').length;
    const c = data.filter((x) => x.level === 'C类').length;
    const d = data.filter((x) => x.level === 'D类').length;
    const p = data.filter((x) => x.level === '待核实' || x.score == null).length;
    const total = data.length || 1;
    const segs = [{ v: a, c: '#10b981', l: 'A类' }, { v: b, c: '#f59e0b', l: 'B类' }, { v: c, c: '#64748b', l: 'C类' }, { v: d, c: '#dc2626', l: 'D类' }, { v: p, c: '#7561f5', l: '待核实' }].filter((s) => s.v > 0);
    const C = 2 * Math.PI * 70; let off = 0;
    const arcs = segs.map((s) => { const len = s.v / total * C; const dash = C - len; const arc = '<circle cx="100" cy="100" r="70" fill="none" stroke="' + s.c + '" stroke-width="26" stroke-dasharray="' + len.toFixed(2) + ' ' + dash.toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 100 100)"/>'; off += len; return arc; }).join('');
    const scored = data.filter((x) => x.score != null).map((x) => x.score);
    const avg = scored.length ? Math.round(scored.reduce((s, x) => s + x, 0) / scored.length) : 0;
    const maxv = Math.max(a, b, c, d, p, 1);
    const bars = segs.map((s) => '<div style="display:flex;align-items:center;gap:8px;margin:6px 0"><span style="width:52px;font-size:12px;color:var(--txt-2)">' + s.l + '</span><div style="flex:1;height:14px;background:var(--border,#e5e9f2);border-radius:7px;overflow:hidden"><i style="display:block;height:100%;width:' + (s.v / maxv * 100).toFixed(1) + '%;background:' + s.c + '"></i></div><span style="width:28px;text-align:right;font-size:12px;font-weight:700">' + s.v + '</span></div>').join('');
    sec.innerHTML = '<div class="section-title"><h3>评分等级分布</h3><span class="tag">实时统计</span><div class="line"></div></div>' +
      '<div class="card" style="margin-bottom:18px;display:flex;gap:24px;align-items:center;flex-wrap:wrap">' +
      '<svg viewBox="0 0 200 200" style="width:180px;height:180px;flex:0 0 auto">' + arcs +
      '<text x="100" y="94" text-anchor="middle" fill="var(--txt-3,#888)" font-size="12">参评企业</text>' +
      '<text x="100" y="120" text-anchor="middle" fill="var(--dh-red-2,#dc2626)" font-size="26" font-weight="800">' + (a + b + c + d) + '</text></svg>' +
      '<div style="flex:1;min-width:240px">' +
      '<div style="font-size:12px;color:var(--txt-3);margin-bottom:8px">A类（≥85）重点对接 · B类（75-84）跟踪 · C类（60-74）观察 · D类（&lt;60）谨慎 · 资料不全显示待核实</div>' +
      bars +
      '<div style="margin-top:10px;font-size:13px;color:var(--txt-2)">正式评分平均分 <b style="color:var(--dh-red-2)">' + avg + '</b> · 待核实 <b>' + p + '</b> 家</div>' +
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
  let kbQuery = '', kbType = '全部';
  async function renderKb() {
    const page = el('page-kb');
    const { data } = await apiGet('/knowledge');
    // 检索框
    const input = el('kbSearch');
    const searchBtn = Array.from(page.querySelectorAll('button')).find((b) => /检索/.test(b.textContent));
    const doSearch = () => { kbQuery = (input.value || '').trim(); renderKbList(data); };
    if (input) input.oninput = doSearch;
    if (searchBtn) searchBtn.onclick = doSearch;
    const typeMap=['企业','产业','案例','政策'];
    page.querySelectorAll('.kb-card').forEach((card,index)=>{card.onclick=()=>{kbType=typeMap[index]||'全部';renderKbList(data);};card.setAttribute('role','button');card.tabIndex=0;card.onkeydown=(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();card.click();}};});
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
    let filtered = kbType==='全部'?data:data.filter(d=>d.type===kbType);
    if(kbQuery)filtered=filtered.filter((d) => (d.title + ' ' + (d.content || '')).indexOf(kbQuery) >= 0);
    const stColor = { '待审核': 'sb-aging', '已通过': 'sb-success', '已退回': 'sb-fail' };
    list.innerHTML = '<div style="margin:4px 0 12px;font-size:12px;color:var(--txt-3)">'+fmt(kbType)+' · 共 ' + filtered.length + ' 条知识' + (kbQuery ? '（匹配“' + fmt(kbQuery) + '”）' : '') + ' <button class="btn btn-ghost btn-sm" onclick="ZS.resetKbFilter()">查看全部</button></div>' + (filtered.length ? filtered.map((d) => '<div class="review-item"><div class="ri-info"><div class="ri-cat">' + fmt(d.type) + '知识库 · ' + fmt(d.source) + '</div><div class="ri-title">' + fmt(d.title) + '</div><div class="ri-summary">' + fmt(d.content) + '</div></div><div class="ri-actions"><span class="status-badge ' + (stColor[d.status] || 'sb-normal') + '"><span class="sb-dot"></span>' + (d.status === '已通过' ? '已发布' : fmt(d.status)) + (d.status === '已通过' && d.publishedAt ? ' · ' + d.publishedAt : '') + '</span> <button class="btn btn-ghost btn-sm" onclick="ZS.edit(\'knowledge\',' + d.id + ')">编辑</button></div></div>').join('') : '<div style="color:var(--txt-3);padding:16px">无匹配结果</div>');
  }
  window.ZS.resetKbFilter=()=>{kbType='全部';kbQuery='';if(el('kbSearch'))el('kbSearch').value='';renderKb();};

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
    tb.innerHTML = data.map((m) => '<tr><td>' + fmt(m.name) + '</td><td>' + fmt(m.type) + '</td><td>' + fmt(m.version) + '</td><td><span class="status-badge ' + (roleColor[m.role] || 'sb-normal') + '"><span class="sb-dot"></span>' + fmt(m.role) + '</span></td><td>' + fmt(m.accuracy) + '</td><td>' + fmt(m.samples) + '</td><td>' + (m.role === '备模型' ? '<button class="btn btn-blue btn-sm" onclick="ZS.switchModel(' + m.id + ')">切换为主</button> ' : '') + '<button class="btn btn-ghost btn-sm" onclick="ZS.compareRecords(\'models\','+m.id+')">版本对比</button></td></tr>').join('');
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
  window.ZS.compareRecords=async function(resource,id){
    const {data}=await apiGet('/'+resource),current=data.find(item=>item.id===id);if(!current)return showToast('记录不存在');
    const peers=data.filter(item=>item.name===current.name).sort((a,b)=>String(b.version||'').localeCompare(String(a.version||'')));
    const keys=resource==='models'?['version','role','accuracy','samples']:['version','date','status','content'];
    showResultModal('版本对比 · '+current.name,'<div style="overflow:auto"><table><thead><tr><th>字段</th>'+peers.map(item=>'<th>'+fmt(item.version)+'</th>').join('')+'</tr></thead><tbody>'+keys.map(key=>'<tr><td>'+fmt(key)+'</td>'+peers.map(item=>'<td>'+fmt(item[key])+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'+(peers.length<2?'<p style="color:var(--txt-3);margin-top:12px">当前仅保存一个版本；新增版本后可在此逐项比较。</p>':''));
  };

  /* ---------- 规则配置 ---------- */
  async function renderRule() {
    const page = el('page-rule');
    const { data } = await apiGet('/prompts');
    const tb = page.querySelector('table tbody'); if (!tb) return;
    tb.innerHTML = data.map((p) => '<tr><td>' + fmt(p.name) + '</td><td>' + fmt(p.version) + '</td><td>' + fmt(p.date) + '</td><td><span class="status-badge sb-success"><span class="sb-dot"></span>' + fmt(p.status) + '</span></td><td><button class="btn btn-ghost btn-sm" onclick="ZS.edit(\'prompts\',' + p.id + ')">编辑</button> <button class="btn btn-blue btn-sm" onclick="ZS.compareRecords(\'prompts\',' + p.id + ')">版本对比</button></td></tr>').join('');
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
    qa('#page-audit button').filter(button=>/导出Excel/.test(button.textContent)).forEach(button=>{button.onclick=()=>downloadAuthenticated('/audit/export','审计与调用日志.xlsx');});
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
    window.__dataLogs=data;
    tb.innerHTML = data.map((l) => '<tr><td>' + l.time + '</td><td>' + fmt(l.scene === '外部API' ? l.text.split('→')[0].replace('外部API查询（', '').replace('）', '') : l.scene) + '</td><td>' + fmt(l.model) + '</td><td>' + fmt(l.inTok) + '</td><td>' + fmt(l.cost) + '</td><td><span class="status-badge sb-' + (l.status === '成功' ? 'success' : 'fail') + '"><span class="sb-dot"></span>' + l.status + '</span></td><td><button class="btn btn-ghost btn-sm" onclick="ZS.viewDataLog(' + l.id + ')">查看</button></td></tr>').join('');
    qa('#page-data-log button').filter(button=>/导出Excel/.test(button.textContent)).forEach(button=>{button.onclick=()=>downloadAuthenticated('/audit/export','接入记录.xlsx');});
    page.querySelectorAll('.log-line button').forEach(button=>{button.disabled=true;button.title='该提示为历史示例，不能执行真实外部服务操作';});
  }
  window.ZS.viewDataLog=function(id){const item=(window.__dataLogs||[]).find(row=>row.id===id);if(!item)return;showResultModal('调用记录详情 #'+id,'<div class="field-list">'+Object.entries(item).map(([key,value])=>'<div class="field"><span class="fk">'+fmt(key)+'</span><span class="fv">'+fmt(value)+'</span></div>').join('')+'</div>');};

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

  init();
})();
