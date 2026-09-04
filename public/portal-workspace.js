/* 投资客商工作台：沿用公开项目库与需求匹配接口，不访问管理端私有数据。 */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  const validProject = p => p && typeof p === 'object' && typeof p.title === 'string';
  const state = { projects: [], loaded: false, loadError: '', category: '全部', view: 'chat', history: [], active: null, busy: false, run: 0, controller: null, sample: 0, detail: null };
  const cardProjects = new Map();
  let cardId = 0;
  let toastTimer;
  let resourceRun = 0;
  const samples = [
    '寻找成都适合新能源电池产线落地的园区',
    '查询支持集成电路企业发展的招商项目',
    '匹配宜宾动力电池产业的投资载体',
    '了解四川智能制造企业可申请的优惠政策',
    '寻找绵阳电子信息产业的招商项目',
    '查询成都生物医药产业的园区资源',
    '寻找德阳装备制造企业的落地空间',
    '查询新能源企业的设备投资奖补政策'
  ];
  const tools = [
    { name:'投资需求匹配', icon:'chart', prompt:'我们是一家新能源企业，计划在成都投资建厂，请匹配适合的招商资源。' },
    { name:'招商项目查询', icon:'search', prompt:'请查询四川电子信息产业相关的招商项目。' },
    { name:'产业园区匹配', icon:'building', prompt:'我们计划在宜宾建设动力电池产线，请推荐适合的产业园区。' },
    { name:'优惠政策查询', icon:'book', tone:'orange', prompt:'请查询成都智能制造企业可享受的优惠政策。' },
    { name:'产业链分析', icon:'grid', missing:true },
    { name:'企业招商方案', icon:'building', tone:'blue', missing:true },
    { name:'投资研判报告', icon:'chart', tone:'yellow', missing:true },
    { name:'参阅材料生成', icon:'book', missing:true }
  ];
  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3000);
  }
  function syncInput() { $('characterCount').textContent = $('needInput').value.length + ' / 1000'; }
  function setPrompt(message) {
    if (state.busy) { toast('正在匹配，请稍候再选择需求'); return; }
    showView('chat');
    $('needInput').value = message;
    syncInput();
    $('requestError').hidden = true;
    closePanels();
    $('needInput').focus();
  }
  function closePanels() {
    document.querySelectorAll('.drawer-open').forEach(el => el.classList.remove('drawer-open'));
    document.querySelectorAll('[aria-expanded]').forEach(el => el.setAttribute('aria-expanded', 'false'));
    $('panelBackdrop').hidden = true;
  }
  function openPanel(id) {
    const wasOpen = $(id).classList.contains('drawer-open');
    closePanels();
    if (wasOpen) return;
    $(id).classList.add('drawer-open');
    $('panelBackdrop').hidden = false;
    const trigger = document.querySelector('[aria-controls="' + id + '"]');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
  }
  function showView(view) {
    state.view = view;
    const chat = view === 'chat';
    $('welcome').hidden = !chat || !!state.active || state.busy;
    $('analysisView').hidden = !chat || (!state.active && !state.busy);
    $('libraryView').hidden = chat;
    $('pageTitle').textContent = chat ? (state.active ? '招商需求分析' : '新分析') : (view === '全部' ? '招商资源库' : view);
    document.querySelectorAll('.nav-item[data-view]').forEach(btn => {
      const selected = btn.dataset.view === view;
      btn.classList.toggle('active', selected);
      if (selected) btn.setAttribute('aria-current', 'page'); else btn.removeAttribute('aria-current');
    });
    if (!chat) {
      state.category = view;
      $('resourceSearch').value = '';
      renderProjects();
    }
    closePanels();
  }
  function renderSamples() {
    $('suggestionGrid').innerHTML = Array.from({length:4}, (_, i) => {
      const index = (state.sample + i) % samples.length;
      return '<button class="suggestion-card" data-sample="' + index + '">' + icon('tag') + '<span>' + esc(samples[index]) + '</span></button>';
    }).join('');
  }
  function projectCard(p) {
    // 仅数字索引进入事件参数；项目标题、用户输入及所有接口文字均转义。
    const detailIndex = cardId++;
    cardProjects.set(detailIndex, p);
    return '<article class="project-card"><div class="project-topline"><span class="category-badge">' + esc(p.category || '招商资源') + '</span><span class="project-status">' + esc(p.status || '已发布') + '</span></div><h3>' + esc(p.title) + '</h3><p class="project-meta">' + esc([p.region,p.industry,p.scale].filter(Boolean).join(' · ')) + '</p><p class="project-description">' + esc(p.highlights || p.policy || '点击查看资源详情') + '</p><div class="project-footer"><button class="detail-btn" data-project="' + detailIndex + '">查看详情 →</button></div></article>';
  }
  function renderProjects() {
    document.querySelectorAll('[data-category]').forEach(btn => {
      const selected = btn.dataset.category === state.category;
      btn.classList.toggle('active', selected);
      btn.setAttribute('aria-pressed', String(selected));
    });
    if (state.loadError) { $('projectGrid').innerHTML = '<div class="empty-state">' + esc(state.loadError) + '<button class="text-btn" data-action="reload">重新加载</button></div>'; return; }
    if (!state.loaded) { $('projectGrid').innerHTML = '<p class="empty-state">正在加载资源…</p>'; return; }
    const query = $('resourceSearch').value.trim().toLowerCase();
    const rows = state.projects.filter(p => (state.category === '全部' || p.category === state.category) && [p.title,p.region,p.industry,p.highlights,p.policy].join(' ').toLowerCase().includes(query));
    $('projectGrid').innerHTML = rows.length ? rows.map(projectCard).join('') : '<p class="empty-state">暂无符合条件的资源，请调整分类或搜索词。</p>';
  }
  async function loadProjects() {
    const run = ++resourceRun;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    state.loadError = '';
    $('connectionStatus').textContent = '正在连接资源库';
    $('connectionStatus').className = 'connection';
    try {
      const response = await fetch('api/portal/projects', {signal:controller.signal});
      const json = await response.json();
      if (!response.ok || !Array.isArray(json.data)) throw new Error('资源库暂时不可用，请重试');
      if (run !== resourceRun) return;
      state.projects = json.data.filter(validProject);
      state.loaded = true;
      $('sourceCount').textContent = state.projects.length + ' 条已发布资源';
      $('connectionStatus').textContent = '资源库已连接';
      $('connectionStatus').className = 'connection ready';
      $('resourceStats').innerHTML = ['投资载体','招商项目','优惠政策'].map(cat => '<div class="stat-row"><span>' + cat + '</span><b>' + state.projects.filter(p => p.category === cat).length + ' 条</b></div>').join('');
    } catch (err) {
      if (run !== resourceRun) return;
      state.loadError = '资源库加载失败，请检查网络后重试';
      $('connectionStatus').textContent = '资源库连接异常';
      $('connectionStatus').className = 'connection error';
      $('sourceCount').textContent = '加载失败';
      $('resourceStats').innerHTML = '<button class="text-btn" data-action="reload">连接失败，点击重试</button>';
    } finally { clearTimeout(timer); if (run === resourceRun) renderProjects(); }
  }
  function renderHistory() {
    $('clearHistory').disabled = !state.history.length;
    $('historyList').innerHTML = state.history.length ? state.history.map((item,index) => '<button class="history-item" data-history="' + index + '" title="' + esc(item.message) + '">' + icon('clock') + '<span>' + esc(item.message) + '</span></button>').join('') : '<p class="history-empty">暂无分析记录</p>';
  }
  function renderAnalysis(item) {
    state.active = item;
    const matched = Array.isArray(item.result.matched) ? item.result.matched.filter(validProject) : [];
    const need = item.result.need && typeof item.result.need === 'object' ? item.result.need : {};
    const tags = [...(Array.isArray(need.industries) ? need.industries : []), ...(Array.isArray(need.regions) ? need.regions : [])].filter(v => typeof v === 'string');
    $('analysisView').innerHTML = '<div class="user-message">' + esc(item.message) + '</div><h2 class="analysis-heading">' + icon('spark') + '招商资源匹配</h2><p class="analysis-description">' + esc(need.summary || '已根据产业方向与地区检索当前资源库。') + '</p><div class="result-grid">' + (matched.length ? matched.map(projectCard).join('') : '<p class="empty-state">暂无匹配资源，试试补充产业方向或意向地区。</p>') + '</div><p class="result-note">结果来自已发布资源库，包含联调示例。AI 不可用时自动采用规则匹配；非投资建议。</p>';
    $('outputArea').innerHTML = '<h3 class="summary-title">' + icon('spark') + '本次需求摘要</h3><p class="summary-text">' + esc(need.summary || item.message) + '</p><div class="summary-tags">' + tags.map(t => '<span>' + esc(t) + '</span>').join('') + '</div><p class="summary-count"><b>' + matched.length + '</b>条推荐资源</p><p class="result-note">请在中间区域查看资源详情。</p>';
    $('currentNeed').textContent = item.message;
    showView('chat');
    $('conversationScroll').scrollTop = 0;
  }
  function setBusy(busy) {
    state.busy = busy;
    $('matchBtn').disabled = busy;
    $('matchBtn').setAttribute('aria-label', busy ? '正在匹配' : '发送需求');
    $('needInput').readOnly = busy;
    $('matchForm').setAttribute('aria-busy', String(busy));
  }
  async function doMatch(event) {
    if (event) event.preventDefault();
    if (state.busy) return;
    const message = $('needInput').value.trim();
    if (!message || message.length > 1000) { toast(message ? '需求请控制在 1000 字以内' : '请先描述您的招商需求'); $('needInput').focus(); return; }
    const run = ++state.run;
    const controller = new AbortController();
    state.controller = controller;
    const timer = setTimeout(() => controller.abort(), 20000);
    setBusy(true);
    state.active = null;
    $('currentNeed').textContent = message;
    $('outputArea').innerHTML = '<div class="output-empty">' + icon('spark') + '<h3>正在匹配招商资源</h3><p>完成后显示本次需求摘要。</p></div>';
    $('requestError').hidden = true;
    showView('chat');
    $('analysisView').innerHTML = '<div class="user-message">' + esc(message) + '</div><p class="loading-line" role="status"><span class="loading-dot"></span>正在提取需求并匹配招商资源…</p>';
    $('conversationScroll').scrollTop = 0;
    try {
      const response = await fetch('api/portal/match', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message}),signal:controller.signal});
      const json = await response.json();
      if (!response.ok) throw new Error(typeof json.error === 'string' ? json.error : '匹配暂时不可用，请稍后重试');
      if (!json || !Array.isArray(json.matched)) throw new Error('匹配结果格式异常，请稍后重试');
      if (run !== state.run) return;
      const item = {message,result:json};
      state.history.unshift(item);
      state.history = state.history.slice(0,8);
      renderHistory();
      renderAnalysis(item);
      $('needInput').value = '';
      syncInput();
    } catch (err) {
      if (run !== state.run) return;
      const error = err.name === 'AbortError' ? '匹配超时，请稍后重试' : (err instanceof SyntaxError || err instanceof TypeError ? '匹配服务连接异常，请稍后重试' : err.message);
      $('requestError').textContent = error;
      $('requestError').hidden = false;
      $('analysisView').innerHTML = '<div class="user-message">' + esc(message) + '</div><p class="empty-state">本次匹配未完成。需求已保留，您可以重新发送。</p>';
      $('outputArea').innerHTML = '<div class="output-empty"><h3>本次匹配未完成</h3><p>请检查需求或稍后重试。</p></div>';
    } finally { clearTimeout(timer); if (run === state.run) { setBusy(false); state.controller = null; } }
  }
  function newChat() {
    state.run++;
    if (state.controller) state.controller.abort();
    state.controller = null;
    setBusy(false);
    state.active = null;
    $('needInput').value = '';
    syncInput();
    $('requestError').hidden = true;
    $('currentNeed').textContent = '描述您的产业方向、意向地区与投资诉求，开始一次资源匹配。';
    $('outputArea').innerHTML = '<div class="output-empty">' + icon('spark') + '<h3>让招商思路，在这里成形</h3><p>匹配完成后，在这里查看需求摘要与推荐资源。</p></div>';
    showView('chat');
    $('needInput').focus();
  }
  function showDetail(index) {
    const p = cardProjects.get(index);
    if (!validProject(p)) { toast('资源已更新，请刷新后重试'); return; }
    state.detail = p;
    $('detailTitle').textContent = p.title;
    $('detailContent').innerHTML = '<dl>' + [['类型',p.category],['地区',p.region],['产业',p.industry],['规模',p.scale],['状态',p.status],['亮点',p.highlights],['政策',p.policy]].filter(row => row[1]).map(([label,value]) => '<dt>' + label + '</dt><dd>' + esc(value) + '</dd>').join('') + '</dl><p class="result-note">当前资源包含联调示例，请核实项目与政策信息。</p>';
    $('projectDialog').showModal();
  }
  document.addEventListener('click', event => {
    const btn = event.target.closest('button');
    if (!btn || btn.disabled) return;
    if (btn.dataset.view) return showView(btn.dataset.view);
    if (btn.dataset.category) { state.category = btn.dataset.category; renderProjects(); return; }
    if (btn.dataset.sample !== undefined) return setPrompt(samples[Number(btn.dataset.sample)]);
    if (btn.dataset.industry) return setPrompt('请匹配' + btn.dataset.industry + '产业相关的招商项目与园区资源。');
    if (btn.dataset.tool !== undefined) return setPrompt(tools[Number(btn.dataset.tool)].prompt);
    if (btn.dataset.project !== undefined) return showDetail(Number(btn.dataset.project));
    if (btn.dataset.history !== undefined) { if (state.busy) return toast('正在匹配，请稍候'); const item = state.history[Number(btn.dataset.history)]; if (item) renderAnalysis(item); return; }
    switch (btn.dataset.action) {
      case 'new': return newChat();
      case 'shuffle': state.sample = (state.sample + 4) % samples.length; return renderSamples();
      case 'reload': return loadProjects();
      case 'clear-history': state.history = []; renderHistory(); return toast('已清空本次会话记录');
      case 'sidebar': return openPanel('sidebar');
      case 'context': return openPanel('contextPanel');
      case 'tools': return openPanel('toolsPanel');
      case 'close-panels': return closePanels();
      case 'close-dialog': return $('projectDialog').close();
    }
  });
  $('useDetail').addEventListener('click', () => { if (!state.detail) return; $('projectDialog').close(); setPrompt('我想了解' + state.detail.title + '，请匹配相关招商资源与政策。'); });
  $('matchForm').addEventListener('submit', doMatch);
  $('needInput').addEventListener('input', syncInput);
  $('needInput').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) { event.preventDefault(); doMatch(); } });
  $('resourceSearch').addEventListener('input', renderProjects);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closePanels(); });
  window.addEventListener('resize', closePanels);
  $('industryChips').innerHTML = ['人工智能','新能源','电子信息','智能制造','生物医药'].map(name => '<button class="industry-chip" data-industry="' + name + '">' + name + '</button>').join('');
  $('toolGrid').innerHTML = tools.map((tool,index) => '<button class="tool-card ' + (tool.tone || '') + '" ' + (tool.missing ? 'disabled title="该能力尚未接入，不会生成报告"' : 'data-tool="' + index + '"') + '>' + icon(tool.icon) + '<span>' + tool.name + '</span>' + (tool.missing ? '<small>待接入</small>' : '<svg class="icon tool-arrow" aria-hidden="true"><use href="#i-arrow"/></svg>') + '</button>').join('');
  renderSamples();
  loadProjects();
})();
