(function (global) {
  const HomeView = {
    render() {
      const custom = Store.get('homeGreeting') || '';
      const greeting = custom || APP_CONFIG.homeGreeting();
      const today = U.todayStr();
      const len = greeting.length;
      const sizeCls = len > 24 ? 'xlong' : (len > 16 ? 'long' : '');

      const cards = Registry.all().map((m, i) => {
        if (!m.homeCard) return '';
        let html = '';
        try { html = m.homeCard(); }
        catch (e) { console.error('[home]', m.id, e); return ''; }
        return `<div class="home-card-slot module-${m.id}" style="animation-delay:${i * 0.06}s">${html}</div>`;
      }).join('');

      return `<div class="home">
        <div class="home-hero">
          <div class="home-greeting ${sizeCls}" data-act="home-edit-greeting" title="点击编辑">
            <span class="home-greeting-text">${U.escape(greeting)}</span>
            <span class="home-edit-icon">✏️</span>
          </div>
          <div class="home-date">${U.formatDate(today)} ${U.weekday()}</div>
        </div>
        ${renderOverview()}
        <div class="home-cards">${cards}</div>
      <button class="fab" data-act="app-quick-menu" aria-label="快捷操作">+</button>
      </div>`;
    },

    mounted() {},

    handleAction(act, el, ctx) {
      if (act === 'home-edit-greeting') {
        const custom = Store.get('homeGreeting') || '';
        UI.form('编辑主页文字', [
          { name: 'text', label: '显示内容（留空则恢复默认）', type: 'textarea',
            value: custom || APP_CONFIG.homeGreeting() }
        ]).then(r => {
          if (!r) return;
          Store.set('homeGreeting', (r.text || '').trim());
        });
        return true;
      }
      return false;
    }
  };

  /* ---------- 今日概览 ---------- */
  function renderOverview() {
    const today = U.todayStr();
    const items = [];

    // 打卡
    try {
      const h = Store.get('habit');
      if (h && Array.isArray(h.items)) {
        const active = h.items.filter(it => !it.archived);
        if (active.length) {
          const done = active.filter(it => {
            const c = (it.records && it.records[today]) || 0;
            const tgt = it.dailyTarget != null ? it.dailyTarget : (it.target || 1);
            return c >= tgt;
          }).length;
          items.push(`<span class="tov-item tov-habit"><i class="tov-dot"></i>打卡 <b>${done}/${active.length}</b></span>`);
        }
      }
    } catch (e) {}

    // 记账（本周期支出）
    try {
      const l = Store.get('ledger');
      if (l && Array.isArray(l.records)) {
        const startDay = (l.cycleStartDay && l.cycleStartDay >= 1 && l.cycleStartDay <= 28) ? l.cycleStartDay : 1;
        const now = new Date();
        let sy = now.getFullYear(), sm = now.getMonth();
        if (now.getDate() < startDay) { sm--; if (sm < 0) { sm = 11; sy--; } }
        const startDs = sy + '-' + pad(sm+1) + '-' + pad(startDay);
        let em = sm + 1, ey = sy; if (em > 11) { em = 0; ey++; }
        const eEnd = new Date(ey, em, startDay); eEnd.setDate(eEnd.getDate() - 1);
        const endDs = eEnd.getFullYear() + '-' + pad(eEnd.getMonth()+1) + '-' + pad(eEnd.getDate());
        const spent = l.records
          .filter(r => r.type === 'expense' && r.date >= startDs && r.date <= endDs)
          .reduce((s, r) => s + r.amount, 0);
        if (spent > 0) {
          items.push(`<span class="tov-item tov-ledger"><i class="tov-dot"></i>支出 <b>${(spent/100).toFixed(0)}</b></span>`);
        }
      }
    } catch (e) {}

    // 体重
    try {
      const w = Store.get('weight');
      if (w && Array.isArray(w.records) && w.records.length) {
        const sorted = w.records.slice().sort((a,b)=>a.date.localeCompare(b.date));
        const last = sorted[sorted.length - 1];
        if (last && last.date === today) {
          const unit = w.unit === 'jin' ? '斤' : 'kg';
          const v = w.unit === 'jin' ? (last.weight * 2).toFixed(0) : last.weight.toFixed(1);
          items.push(`<span class="tov-item tov-weight"><i class="tov-dot"></i>体重 <b>${v}${unit}</b></span>`);
        }
      }
    } catch (e) {}

    // 事件
    try {
      const ev = Store.get('event');
      if (ev && Array.isArray(ev.events)) {
        const cnt = ev.events.filter(e => e.date === today).length;
        if (cnt > 0) {
          items.push(`<span class="tov-item tov-event"><i class="tov-dot"></i>事件 <b>${cnt}</b></span>`);
        }
      }
    } catch (e) {}

    // 愿望
    try {
      const wl = Store.get('wishlist');
      if (wl && Array.isArray(wl.wishes)) {
        const y = new Date().getFullYear();
        const cur = wl.wishes.filter(w => w.year === y);
        if (cur.length) {
          const done = cur.filter(w => w.done).length;
          items.push(`<span class="tov-item tov-wishlist"><i class="tov-dot"></i>愿望 <b>${done}/${cur.length}</b></span>`);
        }
      }
    } catch (e) {}

    if (!items.length) return '';
    return `<div class="today-overview">${items.join('')}</div>`;
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  global.HomeView = HomeView;
})(window);