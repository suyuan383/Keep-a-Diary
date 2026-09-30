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
    content.innerHTML = buildHtml(route.id, ctx);
    mount(route.id, ctx);

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
  if (HomeView.handleAction) return HomeView.handleAction(act, el, ctx, type);  // ← 加这行
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

    Router.start(App.render);
  };

  global.App = App;
})(window);