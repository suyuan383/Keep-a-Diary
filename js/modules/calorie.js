(function () {
  const KEY = 'calorie';

  /* =========================================================
     默认数据层 (所有食物都在这一个数组，用 type 区分)
     ========================================================= */
  const DEFAULT_PRESETS = [
    { id: 'm1', type: 'meal', name: '虾仁波奇饭', cal: 600, tip: '杂粮饭虽好，但沙拉酱/拌饭酱是刺客。' },
    { id: 'm2', type: 'meal', name: '卤鸡腿饭套餐', cal: 900, tip: '热狗肠是加工脂肪，鸡腿去皮吃。' },
    { id: 'm3', type: 'meal', name: '新疆炒米粉', cal: 1100, tip: '红油底料+碳水炸弹，吃一半就停筷吧。' },
    { id: 'm4', type: 'meal', name: '肯德基四件套', cal: 1100, tip: '油炸+蛋挞酥皮+奶茶，偶尔解馋即可。' },
    { id: 'm5', type: 'meal', name: '外婆菜炒蛋盖饭', cal: 750, tip: '避开底部的油汤拌饭。' },
    { id: 'm6', type: 'meal', name: '酸菜小笋炒肉盖饭', cal: 750, tip: '爆炒的肥瘦肉，热量不低。' },
    { id: 'm7', type: 'meal', name: '金汤麻辣烫', cal: 1050, tip: '加工肉+吸满金汤的油条，建议换豆腐。' },
    { id: 'm8', type: 'meal', name: '香辣火锅味米线', cal: 900, tip: '火锅红油汤底，千万别喝汤。' },
    { id: 'd1', type: 'drink', name: '珍珠奶茶(大杯)', cal: 500, tip: '糖和植脂末的重灾区。' },
    { id: 'd2', type: 'drink', name: '生椰拿铁', cal: 200, tip: '生椰乳本身带糖和脂肪，选无糖。' },
    { id: 's1', type: 'snack', name: '乐事薯片(70g)', cal: 380, unit: '包', tip: '一包等于一顿饭的碳水+脂肪。' },
    { id: 's2', type: 'snack', name: '奥利奥(97g)', cal: 470, unit: '包', tip: '糖油混合物，极容易吃多。' },
    { id: 'f1', type: 'fruit', name: '西瓜', cal: 31, unit: 'g', tip: '含糖量不高，但容易吃多，注意控制量。' },
    { id: 'f2', type: 'fruit', name: '苹果', cal: 52, unit: 'g', tip: '富含膳食纤维，饱腹感强。' },
    { id: 'f3', type: 'fruit', name: '香蕉', cal: 89, unit: 'g', tip: '碳水较高，适合运动前后吃。' }
  ];

  function getData() {
    const d = Store.ensure(KEY, () => ({
      targetCal: 1500, 
      presets: [],
      records: []
    }));
    if (!Array.isArray(d.records)) d.records = [];
    if (!Array.isArray(d.presets)) d.presets = [];

    let migrated = false;
    
    // 1. 旧数据分类补全
    d.presets.forEach(p => {
      if (!p.type) { p.type = 'meal'; migrated = true; }
    });

    // 2. 只在第一次加入默认外卖，绝不重复补回
    if (!d._hasDefaultData) {
      const existingNames = d.presets.map(p => p.name);
      DEFAULT_PRESETS.forEach(def => {
        if (!existingNames.includes(def.name)) {
          d.presets.push(def);
        }
      });
      d._hasDefaultData = true;
      migrated = true;
    }

    if (migrated) {
      const updater = Store.updateSilent || Store.update;
      updater.call(Store, KEY, data => {
        data.presets = d.presets;
        data._hasDefaultData = true;
        return data;
      });
    }

    return d;
  }
  /* =========================================================
     注册模块
     ========================================================= */
  let viewTab = 'today'; 
  let mealFilter = 'all'; // all | meal | drink

  Registry.register({
    id: 'calorie', name: '热量记录', icon: '🔥', order: 22, storageKey: KEY,

    homeCard() {
      const data = getData();
      const today = U.todayStr();
      const todayRecs = data.records.filter(r => r.date === today);
      const totalCal = todayRecs.reduce((s, r) => s + r.cal, 0);
      const target = data.targetCal || 1500;
      const remain = target - totalCal;
      const pct = Math.min(100, Math.round(totalCal / target * 100));
      const isOver = totalCal > target;

      return `<div class="card">
        <div class="card-head"><span class="card-icon">🔥</span><span class="card-title">今日热量</span><a class="card-more" href="#calorie">去记录 ›</a></div>
        <div class="cal-home-main">
          <span class="cal-home-num ${isOver ? 'over' : ''}">${totalCal}</span>
          <span class="cal-home-unit">/ ${target} 大卡</span>
        </div>
        <div class="cal-home-hint ${isOver ? 'over' : ''}">
          ${isOver ? `⚠️ 已超出 ${-remain} 大卡` : `还可以吃 ${remain} 大卡`}
        </div>
        <div class="cal-progress"><i class="${isOver ? 'over' : ''}" style="width:${pct}%"></i></div>
      </div>`;
    },

    page() { return renderPage(); },

    handleAction(act, el, ctx) {
      const data = getData();
      const today = U.todayStr();
      const now = new Date();
      const timeStr = U.pad(now.getHours()) + ':' + U.pad(now.getMinutes());

      /* ---- Tab 切换 ---- */
      if (act === 'cal-tab') { viewTab = el.dataset.tab; ctx.refresh(); return true; }
      if (act === 'cal-meal-filter') { mealFilter = el.dataset.filter; ctx.refresh(); return true; }

      /* ---- 设置目标 ---- */
      if (act === 'cal-set-target') {
        UI.form('设置每日热量目标', [
          { name: 'target', label: '每日目标（大卡）', type: 'number', value: data.targetCal, required: true }
        ]).then(r => {
          if (!r) return;
          Store.update(KEY, d => { d.targetCal = Math.max(500, Number(r.target) || 1500); return d; });
        });
        return true;
      }

      /* ---- 快捷记录点击 ---- */
      if (act === 'cal-add-preset') {
        const id = el.dataset.id;
        const preset = data.presets.find(p => p.id === id);
        if (!preset) return true;

        if (preset.type === 'snack') {
          UI.form('吃了多少包？', [
            { name: 'num', label: '数量（包）', type: 'number', value: '1', required: true }
          ]).then(r => {
            if (!r) return;
            const num = Number(r.num) || 0;
            if (num <= 0) return;
            const finalCal = Math.round(preset.cal * num);
            Store.update(KEY, d => {
              d.records.push({ id: U.uid('c'), date: today, time: timeStr, name: preset.name, cal: finalCal, note: `吃了 ${num} 包` });
              return d;
            });
            UI.toast('已记录');
          });
          return true;
        }

        if (preset.type === 'fruit') {
          UI.form('吃了多少克？', [
            { name: 'weight', label: '重量（克）', type: 'number', value: '200', required: true }
          ]).then(r => {
            if (!r) return;
            const weight = Number(r.weight) || 0;
            if (weight <= 0) return;
            const finalCal = Math.round(preset.cal * (weight / 100));
            Store.update(KEY, d => {
              d.records.push({ id: U.uid('c'), date: today, time: timeStr, name: preset.name, cal: finalCal, note: `吃了 ${weight} 克` });
              return d;
            });
            UI.toast('已记录');
          });
          return true;
        }

        // 外卖（饭/奶茶）默认记 1 份
        Store.update(KEY, d => {
          d.records.push({ id: U.uid('c'), date: today, time: timeStr, name: preset.name, cal: preset.cal, note: preset.tip });
          return d;
        });
        UI.toast('已记录 ' + preset.name);
        return true;
      }

      /* ---- 新增快捷食物 ---- */
      if (act === 'cal-add-food') {
        const type = el.dataset.type; // meal | drink | snack | fruit
        const title = { meal: '新增外卖-饭', drink: '新增外卖-奶茶', snack: '新增零食', fruit: '新增水果' }[type];
        
        let fields = [
          { name: 'name', label: '名称', required: true },
          { name: 'cal', label: type === 'fruit' ? '每 100g 热量(大卡)' : (type === 'snack' ? '每包热量(大卡)' : '每份热量(大卡)'), type: 'number', required: true },
          { name: 'tip', label: '饮食建议/备注（可留空）', type: 'text', value: '' }
        ];

        UI.form(title, fields).then(r => {
          if (!r) return;
          Store.update(KEY, d => {
            d.presets.push({
              id: U.uid('p'), type: type, name: r.name, cal: Number(r.cal), tip: r.tip
            });
            return d;
          });
          UI.toast('已添加');
        });
        return true;
      }

      /* ---- 删除快捷食物 ---- */
      if (act === 'cal-del-food') {
        const id = el.dataset.id;
        UI.confirm('删除这个快捷食物？').then(ok => {
          if (!ok) return;
          Store.update(KEY, d => { d.presets = d.presets.filter(p => p.id !== id); return d; });
        });
        return true;
      }

      /* ---- 删除历史记录 ---- */
      if (act === 'cal-del-record') {
        const id = el.dataset.id;
        UI.confirm('删除这条记录？').then(ok => {
          if (!ok) return;
          Store.update(KEY, d => { d.records = d.records.filter(x => x.id !== id); return d; });
        });
        return true;
      }

      /* ---- 包装零食计算器 ---- */
      if (act === 'cal-snack-calc') {
        UI.form('包装零食计算', [
          { name: 'name', label: '零食名称', required: true },
          { name: 'weight', label: '净含量（克）', type: 'number', required: true },
          { name: 'energy', label: '每 100g 能量', type: 'number', required: true },
          { name: 'unit', label: '能量单位', type: 'select', value: 'kj', options: [
            { value: 'kj', label: '千焦 (kJ)' },
            { value: 'kcal', label: '大卡 (kcal)' }
          ]}
        ]).then(r => {
          if (!r) return;
          const weight = Number(r.weight);
          const energy = Number(r.energy);
          if (weight <= 0 || energy <= 0) { UI.toast('请输入有效数值'); return; }
          const kcalPer100 = r.unit === 'kj' ? energy / 4.184 : energy;
          const totalKcal = Math.round(kcalPer100 * (weight / 100));
          
          Store.update(KEY, d => {
            d.records.push({ id: U.uid('c'), date: today, time: timeStr, name: r.name, cal: totalKcal, note: `净含量 ${weight}g` });
            return d;
          });
          UI.toast(`摄入约 ${totalKcal} 大卡`);
        });
        return true;
      }

      return false;
    }
  });

  /* =========================================================
     页面渲染
     ========================================================= */
  function renderPage() {
    const data = getData();
    const today = U.todayStr();
    const todayRecs = data.records.filter(r => r.date === today);
    const totalCal = todayRecs.reduce((s, r) => s + r.cal, 0);
    const target = data.targetCal || 1500;

    const remain = target - totalCal;
    const pct = Math.min(100, Math.round(totalCal / target * 100));
    const isOver = totalCal > target;

    const head = `
      <div class="cal-hero ${isOver ? 'is-over' : ''}">
        <div class="cal-hero-top">
          <span class="cal-hero-title">今日摄入</span>
          <button class="cal-hero-setting" data-act="cal-set-target">⚙️ 目标 ${target}</button>
        </div>
        <div class="cal-hero-val">${totalCal} <span>大卡</span></div>
        <div class="cal-hero-hint">
          ${isOver ? `⚠️ 已超标 ${-remain} 大卡，管住嘴哦` : `距离目标还能吃 <b>${remain}</b> 大卡`}
        </div>
        <div class="cal-hero-bar"><i class="${isOver ? 'over' : ''}" style="width:${pct}%"></i></div>
      </div>`;

    const tabs = `
      <div class="tabs cal-tabs">
        <button class="tab ${viewTab === 'today' ? 'active' : ''}" data-act="cal-tab" data-tab="today">今日</button>
        <button class="tab ${viewTab === 'meal' ? 'active' : ''}" data-act="cal-tab" data-tab="meal">外卖</button>
        <button class="tab ${viewTab === 'snack' ? 'active' : ''}" data-act="cal-tab" data-tab="snack">零食</button>
        <button class="tab ${viewTab === 'fruit' ? 'active' : ''}" data-act="cal-tab" data-tab="fruit">水果</button>
        <button class="tab ${viewTab === 'history' ? 'active' : ''}" data-act="cal-tab" data-tab="history">历史</button>
      </div>`;

    let body = '';

    /* ---- 1. 今日 ---- */
    if (viewTab === 'today') {
      const rows = todayRecs.length ? todayRecs.map(r => `
        <div class="cal-item">
          <div class="cal-item-head">
            <span class="cal-item-name">${U.escape(r.name)}</span>
            <span class="cal-item-val">+${r.cal}</span>
          </div>
          <div class="cal-item-sub">${r.time} · ${U.escape(r.note || '')}</div>
          <button class="cal-item-del" data-act="cal-del-record" data-id="${r.id}">✕</button>
        </div>
      `).join('') : `<div class="empty" data-emoji="🍽">今天还没有记录饮食</div>`;

      body = `<div class="cal-list">${rows}</div>`;
    }

    /* ---- 2. 外卖 ---- */
    else if (viewTab === 'meal') {
      const filterBar = `
        <div class="cal-filter-bar">
          <button class="${mealFilter === 'all' ? 'active' : ''}" data-act="cal-meal-filter" data-filter="all">全部</button>
          <button class="${mealFilter === 'meal' ? 'active' : ''}" data-act="cal-meal-filter" data-filter="meal">🍱 饭类</button>
          <button class="${mealFilter === 'drink' ? 'active' : ''}" data-act="cal-meal-filter" data-filter="drink">🧋 奶茶</button>
        </div>`;

      const items = data.presets.filter(p => (p.type === 'meal' || p.type === 'drink') && (mealFilter === 'all' || p.type === mealFilter));
          const cards = items.map(p => `
        <div class="cal-preset-card">
          <div class="cal-preset-body" data-act="cal-add-preset" data-id="${p.id}">
            <div class="cal-preset-head">
              <span class="cal-preset-name">${U.escape(p.name)}</span>
              <span class="cal-preset-cal">${p.cal} 大卡</span>
            </div>
            ${p.tip ? `<div class="cal-preset-tip">💡 ${U.escape(p.tip)}</div>` : ''}
          </div>
          <button class="cal-preset-del" data-act="cal-del-food" data-id="${p.id}">✕</button>
        </div>
      `).join('');

      body = `${filterBar}<div class="cal-preset-list">${cards}</div>
        <div class="cal-add-row">
          <button class="btn btn-ghost" data-act="cal-add-food" data-type="meal">+ 新增饭类</button>
          <button class="btn btn-ghost" data-act="cal-add-food" data-type="drink">+ 新增奶茶</button>
        </div>`;
    }

    /* ---- 3. 零食 ---- */
    else if (viewTab === 'snack') {
      const items = data.presets.filter(p => p.type === 'snack');
          const cards = items.map(p => `
        <div class="cal-preset-card snack-card">
          <div class="cal-preset-body" data-act="cal-add-preset" data-id="${p.id}">
            <div class="cal-preset-head">
              <span class="cal-preset-name">${U.escape(p.name)}</span>
              <span class="cal-preset-cal">${p.cal} 大卡/包</span>
            </div>
            ${p.tip ? `<div class="cal-preset-tip">💡 ${U.escape(p.tip)}</div>` : ''}
          </div>
          <button class="cal-preset-del" data-act="cal-del-food" data-id="${p.id}">✕</button>
        </div>
      `).join('');

      body = `
        <div class="cal-sub-head">
          <span>快速记录（点击问包数）</span>
          <button class="btn btn-ghost" data-act="cal-add-food" data-type="snack">+ 新增</button>
        </div>
        <div class="cal-preset-list">${cards}</div>
        <div class="cal-snack-calc-card" data-act="cal-snack-calc">
          <span>🧮 临时吃了个新零食？</span>
          <span>点击用计算器录入 ›</span>
        </div>`;
    }

    /* ---- 4. 水果 ---- */
    else if (viewTab === 'fruit') {
      const items = data.presets.filter(p => p.type === 'fruit');
          const cards = items.map(p => `
        <div class="cal-preset-card fruit-card">
          <div class="cal-preset-body" data-act="cal-add-preset" data-id="${p.id}">
            <div class="cal-preset-head">
              <span class="cal-preset-name">${U.escape(p.name)}</span>
              <span class="cal-preset-cal">${p.cal} 大卡/100g</span>
            </div>
            ${p.tip ? `<div class="cal-preset-tip">💡 ${U.escape(p.tip)}</div>` : ''}
          </div>
          <button class="cal-preset-del" data-act="cal-del-food" data-id="${p.id}">✕</button>
        </div>
      `).join('');

      body = `
        <div class="cal-sub-head">
          <span>快速记录（点击问克数）</span>
          <button class="btn btn-ghost" data-act="cal-add-food" data-type="fruit">+ 新增</button>
        </div>
        <div class="cal-preset-list">${cards}</div>`;
    }

    /* ---- 5. 历史 ---- */
    else if (viewTab === 'history') {
      const byDate = {};
      data.records.forEach(r => { (byDate[r.date] = byDate[r.date] || []).push(r); });
      const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

      const cards = dates.length ? dates.map(d => {
        const recs = byDate[d];
        const total = recs.reduce((s, r) => s + r.cal, 0);
        const over = total > target;
        return `<div class="cal-history-card">
          <div class="cal-history-head">
            <span class="cal-history-date">${U.formatDate(d)}</span>
            <span class="cal-history-total ${over ? 'over' : ''}">${total} 大卡 ${over ? '⚠️' : ''}</span>
          </div>
          <div class="cal-history-list">
            ${recs.map(r => `<div class="cal-history-item"><span>${U.escape(r.name)}</span><span>+${r.cal}</span></div>`).join('')}
          </div>
        </div>`;
      }).join('') : `<div class="empty" data-emoji="📅">暂无历史记录</div>`;

      body = `<div class="cal-history-list-wrap">${cards}</div>`;
    }

    return `<div class="module calorie-module">
      ${head}
      ${tabs}
      ${body}
    </div>`;
  }

})();