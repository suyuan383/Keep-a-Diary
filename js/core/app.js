(function (global) {
  const App = {};
  let content, sidebar, topbarTitle, mask;
  let renderPending = false;

  function renderSidebar(activeId) {
    const mods = Registry.all();
    const homeItem = `<a class="nav-item ${activeId === 'home' ? 'active' : ''}" href="#home">
      <span class="nav-icon">🏠</span><span class="nav-text">主页</span></a>`;
    const modItems = mods.map(m => `
      <a class="nav-item ${activeId === m.id ? 'active' : ''}" href="#${m.id}">
        <span class="nav-icon">${m.icon || '📄'}</span>
        <span class="nav-text">${U.escape(m.name)}</span>
      </a>`).join('');
    const setItem = `<a class="nav-item ${activeId === 'settings' ? 'active' : ''}" href="#settings">
      <span class="nav-icon">⚙️</span><span class="nav-text">设置</span></a>`;

    sidebar.innerHTML = `
      <div class="sidebar-head">
        <div class="app-logo">${U.escape(APP_CONFIG.appName)}</div>
      </div>
      <nav class="nav">${homeItem}${modItems}${setItem}</nav>
      <div class="sidebar-foot">数据仅存本地</div>`;
  }

  function getTitle(id) {
    if (id === 'home') return APP_CONFIG.appName;
    if (id === 'settings') return '设置';
    const m = Registry.get(id);
    return m ? m.name : '未找到';
  }

  function buildHtml(id, ctx) {
    if (id === 'home') return HomeView.render(ctx);
    if (id === 'settings') return SettingsView.render(ctx);
    const m = Registry.get(id);
    if (!m) return `<div class="empty">页面不存在</div>`;
    return m.page ? m.page(ctx) : `<div class="empty">开发中…</div>`;
  }

  function mount(id, ctx) {
    if (id === 'home') return HomeView.mounted && HomeView.mounted(ctx);
    if (id === 'settings') return SettingsView.mounted && SettingsView.mounted(ctx);
    const m = Registry.get(id);
    if (m && m.mounted) m.mounted(ctx);
  }

App.render = function () {
  const route = Router.parse();
  const ctx = {
    id: route.id,
    arg: route.arg,
    go: Router.go,
    refresh: App.render
  };

  renderSidebar(route.id);
  topbarTitle.textContent = getTitle(route.id);

  // 骨架屏：先画一帧占位，再替换
  content.innerHTML = `<div class="skeleton-wrap">
    <div class="sk-card">
      <div class="sk-line w40 tall"></div>
      <div class="sk-line w80"></div>
      <div class="sk-line w60"></div>
    </div>
    <div class="sk-card">
      <div class="sk-line w60 tall"></div>
      <div class="sk-line w100"></div>
      <div class="sk-line w80"></div>
      <div class="sk-line w40"></div>
    </div>
  </div>`;

  requestAnimationFrame(() => {
    content.innerHTML = `<div class="module-wrap module-${route.id}">${
      buildHtml(route.id, ctx)
    }</div>`;
    mount(route.id, ctx);

    // 处理挂起的动作（快捷菜单用）
    if (App._pendingAction && App._pendingAction.id === route.id) {
      const { act } = App._pendingAction;
      App._pendingAction = null;
      const fakeEl = document.createElement('button');
      fakeEl.dataset.act = act;
      fakeEl.dataset._synthetic = '1';
      setTimeout(() => dispatch(act, fakeEl, 'click'), 30);
    }
  });

  document.body.classList.remove('sidebar-open');
};

  function dispatch(act, el, type) {
    const route = Router.parse();
    const ctx = { id: route.id, arg: route.arg, go: Router.go, refresh: App.render };

    if (route.id === 'settings') {
      return SettingsView.handleAction &&
             SettingsView.handleAction(act, el, ctx, type);
    }
if (route.id === 'home') {
  const targetId = el.dataset.module;
  if (targetId) {
    const m = Registry.get(targetId);
    if (m && m.handleAction) return m.handleAction(act, el, { ...ctx, id: targetId }, type);
  }
  if (HomeView.handleAction) return HomeView.handleAction(act, el, ctx, type);   // ← 加这行
  return false;
}
    const m = Registry.get(route.id);
    if (m && m.handleAction) return m.handleAction(act, el, ctx, type);
    return false;
  }

  function bindDelegate(evtName, type) {
    content.addEventListener(evtName, e => {
      const el = e.target.closest('[data-act]');
      if (!el) return;
      dispatch(el.dataset.act, el, type);
    });
  }

  App.init = function () {
    content = document.getElementById('content');
    sidebar = document.getElementById('sidebar');
    topbarTitle = document.getElementById('topbarTitle');
    mask = document.getElementById('sidebarMask');

    Store.init();
    if (global.Theme) Theme.init();   // ← 加这行

    bindDelegate('click', 'click');
    bindDelegate('change', 'change');
    bindDelegate('input', 'input');

    document.getElementById('menuBtn').addEventListener('click',
      () => document.body.classList.add('sidebar-open'));
    mask.addEventListener('click',
      () => document.body.classList.remove('sidebar-open'));

    Bus.on('store:change', () => {
      if (renderPending) return;
      renderPending = true;
      requestAnimationFrame(() => {
        renderPending = false;
        App.render();
      });
    });
    /* ---- 长按 FAB 显示快捷菜单 ---- */
(function bindFabLongPress() {
  let timer = null;
  let started = false;

  function onStart(e) {
    const fab = e.target.closest && e.target.closest('.fab');
    if (!fab) return;
    started = true;
    timer = setTimeout(() => {
      if (!started) return;
      App.showQuickSheet();
      // 阻止后续 click
      started = false;
      e.preventDefault && e.preventDefault();
    }, 550);
  }
  function onEnd() {
    started = false;
    clearTimeout(timer);
  }

  document.addEventListener('touchstart', onStart, { passive: true });
  document.addEventListener('touchend', onEnd);
  document.addEventListener('touchcancel', onEnd);
  document.addEventListener('mousedown', onStart);
  document.addEventListener('mouseup', onEnd);
  document.addEventListener('mouseleave', onEnd);
})();
    Router.start(App.render);
  };
  /* ---- 快捷菜单 ---- */
App.showQuickSheet = function () {
  const old = document.getElementById('quickSheet');
  if (old) old.remove();

  const actions = [
    { id: 'ledger',   act: 'ledger-add',   cls: 'ledger',   icon: '💰', label: '记一笔' },
    { id: 'habit',    act: 'habit-add',    cls: 'habit',    icon: '✅', label: '加打卡' },
    { id: 'weight',   act: 'weight-add',   cls: 'weight',   icon: '⚖️', label: '记体重' },
    { id: 'event',    act: 'event-add',    cls: 'event',    icon: '📌', label: '记事件' },
    { id: 'wishlist', act: 'wish-add',     cls: 'wishlist', icon: '⭐', label: '加愿望' },
    { id: 'habit',    act: null,           cls: 'habit',    icon: '📊', label: '打卡汇总' },
    { id: 'ledger',   act: null,           cls: 'ledger',   icon: '📈', label: '看统计' },
    { id: 'settings', act: null,           cls: '',         icon: '⚙️', label: '设置' }
  ];

  const mask = document.createElement('div');
  mask.className = 'quick-sheet-mask';
  mask.id = 'quickSheet';
  mask.innerHTML = `
    <div class="quick-sheet">
      <div class="quick-handle"></div>
      <div class="quick-title">快捷操作</div>
      <div class="quick-grid">
        ${actions.map(a => `
          <button class="quick-item ${a.cls}" data-qid="${a.id}" data-qact="${a.act || ''}">
            <span class="quick-item-icon">${a.icon}</span>
            <span class="quick-item-label">${a.label}</span>
          </button>
        `).join('')}
      </div>
    </div>`;
  document.body.appendChild(mask);
requestAnimationFrame(() => {
  mask.classList.add('show');
  const sheet = mask.querySelector('.quick-sheet');
  if (sheet) sheet.classList.add('show');
});

  mask.addEventListener('click', e => {
    if (e.target === mask) { closeQuick(); return; }
    const btn = e.target.closest('[data-qid]');
    if (!btn) return;
    const id = btn.dataset.qid;
    const act = btn.dataset.qact;
    closeQuick();
    if (act) {
      App._pendingAction = { id, act };
    } else {
      App._pendingAction = null;
    }
    Router.go(id);
    if (Router.current() === id) App.render();
  });

  function closeQuick() {
    mask.classList.remove('show');
    setTimeout(() => {
      if (mask.parentNode) mask.parentNode.removeChild(mask);
    }, 220);
  }
};
  global.App = App;
})(window);