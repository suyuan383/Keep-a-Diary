(function (global) {
  const HomeView = {
    render() {
      const greeting = APP_CONFIG.homeGreeting();
      const today = U.todayStr();

      const cards = Registry.all().map(m => {
        if (!m.homeCard) return '';
        try { return m.homeCard(); }
        catch (e) {
          console.error('[home] 模块卡片渲染失败：', m.id, e);
          return '';
        }
      }).join('');

      return `<div class="home">
        <div class="home-hero">
          <div class="home-greeting">${U.escape(greeting)}</div>
          <div class="home-date">${U.formatDate(today)} ${U.weekday()}</div>
        </div>
        <div class="home-cards">${cards}</div>
      </div>`;
    },
    mounted() {}
  };
  global.HomeView = HomeView;
})(window);