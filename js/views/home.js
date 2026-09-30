(function (global) {
  const HomeView = {
    render() {
      const custom = Store.get('homeGreeting') || '';
      const greeting = custom || APP_CONFIG.homeGreeting();
      const today = U.todayStr();
      const len = greeting.length;
      const sizeCls = len > 24 ? 'xlong' : (len > 16 ? 'long' : '');

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
          <div class="home-greeting ${sizeCls}" data-act="home-edit-greeting" title="点击编辑">
            <span class="home-greeting-text">${U.escape(greeting)}</span>
            <span class="home-edit-icon">✏️</span>
          </div>
          <div class="home-date">${U.formatDate(today)} ${U.weekday()}</div>
        </div>
        <div class="home-cards">${cards}</div>
      </div>`;
    },

    mounted() {},

    handleAction(act, el, ctx) {
      if (act === 'home-edit-greeting') {
        const custom = Store.get('homeGreeting') || '';
        UI.form('编辑主页文字', [
          { name: 'text', label: '显示内容（留空则恢复默认）', type: 'textarea',
            value: custom || APP_CONFIG.homeGreeting(),
            placeholder: '例如：今天也要元气满满' }
        ]).then(r => {
          if (!r) return;
          const text = (r.text || '').trim();
          Store.set('homeGreeting', text);
          UI.toast(text ? '已保存' : '已恢复默认');
        });
        return true;
      }
      return false;
    }
  };
  global.HomeView = HomeView;
})(window);