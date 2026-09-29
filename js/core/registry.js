(function (global) {
  const modules = [];
  const map = {};

  const Registry = {
    /**
     * 模块契约：
     * {
     *   id: 'habit',              // 唯一 id，用作路由 #habit
     *   name: '习惯打卡',          // 侧边栏显示名
     *   icon: '✅',               // 侧边栏图标
     *   order: 10,                // 排序，越小越靠前
     *   storageKey: 'habit',      // 在 DB 中的键名
     *   homeCard(),               // 可选：返回主页卡片 HTML
     *   page(ctx),                // 必须：返回模块页面 HTML
     *   mounted(ctx),             // 可选：渲染后回调
     *   handleAction(act, el, ctx) // 可选：处理 data-act，返回 true 表示已处理
     * }
     */
    register(mod) {
      if (!mod || !mod.id) throw new Error('模块必须有 id');
      if (map[mod.id]) console.warn('[registry] 模块已存在，覆盖：', mod.id);
      map[mod.id] = mod;
      if (!modules.includes(mod)) modules.push(mod);
      modules.sort((a, b) => (a.order || 100) - (b.order || 100));
    },
    get(id) { return map[id] || null; },
    all() { return modules.slice(); }
  };

  global.Registry = Registry;
})(window);