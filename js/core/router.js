(function (global) {
  const Router = {
    // 解析当前 hash：#habit/item_xxx → { id:'habit', arg:'item_xxx' }
    parse() {
      const raw = (location.hash || '').replace(/^#/, '') || 'home';
      const parts = raw.split('/');
      return {
        raw: raw,
        id: parts[0] || 'home',
        arg: parts[1] ? decodeURIComponent(parts[1]) : null
      };
    },

    // 兼容旧调用：只取模块 id
    current() {
      return Router.parse().id;
    },

    go(path) {
      const cur = (location.hash || '').replace(/^#/, '');
      if (cur === path) {
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } else {
        location.hash = path;
      }
    },

    start(renderFn) {
      window.addEventListener('hashchange', renderFn);
      renderFn();
    }
  };
  global.Router = Router;
})(window);