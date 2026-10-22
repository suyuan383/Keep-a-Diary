(function () {
  const KEY = 'habit';

  let listTab = 'today';       // 列表页 tab：today | manage | reward
  let detailTab = 'week';      // 详情页 tab：week | month | year
  let summaryOpen = false;     // 月汇总是否展开
  let summaryYM = null;        // { year, month } 汇总显示的月份

  /* =========================================================
     数据层
     ========================================================= */
  function getData() {
    const data = Store.ensure(KEY, () => ({ items: [] }));
    (data.items || []).forEach(normalizeItem);
    return data;
  }

  function normalizeItem(it) {
    if (!it.type) it.type = 'count'; // count | duration | limit
    if (it.dailyTarget == null) it.dailyTarget = Number(it.target) || 1;
    if (it.weeklyTarget === undefined) it.weeklyTarget = null;
    if (it.monthlyTarget === undefined) it.monthlyTarget = null;
    if (it.yearlyTarget === undefined) it.yearlyTarget = null;
    if (!it.unit) it.unit = it.type === 'duration' ? '分钟' : (it.type === 'limit' ? '元' : '次');
    if (!it.records) it.records = {};
    
    // 补全分组：老习惯自动归到第一个分组
    if (!it.groupId && window.Reward) {
      const gs = Reward.getGroups();
      if (gs.length) it.groupId = gs[0].id;
    }
    return it;
  }

  function activeItems() {
    return getData().items.filter(it => !it.archived);
  }
  function getCount(item, ds) {
    return (item.records && item.records[ds]) || 0;
  }
  function setCount(item, ds, v) {
    item.records = item.records || {};
    if (v <= 0) delete item.records[ds];
    else item.records[ds] = v;
  }

  // 计算某月总和
  function getMonthSum(item, ds) {
    const prefix = ds.slice(0, 7);
    return Object.keys(item.records || {}).reduce((sum, key) => {
      if (key.startsWith(prefix)) return sum + item.records[key];
      return sum;
    }, 0);
  }

  // 计算某年总和
  function getYearSum(item, ds) {
    const prefix = ds.slice(0, 4);
    return Object.keys(item.records || {}).reduce((sum, key) => {
      if (key.startsWith(prefix)) return sum + item.records[key];
      return sum;
    }, 0);
  }

  /* =========================================================
     结算辅助
     ========================================================= */
  function trySettle(habit, date) {
    if (!window.Reward || !habit) return;
    try { Reward.settleCheck(habit, date); } catch (e) { console.warn(e); }
  }

  /* =========================================================
     日期 & 格式化工具
     ========================================================= */
  const WEEK_CN = ['一', '二', '三', '四', '五', '六', '日'];
  function startOfWeek(d) {
    const t = new Date(d); const wd = t.getDay();
    t.setDate(t.getDate() + (wd === 0 ? -6 : 1 - wd)); t.setHours(0,0,0,0); return t;
  }
  function addDays(d, n) { const t = new Date(d); t.setDate(t.getDate() + n); return t; }
  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
  function getSummaryYM() {
    if (!summaryYM) { const now = new Date(); summaryYM = { year: now.getFullYear(), month: now.getMonth() }; }
    return summaryYM;
  }

  function fmtVal(item, v) {
    if (item.type === 'duration') {
      if (v >= 60 && v % 60 === 0) return (v / 60) + '小时';
      if (v >= 60) { return Math.floor(v/60) + '小时' + (v%60) + '分'; }
      return v + '分钟';
    }
    return v + (item.unit || '次');
  }
  function fmtNum(item, v) {
    if (item.type === 'duration') return v + '分';
    return v + (item.unit || '');
  }
  function unitOf(item) { return item.type === 'duration' ? '分钟' : (item.unit || '次'); }

  /* =========================================================
     注册模块
     ========================================================= */
  Registry.register({
    id: 'habit', name: '习惯打卡', icon: '✅', order: 10, storageKey: KEY,

    homeCard() {
      const today = U.todayStr();
      const items = activeItems();

      const rewardBlock = renderRewardHomeBlock();

      if (!items.length) {
        return `<div class="card">
          <div class="card-head"><span class="card-icon">✅</span><span class="card-title">习惯打卡</span><a class="card-more" href="#habit">去设置 ›</a></div>
          <div class="card-empty">还没有打卡项，点击右上角添加</div>
          ${rewardBlock}
        </div>`;
      }

      const rows = items.map(it => {
        const c = getCount(it, today);
        let done = false;
        let pct = 0;
        let countText = '';

        if (it.type === 'limit') {
          // 限制型（越少越好）
          const mSum = getMonthSum(it, today);
          const mTarget = it.monthlyTarget || it.dailyTarget;
          done = c <= it.dailyTarget && mSum <= mTarget; // 简单判断
          pct = Math.min(100, Math.round(c / it.dailyTarget * 100));
          countText = `${c}/${it.dailyTarget}${it.unit}`;
        } else {
          pct = Math.min(100, Math.round(c / it.dailyTarget * 100));
          done = c >= it.dailyTarget;
          countText = `${c}/${it.dailyTarget}${it.type === 'duration' ? '分' : (it.unit || '次')}`;
        }

        const isDur = it.type === 'duration';
        const isLimit = it.type === 'limit';
        const plusAct = isLimit ? 'habit-add-limit' : (isDur ? 'habit-add-time' : 'habit-inc');
        const btnCls = isLimit ? 'habit-plus limit' : 'habit-plus';

        return `<div class="habit-row ${done ? 'done' : (isLimit ? 'over-limit' : '')}">
          <span class="habit-icon">${U.escape(it.icon || '•')}</span>
          <a class="habit-name" href="#habit/${it.id}">
            ${U.escape(it.name)}<span class="habit-chevron">›</span>
          </a>
          <span class="habit-progress"><i style="width:${isLimit ? Math.max(0, 100-pct) : pct}%"></i></span>
          <span class="habit-count">${countText}</span>
          <button class="${btnCls}" data-act="${plusAct}" data-id="${it.id}" data-module="habit">+</button>
        </div>`;
      }).join('');

      return `<div class="card">
        <div class="card-head"><span class="card-icon">✅</span><span class="card-title">习惯打卡</span><a class="card-more" href="#habit">详情 ›</a></div>
        <div class="habit-list">${rows}</div>
        ${rewardBlock}
      </div>`;
    },

    page(ctx) {
      if (ctx && ctx.arg === 'reward') { listTab = 'reward'; return renderList(); }
      if (ctx && ctx.arg) return renderDetail(ctx.arg);
      return renderList();
    },

    handleAction(act, el, ctx) {
      const today = U.todayStr();

      if (act && act.indexOf('reward-') === 0) {
        if (window.Reward && Reward.handleAction(act, el, ctx)) return true;
        return false;
      }

      if (act === 'habit-tab') { listTab = el.dataset.tab; ctx.refresh(); return true; }
      if (act === 'habit-detail-tab') { detailTab = el.dataset.tab; ctx.refresh(); return true; }
      if (act === 'habit-toggle-summary') { summaryOpen = !summaryOpen; ctx.refresh(); return true; }

      if (act === 'habit-summary-prev' || act === 'habit-summary-next') {
        const ym = getSummaryYM();
        let m = ym.month + (act === 'habit-summary-prev' ? -1 : 1); let y = ym.year;
        if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
        summaryYM = { year: y, month: m }; ctx.refresh(); return true;
      }
      if (act === 'habit-summary-now') {
        const now = new Date(); summaryYM = { year: now.getFullYear(), month: now.getMonth() }; ctx.refresh(); return true;
      }

      /* ---- 打卡加/减 ---- */
      if (act === 'habit-inc' || act === 'habit-dec') {
        const id = el.dataset.id;
        const dir = act === 'habit-inc' ? 1 : -1;
        Store.update(KEY, data => {
          const it = data.items.find(x => x.id === id);
          if (it) { setCount(it, today, Math.max(0, getCount(it, today) + dir)); if (dir > 0) trySettle(it, today); }
          return data;
        });
        return true;
      }

      /* ---- 时长型：+N 分钟 ---- */
      if (act === 'habit-add-time') {
        const id = el.dataset.id;
        const it = getData().items.find(x => x.id === id);
        if (!it) return true;
        UI.form('记录「' + it.name + '」时长', [
          { name: 'minutes', label: '本次时长（分钟）', type: 'number', value: 30, required: true }
        ]).then(r => {
          if (!r) return;
          const mins = Math.max(1, Math.round(Number(r.minutes) || 0));
          if (!mins) return;
          Store.update(KEY, data => {
            const t = data.items.find(x => x.id === id);
            if (t) { setCount(t, today, getCount(t, today) + mins); trySettle(t, today); }
            return data;
          });
        });
        return true;
      }

      /* ---- 限制型：记录消耗 ---- */
      if (act === 'habit-add-limit') {
        const id = el.dataset.id;
        const it = getData().items.find(x => x.id === id);
        if (!it) return true;
        UI.form('记录「' + it.name + '」消耗', [
          { name: 'val', label: '本次消耗（' + (it.unit || '元') + '）', type: 'number', value: '', required: true },
          { name: 'mode', label: '操作', type: 'select', value: 'add', options: [
            { value: 'add', label: '累加（消耗增加）' },
            { value: 'set', label: '覆盖（改为该数值）' }
          ]}
        ]).then(r => {
          if (!r) return;
          const val = Math.max(0, Number(r.val) || 0);
          Store.update(KEY, data => {
            const t = data.items.find(x => x.id === id);
            if (t) {
              const cur = getCount(t, today);
              setCount(t, today, r.mode === 'add' ? cur + val : val);
            }
            return data;
          });
        });
        return true;
      }

      /* ---- 新增 ---- */
      if (act === 'habit-add') {
        const groups = (window.Reward) ? Reward.getGroups() : [];
        if (window.Reward && !groups.length) {
          UI.confirm('还没有奖励账户分组，请先到"奖励账户"创建一个分组。\n现在去看？').then(ok => {
            if (ok) { listTab = 'reward'; if (ctx && ctx.refresh) ctx.refresh(); }
          });
          return true;
        }

        const fields = [];
        if (groups.length) {
          fields.push({ name: 'group', label: '所属分组', type: 'select', value: groups[0].id, options: groups.map(g => ({ value: g.id, label: g.name })) });
        }
        fields.push(
          { name: 'name', label: '名称', required: true, placeholder: '例如：游戏充值' },
          { name: 'icon', label: '图标（emoji）', placeholder: '🎮' },
          { name: 'type', label: '打卡类型', type: 'select', value: 'count', options: [
              { value: 'count', label: '次数打卡（越多越好）' },
              { value: 'duration', label: '时长打卡（越多越好）' },
              { value: 'limit', label: '限制打卡（越少越好，超了变红）' }
          ]},
          { name: 'dailyTarget', label: '每日上限/目标', type: 'number', value: 1, required: true },
          { name: 'unit', label: '单位（次/分钟/元）', value: '' },
          { name: 'weeklyTarget', label: '周目标/上限（可留空）', type: 'number', value: '' },
          { name: 'monthlyTarget', label: '月目标/上限（可留空）', type: 'number', value: '' },
          { name: 'yearlyTarget', label: '年目标/上限（可留空）', type: 'number', value: '' }
        );

        UI.form('新增打卡项', fields).then(r => {
          if (!r) return;
          const item = {
            id: U.uid('h'), name: r.name, icon: r.icon || (r.type === 'limit' ? '🚫' : '✅'),
            type: r.type || 'count', groupId: r.group || (groups[0] ? groups[0].id : null),
            dailyTarget: Math.max(1, Number(r.dailyTarget) || 1),
            unit: r.unit || (r.type === 'duration' ? '分钟' : (r.type === 'limit' ? '元' : '次')),
            weeklyTarget: r.weeklyTarget === '' ? null : Math.max(1, Number(r.weeklyTarget)),
            monthlyTarget: r.monthlyTarget === '' ? null : Math.max(1, Number(r.monthlyTarget)),
            yearlyTarget: r.yearlyTarget === '' ? null : Math.max(1, Number(r.yearlyTarget)),
            archived: false, createdAt: today, records: {}
          };
          Store.update(KEY, data => { data.items.push(item); return data; });
        });
        return true;
      }

      /* ---- 编辑 ---- */
      if (act === 'habit-edit') {
        const id = el.dataset.id;
        const it = getData().items.find(x => x.id === id);
        if (!it) return true;

        const groups = (window.Reward) ? Reward.getGroups() : [];
        const fields = [];
        if (groups.length) {
          fields.push({ name: 'group', label: '所属分组', type: 'select', value: it.groupId || groups[0].id, options: groups.map(g => ({ value: g.id, label: g.name })) });
        }
        fields.push(
          { name: 'name', label: '名称', required: true, value: it.name },
          { name: 'icon', label: '图标（emoji）', value: it.icon },
          { name: 'dailyTarget', label: '每日目标/上限（' + unitOf(it) + '）', type: 'number', value: it.dailyTarget, required: true },
          { name: 'unit', label: '单位', value: it.unit },
          { name: 'weeklyTarget', label: '周目标/上限（可留空）', type: 'number', value: it.weeklyTarget == null ? '' : it.weeklyTarget },
          { name: 'monthlyTarget', label: '月目标/上限（可留空）', type: 'number', value: it.monthlyTarget == null ? '' : it.monthlyTarget },
          { name: 'yearlyTarget', label: '年目标/上限（可留空）', type: 'number', value: it.yearlyTarget == null ? '' : it.yearlyTarget }
        );

        UI.form('编辑打卡项', fields).then(r => {
          if (!r) return;
          Store.update(KEY, data => {
            const t = data.items.find(x => x.id === id);
            if (!t) return data;
            t.name = r.name; t.icon = r.icon;
            if (r.group) t.groupId = r.group;
            t.dailyTarget = Math.max(1, Number(r.dailyTarget) || 1);
            t.unit = r.unit || (t.type === 'duration' ? '分钟' : (t.type === 'limit' ? '元' : '次'));
            t.weeklyTarget = r.weeklyTarget === '' ? null : Math.max(1, Number(r.weeklyTarget));
            t.monthlyTarget = r.monthlyTarget === '' ? null : Math.max(1, Number(r.monthlyTarget));
            t.yearlyTarget = r.yearlyTarget === '' ? null : Math.max(1, Number(r.yearlyTarget));
            return data;
          });
        });
        return true;
      }

      if (act === 'habit-archive') {
        const id = el.dataset.id;
        Store.update(KEY, data => { const it = data.items.find(x => x.id === id); if (it) it.archived = !it.archived; return data; });
        return true;
      }

      if (act === 'habit-del') {
        const id = el.dataset.id;
        UI.confirm('删除后历史记录也会一起删除，确定吗？').then(ok => {
          if (!ok) return;
          Store.update(KEY, data => { data.items = data.items.filter(x => x.id !== id); return data; });
          if (ctx.arg === id) Router.go('habit');
        });
        return true;
      }

      return false;
    }
  });

  /* =========================================================
     主页卡片：奖励账户余额块
     ========================================================= */
  function renderRewardHomeBlock() {
    if (!window.Reward) return '';
    let groups = [];
    try { groups = Reward.getGroups(); } catch (e) { return ''; }
    if (!groups.length) return '';

    const rows = groups.map(g => {
      const bal = g.balance || 0;
      const isNeg = bal < 0;
      const absYuan = Math.abs(bal) / 100;
      const numStr = Number.isInteger(absYuan) ? String(absYuan) : absYuan.toFixed(2).replace(/\.?0+$/, '');
      const text = isNeg ? `欠账 ¥ ${numStr}` : `¥ ${numStr}`;
      return `<div class="habit-reward-row">
        <span class="habit-reward-icon">${U.escape(g.icon || '💰')}</span>
        <span class="habit-reward-name">${U.escape(g.name)}</span>
        <span class="habit-reward-balance ${isNeg ? 'negative' : ''}">${text}</span>
      </div>`;
    }).join('');

    return `<div class="habit-reward-block">
      <div class="habit-reward-title"><span>💰 奖励账户</span><a class="habit-reward-link" href="#habit/reward">详情 ›</a></div>
      ${rows}
    </div>`;
  }

  /* =========================================================
     列表页
     ========================================================= */
  function renderList() {
    const tabs = `
      <div class="tabs">
        <button class="tab ${listTab === 'today' ? 'active' : ''}" data-act="habit-tab" data-tab="today">今日打卡</button>
        <button class="tab ${listTab === 'manage' ? 'active' : ''}" data-act="habit-tab" data-tab="manage">事项管理</button>
        <button class="tab ${listTab === 'reward' ? 'active' : ''}" data-act="habit-tab" data-tab="reward">奖励账户</button>
      </div>`;

    if (listTab === 'reward') {
      if (!window.Reward) return `<div class="module habit-module">${tabs}<div class="empty">奖励账户模块未加载</div></div>`;
      let rewardHtml = '';
      try { rewardHtml = Reward.render(); } catch (e) { rewardHtml = `<div class="empty">加载失败</div>`; }
      return `<div class="module habit-module">${tabs}${rewardHtml}</div>`;
    }

    const summaryBtn = `<button class="summary-toggle-btn ${summaryOpen ? 'active' : ''}" data-act="habit-toggle-summary">📊 ${summaryOpen ? '收起月汇总' : '查看月打卡汇总'}</button>`;
    const summaryHtml = summaryOpen ? renderSummary() : '';

    return `<div class="module habit-module">
      ${tabs}
      ${summaryBtn}
      ${summaryHtml}
      <div class="module-body">${listTab === 'today' ? renderToday() : renderManage()}</div>
    </div>`;
  }

  /* =========================================================
     月汇总视图
     ========================================================= */
  function renderSummary() {
    const ym = getSummaryYM(); const year = ym.year; const month = ym.month;
    const dim = daysInMonth(year, month); const todayStr = U.todayStr();
    const now = new Date(); const isCurrentMonth = (now.getFullYear() === year && now.getMonth() === month);
    const items = activeItems();

    let headerCells = '';
    for (let d = 1; d <= dim; d++) {
      const dt = new Date(year, month, d); const ds = U.todayStr(dt); const wd = dt.getDay();
      const cls = ['sum-th', (wd === 0 || wd === 6) ? 'weekend' : '', ds === todayStr ? 'today' : ''].filter(Boolean).join(' ');
      headerCells += `<th class="${cls}">${d}</th>`;
    }

    let rows = '';
    items.forEach(it => {
      let cells = ''; let okDays = 0; let pastDays = 0;
      for (let d = 1; d <= dim; d++) {
        const ds = U.todayStr(new Date(year, month, d));
        const isFuture = ds > todayStr; const isToday = ds === todayStr;
        const c = getCount(it, ds);
        let ok = false;
        
        if (it.type === 'limit') {
          // 限制型，当天 0 或 <= 日限额都算OK（除非月累计超了，为了表格清晰，这里只看当日是否超标）
          ok = !isFuture && c <= it.dailyTarget;
        } else {
          ok = !isFuture && c >= it.dailyTarget;
        }

        if (!isFuture) { pastDays++; if (ok) okDays++; }

        let dotCls = 'future'; let title = '';
        if (isFuture) { dotCls = 'future'; title = '未开始'; }
        else if (ok) { dotCls = 'ok'; title = '达标'; }
        else { dotCls = 'miss'; title = '未达标'; }
        if (isToday) dotCls += ' today';

        cells += `<td class="sum-td"><span class="sum-dot ${dotCls}" title="${ds} · ${title}"></span></td>`;
      }
      const rate = pastDays ? Math.round(okDays / pastDays * 100) : 0;
      rows += `<tr><td class="sum-name"><span class="sum-icon">${U.escape(it.icon || '•')}</span><span class="sum-name-text">${U.escape(it.name)}</span></td>${cells}<td class="sum-rate">${pastDays ? rate + '%' : '—'}</td></tr>`;
    });

    const bodyHtml = items.length
      ? `<div class="summary-scroll"><table class="summary-table"><thead><tr><th class="sum-name-th">习惯</th>${headerCells}<th class="sum-rate-th">率</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : `<div class="empty">暂无打卡项</div>`;

    return `<div class="summary-wrap">
      <div class="summary-head">
        <button class="sum-nav" data-act="habit-summary-prev">‹</button>
        <span class="sum-title">${year}年${month + 1}月 ${isCurrentMonth ? '<span class="sum-now-tag">本月</span>' : ''}</span>
        <div class="sum-nav-group">${!isCurrentMonth ? '<button class="sum-now" data-act="habit-summary-now">回到本月</button>' : ''}<button class="sum-nav" data-act="habit-summary-next">›</button></div>
      </div>
      ${bodyHtml}
      <div class="sum-legend"><span><i class="sum-dot ok"></i>达标</span><span><i class="sum-dot miss"></i>未达标</span><span><i class="sum-dot future"></i>未开始</span></div>
    </div>`;
  }

  /* =========================================================
     今日打卡视图
     ========================================================= */
  function renderToday() {
    const today = U.todayStr();
    const items = activeItems();

    if (!items.length) {
      return `<div class="empty">还没有打卡项<br><button class="btn btn-primary" data-act="habit-add" style="margin-top:12px">+ 新增打卡项</button></div>`;
    }

    const rows = items.map(it => {
      const c = getCount(it, today);
      const isDur = it.type === 'duration';
      const isLimit = it.type === 'limit';
      const plusAct = isLimit ? 'habit-add-limit' : (isDur ? 'habit-add-time' : 'habit-inc');
      const minusAct = isDur ? 'habit-sub-time' : 'habit-dec';
      
      let pct = 0; let done = false; let statusText = ''; let chips = [];

      if (isLimit) {
        const mSum = getMonthSum(it, today);
        const mTarget = it.monthlyTarget || '未设';
        const dOver = c > it.dailyTarget;
        const mOver = it.monthlyTarget && mSum > it.monthlyTarget;
        
        done = !dOver && !mOver;
        pct = Math.min(100, Math.round(c / it.dailyTarget * 100));
        
        if (dOver) statusText = '⚠️ 今日已超限';
        else if (mOver) statusText = '⚠️ 本月已超限';
        else statusText = '✅ 安全范围内';

        chips.push(`日上限 ${it.dailyTarget}${unitOf(it)}`);
        if (it.monthlyTarget) chips.push(`本月已用 ${mSum}/${it.monthlyTarget}${unitOf(it)}`);
        if (it.yearlyTarget) chips.push(`年目标 ${it.yearlyTarget}${unitOf(it)}`);

      } else {
        pct = Math.min(100, Math.round(c / it.dailyTarget * 100));
        done = c >= it.dailyTarget;
        statusText = done ? '已达标' : `目标 ${it.dailyTarget}${unitOf(it)}`;
        chips.push(`每日 ${it.dailyTarget}${unitOf(it)}`);
        if (it.weeklyTarget) chips.push(`周 ${it.weeklyTarget}${unitOf(it)}`);
        if (it.monthlyTarget) chips.push(`月 ${it.monthlyTarget}${unitOf(it)}`);
        if (it.yearlyTarget) chips.push(`年 ${it.yearlyTarget}${unitOf(it)}`);
      }

      return `<div class="habit-item ${done ? 'done' : (isLimit ? 'over-limit' : '')}">
        <div class="habit-item-main">
          <span class="habit-icon lg">${U.escape(it.icon || '•')}</span>
          <div class="habit-item-info">
            <a class="habit-item-name" href="#habit/${it.id}">${U.escape(it.name)}<span class="habit-chevron">›</span></a>
            <div class="habit-item-sub">${isLimit ? statusText : '今日 ' + fmtVal(it, c) + (done ? ' · 已达标' : '')}</div>
            <div class="habit-item-chips">${chips.map(c => `<span class="chip">${c}</span>`).join('')}</div>
            ${isLimit ? `<div class="habit-progress limit"><i style="width:${pct}%"></i></div>` : `<div class="habit-progress"><i style="width:${pct}%"></i></div>`}
          </div>
        </div>
        <div class="habit-item-actions">
          ${isLimit ? `<button class="btn btn-ghost" data-act="${plusAct}" data-id="${it.id}">记一笔</button>` : `
            <button class="btn btn-ghost" data-act="${minusAct}" data-id="${it.id}">−</button>
            <span class="habit-num">${fmtNum(it, c)}</span>
            <button class="btn btn-primary" data-act="${plusAct}" data-id="${it.id}">+</button>
          `}
        </div>
      </div>`;
    }).join('');

    return `<div class="habit-today">
      <div class="habit-toolbar"><span class="muted">${U.formatDate(today)} ${U.weekday()}</span><button class="btn btn-ghost" data-act="habit-add">+ 新增</button></div>
      <div class="habit-list">${rows}</div>
    </div>`;
  }

  /* =========================================================
     事项管理视图
     ========================================================= */
  function renderManage() {
    const all = getData().items;
    const groups = (window.Reward) ? Reward.getGroups() : [];
    const groupMap = {}; groups.forEach(g => { groupMap[g.id] = g; });

    if (!all.length) return `<div class="empty">暂无事项<br><button class="btn btn-primary" data-act="habit-add" style="margin-top:12px">+ 新增打卡项</button></div>`;

    const rows = all.map(it => {
      const chips = [];
      chips.push(`${it.type === 'limit' ? '日限' : '每日'} ${it.dailyTarget}${unitOf(it)}`);
      if (it.weeklyTarget)  chips.push(`周 ${it.weeklyTarget}${unitOf(it)}`);
      if (it.monthlyTarget) chips.push(`月 ${it.monthlyTarget}${unitOf(it)}`);
      if (it.yearlyTarget)  chips.push(`年 ${it.yearlyTarget}${unitOf(it)}`);
      
      const typeTag = it.type === 'duration' ? '<span class="tag tag-dur">时长</span>' : (it.type === 'limit' ? '<span class="tag tag-limit">限制</span>' : '');
      const g = it.groupId && groupMap[it.groupId];
      const groupTag = g ? `<span class="tag tag-group">${U.escape(g.icon || '💰')} ${U.escape(g.name)}</span>` : '';

      return `<div class="manage-item ${it.archived ? 'archived' : ''}">
        <span class="habit-icon">${U.escape(it.icon || '•')}</span>
        <div class="manage-info">
          <div class="manage-name">${U.escape(it.name)}${typeTag}${it.archived ? '<span class="tag">已归档</span>' : ''}</div>
          <div class="manage-sub">${groupTag}${chips.join(' · ')}</div>
        </div>
        <div class="manage-actions">
          <button class="btn btn-ghost" data-act="habit-edit" data-id="${it.id}">编辑</button>
          <button class="btn btn-ghost" data-act="habit-archive" data-id="${it.id}">${it.archived ? '恢复' : '归档'}</button>
          <button class="btn btn-danger" data-act="habit-del" data-id="${it.id}">删除</button>
        </div>
      </div>`;
    }).join('');

    return `<div class="habit-manage">
      <div class="habit-toolbar"><span class="muted">共 ${all.length} 项</span><button class="btn btn-primary" data-act="habit-add">+ 新增</button></div>
      <div class="manage-list">${rows}</div>
    </div>`;
  }

  /* =========================================================
     详情页
     ========================================================= */
  function renderDetail(id) {
    const item = getData().items.find(x => x.id === id);
    if (!item) return `<div class="empty">打卡项不存在<br><a class="btn btn-ghost" href="#habit">返回</a></div>`;

    const unit = unitOf(item);
    const chips = [];
    chips.push(`${item.type === 'limit' ? '日限' : '每日'} ≥ ${item.dailyTarget}${unit}`);
    if (item.weeklyTarget)  chips.push(`每周 ≥ ${item.weeklyTarget}${unit}`);
    if (item.monthlyTarget) chips.push(`每月 ≥ ${item.monthlyTarget}${unit}`);
    if (item.yearlyTarget)  chips.push(`每年 ≥ ${item.yearlyTarget}${unit}`);

    const groups = (window.Reward) ? Reward.getGroups() : [];
    const g = groups.find(x => x.id === item.groupId);
    const groupChip = g ? `<span class="meta-chip">${U.escape(g.icon || '💰')} ${U.escape(g.name)}</span>` : '';

    const tabs = `
      <div class="tabs">
        <button class="tab ${detailTab === 'week' ? 'active' : ''}" data-act="habit-detail-tab" data-tab="week">周视图</button>
        <button class="tab ${detailTab === 'month' ? 'active' : ''}" data-act="habit-detail-tab" data-tab="month">月视图</button>
        <button class="tab ${detailTab === 'year' ? 'active' : ''}" data-act="habit-detail-tab" data-tab="year">年视图</button>
      </div>`;

    let body = '';
    if (detailTab === 'week') body = renderWeekView(item);
    else if (detailTab === 'month') body = renderMonthView(item);
    else body = renderYearView(item);

    return `<div class="module habit-module habit-detail">
      <div class="detail-head">
        <a class="detail-back" href="#habit">‹ 返回</a>
        <div class="detail-title"><span class="habit-icon lg">${U.escape(item.icon || '•')}</span><span>${U.escape(item.name)}</span></div>
        <div class="detail-actions">
          <button class="btn btn-ghost" data-act="habit-edit" data-id="${item.id}">编辑</button>
          <button class="btn btn-danger" data-act="habit-del" data-id="${item.id}">删除</button>
        </div>
      </div>
      <div class="detail-meta">
        <span class="meta-type">${item.type === 'duration' ? '⏱ 时长打卡' : (item.type === 'limit' ? '🚫 限制打卡' : '🔢 次数打卡')}</span>
        ${groupChip}${chips.map(c => `<span class="meta-chip">${U.escape(c)}</span>`).join('')}
      </div>
      ${tabs}
      <div class="module-body">${body}</div>
      <div class="detail-legend">
        <span><i class="dot ok"></i>达标/安全</span>
        <span><i class="dot bad"></i>未达标/超限</span>
        <span><i class="dot future"></i>未开始</span>
      </div>
    </div>`;
  }

  /* ---- 周视图 ---- */
  function renderWeekView(item) {
    const now = new Date(); const monday = startOfWeek(now); const todayStr = U.todayStr();
    const isDur = item.type === 'duration'; const isLimit = item.type === 'limit';

    let weekTotal = 0; let cells = '';

    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i); const ds = U.todayStr(d);
      const c = getCount(item, ds); const isFuture = ds > todayStr; const isToday = ds === todayStr;
      if (!isFuture) weekTotal += c;

      let cls = 'future'; let ok = false;
      if (!isFuture) {
        if (isLimit) { ok = c <= item.dailyTarget; }
        else { ok = c >= item.dailyTarget; }
        cls = ok ? 'ok' : 'bad';
      }

      cells += `<div class="week-cell ${cls} ${isToday ? 'today' : ''}">
        <div class="cell-weekday">周${WEEK_CN[i]}</div>
        <div class="cell-day">${d.getDate()}</div>
        <div class="cell-count">${isFuture ? '—' : (isDur || isLimit ? c + '分' : c + '')}</div>
      </div>`;
    }

    let summary;
    if (item.weeklyTarget) {
      const okCls = isLimit ? (weekTotal <= item.weeklyTarget ? 'ok' : '') : (weekTotal >= item.weeklyTarget ? 'ok' : '');
      const pct = isLimit ? Math.min(100, Math.round(weekTotal / item.weeklyTarget * 100)) : Math.min(100, Math.round(weekTotal / item.weeklyTarget * 100));
      summary = `<div class="summary-row"><span>本周累计</span><strong class="${okCls}">${fmtVal(item, weekTotal)} / ${fmtVal(item, item.weeklyTarget)}</strong></div><div class="progress ${okCls}"><i style="width:${pct}%"></i></div>`;
    } else {
      summary = `<div class="summary-row"><span>本周累计</span><strong>${fmtVal(item, weekTotal)}</strong></div>`;
    }

    return `<div class="week-grid">${cells}</div><div class="view-summary">${summary}</div>`;
  }

  /* ---- 月视图 ---- */
  function renderMonthView(item) {
    const now = new Date(); const year = now.getFullYear(); const month = now.getMonth();
    const firstDay = new Date(year, month, 1); const dim = daysInMonth(year, month);
    const offset = (firstDay.getDay() + 6) % 7; const todayStr = U.todayStr();
    const isDur = item.type === 'duration'; const isLimit = item.type === 'limit';

    let monthTotal = 0; let okDays = 0; let pastDays = 0;
    let cells = '';
    for (let i = 0; i < offset; i++) cells += `<div class="month-cell empty"></div>`;

    for (let d = 1; d <= dim; d++) {
      const ds = U.todayStr(new Date(year, month, d)); const c = getCount(item, ds);
      const isFuture = ds > todayStr; const isToday = ds === todayStr;
      
      let ok = false;
      if (!isFuture) {
        monthTotal += c; pastDays++;
        if (isLimit) ok = c <= item.dailyTarget;
        else ok = c >= item.dailyTarget;
        if (ok) okDays++;
      }
      const cls = isFuture ? 'future' : (ok ? 'ok' : 'bad');
      cells += `<div class="month-cell ${cls} ${isToday ? 'today' : ''}" title="${U.formatDate(ds)}：${fmtVal(item, c)}">${d}</div>`;
    }

    let summary;
    if (item.monthlyTarget) {
      const pct = Math.min(100, Math.round(monthTotal / item.monthlyTarget * 100));
      const okCls = isLimit ? (monthTotal <= item.monthlyTarget ? 'ok' : '') : (monthTotal >= item.monthlyTarget ? 'ok' : '');
      summary = `<div class="summary-row"><span>本月累计</span><strong class="${okCls}">${fmtVal(item, monthTotal)} / ${fmtVal(item, item.monthlyTarget)}</strong></div><div class="progress ${okCls}"><i style="width:${pct}%"></i></div>`;
    } else {
      summary = `<div class="summary-row"><span>本月累计</span><strong>${fmtVal(item, monthTotal)}</strong></div>`;
    }

    return `<div class="month-grid"><div class="month-head">${WEEK_CN.map(w => `<span>${w}</span>`).join('')}</div><div class="month-body">${cells}</div></div><div class="view-summary">${summary}</div>`;
  }

  /* ---- 年视图 ---- */
  function renderYearView(item) {
    const year = new Date().getFullYear(); const todayStr = U.todayStr();
    const isDur = item.type === 'duration'; const isLimit = item.type === 'limit';

    let yearTotal = 0; let cells = '';
    for (let m = 0; m < 12; m++) {
      const dim = daysInMonth(year, m); let monthTotal = 0; let pastDays = 0; let okDays = 0;
      for (let d = 1; d <= dim; d++) {
        const ds = U.todayStr(new Date(year, m, d)); if (ds > todayStr) continue;
        const v = getCount(item, ds); monthTotal += v; pastDays++;
        let ok = isLimit ? v <= item.dailyTarget : v >= item.dailyTarget;
        if (ok) okDays++;
      }
      yearTotal += monthTotal;

      let cls = 'future';
      if (pastDays > 0) {
        if (item.monthlyTarget) {
          cls = isLimit ? (monthTotal <= item.monthlyTarget ? 'ok' : 'bad') : (monthTotal >= item.monthlyTarget ? 'ok' : 'bad');
        } else {
          cls = okDays === pastDays ? 'ok' : 'bad';
        }
      }
      cells += `<div class="year-cell ${cls}"><div class="year-month">${m + 1}月</div><div class="year-count">${pastDays > 0 ? fmtNum(item, monthTotal) : '—'}</div></div>`;
    }

    let summary;
    if (item.yearlyTarget) {
      const pct = Math.min(100, Math.round(yearTotal / item.yearlyTarget * 100));
      const okCls = isLimit ? (yearTotal <= item.yearlyTarget ? 'ok' : '') : (yearTotal >= item.yearlyTarget ? 'ok' : '');
      summary = `<div class="summary-row"><span>本年累计</span><strong class="${okCls}">${fmtVal(item, yearTotal)} / ${fmtVal(item, item.yearlyTarget)}</strong></div><div class="progress ${okCls}"><i style="width:${pct}%"></i></div>`;
    } else {
      summary = `<div class="summary-row"><span>本年累计</span><strong>${fmtVal(item, yearTotal)}</strong></div>`;
    }

    return `<div class="year-grid">${cells}</div><div class="view-summary">${summary}</div>`;
  }
})();