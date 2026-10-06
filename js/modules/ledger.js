(function () {
  const KEY = 'ledger';

  /* ============ 预设分类 ============ */
  const EXPENSE_CATS = [
    { id: 'food',      icon: '🍜', name: '餐饮', hint: '三餐、外卖、零食、饮料' },
    { id: 'transport', icon: '🚌', name: '交通', hint: '公交、地铁、打车、加油、停车' },
    { id: 'shopping',  icon: '🛒', name: '购物', hint: '网购、日用品、衣服、家电' },
    { id: 'fun',       icon: '🎮', name: '娱乐', hint: '电影、游戏、聚会、旅游' },
    { id: 'home',      icon: '🏠', name: '居住', hint: '房租、水电、物业、宽带' },
    { id: 'medical',   icon: '💊', name: '医疗', hint: '药品、挂号、体检' },
    { id: 'study',     icon: '📚', name: '学习', hint: '书、课程、文具' },
    { id: 'comm',      icon: '📱', name: '通讯', hint: '话费、流量、会员订阅' },
    { id: 'gift',      icon: '🎁', name: '人情', hint: '红包、礼物、随礼' },
    { id: 'other_e',   icon: '📦', name: '其他', hint: '不确定就放这里' }
  ];
  const INCOME_CATS = [
    { id: 'salary',    icon: '💰', name: '工资', hint: '月薪、加班费' },
    { id: 'bonus',     icon: '🎉', name: '奖金', hint: '年终奖、绩效' },
    { id: 'redpacket', icon: '🧧', name: '红包', hint: '亲友转账' },
    { id: 'parttime',  icon: '💼', name: '兼职', hint: '外快、副业' },
    { id: 'invest',    icon: '📈', name: '理财', hint: '利息、分红' },
    { id: 'refund',    icon: '🧾', name: '报销', hint: '公司报销、退款' },
    { id: 'other_i',   icon: '📥', name: '其他', hint: '' }
  ];
  const ACCOUNTS = [
    { id: 'wechat', icon: '💚', name: '微信' },
    { id: 'alipay', icon: '💙', name: '支付宝' },
    { id: 'cash',   icon: '💵', name: '现金' },
    { id: 'card',   icon: '💳', name: '银行卡' }
  ];

  /* ============ 模块状态 ============ */
  let viewTab = 'list';       // list | stats | trend | accounts
  let viewRange = 'month';    // week | month | year
  let anchorDate = null;      // 当前视图锚定的日期（Date 对象）
  let sheetState = null;

  /* ============ 数据层 ============ */
  function getData() {
    const d = Store.ensure(KEY, () => ({
      cycleStartDay: 20,
      budget: 0,
      lastAccount: 'wechat',
      records: [],
      accounts: [],
      customExpense: [],
      customIncome: []
    }));
    if (!Array.isArray(d.records)) d.records = [];
    if (!Array.isArray(d.accounts)) d.accounts = [];
    if (!d.cycleStartDay || d.cycleStartDay < 1 || d.cycleStartDay > 28) d.cycleStartDay = 1;
    return d;
  }

  function catsFor(type) {
    const base = type === 'income' ? INCOME_CATS : EXPENSE_CATS;
    const d = getData();
    const custom = type === 'income' ? d.customIncome : d.customExpense;
    return base.concat(custom || []);
  }
  function findCat(type, id) {
    return catsFor(type).find(c => c.id === id) ||
           { id: id, icon: '❓', name: '未分类', hint: '' };
  }
  function findAcc(id) {
    return ACCOUNTS.find(a => a.id === id) || null;
  }

  /* ============ 金额换算 ============ */
  function fenToYuan(fen) { return (fen / 100).toFixed(2); }
  function yuanToFen(s) {
    const v = parseFloat(String(s).trim());
    if (!isFinite(v) || v < 0) return null;
    return Math.round(v * 100);
  }
  function fmtFen(fen) {
    const yuan = fen / 100;
    if (Number.isInteger(yuan)) return String(yuan);
    return yuan.toFixed(2).replace(/\.?0+$/, '');
  }

  /* ============ 日期 & 周期 ============ */
  function dateStr(d) {
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate());
  }
  function parseDate(s) {
    const p = String(s).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  // 返回给定日期所属的预算周期（含自定义起始日）
  function getCycleRange(anchor) {
    const startDay = getData().cycleStartDay;
    const d = new Date(anchor);
    let y = d.getFullYear(), m = d.getMonth(), dd = d.getDate();
    let startY = y, startM = m;
    if (dd < startDay) {
      startM = m - 1;
      if (startM < 0) { startM = 11; startY--; }
    }
    const start = new Date(startY, startM, startDay);
    let endM = startM + 1, endY = startY;
    if (endM > 11) { endM = 0; endY++; }
    // end 是下周期的前一天
    const end = new Date(endY, endM, startDay);
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  function getRangeFor(range, anchor) {
    const d = new Date(anchor);
    if (range === 'week') {
      const wd = d.getDay();
      const diff = wd === 0 ? -6 : 1 - wd;
      const start = new Date(d);
      start.setDate(start.getDate() + diff);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }
    if (range === 'month') return getCycleRange(d);
    const y = d.getFullYear();
    return {
      start: new Date(y, 0, 1, 0, 0, 0),
      end: new Date(y, 11, 31, 23, 59, 59)
    };
  }

  function getAnchor() {
    if (!anchorDate) anchorDate = new Date();
    return anchorDate;
  }
  function recordsInRange(range) {
    const s = dateStr(range.start);
    const e = dateStr(range.end);
    return getData().records.filter(r => {
      const d = r.date || '';
      return d >= s && d <= e;
    });
  }

  /* ============ 预算状态 ============ */
  function computeBudgetStatus() {
    const data = getData();
    if (!data.budget || data.budget <= 0) return null;
    const range = getCycleRange(new Date());
    const recs = recordsInRange(range);
    const spent = recs.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    const remain = data.budget - spent;
    const rawPct = spent / data.budget * 100;
    const pct = Math.min(999, Math.round(rawPct));
    let cls = 'ok';
    if (rawPct >= 100) cls = 'over';
    else if (rawPct >= 80) cls = 'warn';
    return { budget: data.budget, spent, remain, pct, cls };
  }

  function fmtRangeLabel(range) {
    const s = range.start, e = range.end;
    const f = d => (d.getMonth() + 1) + '/' + d.getDate();
    if (viewRange === 'year') return s.getFullYear() + '年';
    if (viewRange === 'week') return f(s) + ' - ' + f(e);
    return s.getFullYear() + '/' + f(s) + ' - ' + f(e);
  }

  /* ============ 图表（纯 SVG 双柱） ============ */
  function buildBarChart(data, opts) {
    opts = opts || {};
    const W = 360, H = 200;
    const padL = 40, padR = 10, padT = 16, padB = 26;
    const cw = W - padL - padR, ch = H - padT - padB;

    if (!data.length) {
      return `<svg viewBox="0 0 ${W} ${H}" class="chart">
        <text x="${W / 2}" y="${H / 2 + 4}" text-anchor="middle" fill="#bbb" font-size="13">暂无数据</text>
      </svg>`;
    }
    const maxVal = Math.max(1, ...data.map(d => Math.max(d.income, d.expense)));

    // y 轴网格
    let grid = '';
    for (let i = 0; i <= 4; i++) {
      const y = padT + ch * i / 4;
      const val = maxVal * (1 - i / 4);
      grid += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#eef0f3" stroke-width="1"/>`;
      grid += `<text x="${padL - 5}" y="${y + 3.5}" text-anchor="end" font-size="9" fill="#999">${fmtFen(Math.round(val))}</text>`;
    }

    const colW = cw / data.length;
    const barW = Math.max(3, colW * 0.3);
    const gap = 2;
    const incGradId = 'inc_' + Math.random().toString(36).slice(2, 8);
    const expGradId = 'exp_' + Math.random().toString(36).slice(2, 8);
    let bars = '';
    data.forEach((d, i) => {
      const cx = padL + colW * (i + 0.5);
      const hInc = maxVal ? (d.income / maxVal) * ch : 0;
      const hExp = maxVal ? (d.expense / maxVal) * ch : 0;
      if (d.income > 0) {
        bars += `<rect x="${cx - barW - gap / 2}" y="${padT + ch - hInc}"
          width="${barW}" height="${hInc}" fill="url(#${incGradId})" rx="3"/>`;
      }
      if (d.expense > 0) {
        bars += `<rect x="${cx + gap / 2}" y="${padT + ch - hExp}"
          width="${barW}" height="${hExp}" fill="url(#${expGradId})" rx="3"/>`;
      }
      bars += `<text x="${cx}" y="${H - 8}" text-anchor="middle"
        font-size="10" fill="#999">${d.label}</text>`;
    });

    return `<svg viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="${incGradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#7dd6a4"/>
          <stop offset="100%" stop-color="#b8ead0"/>
        </linearGradient>
        <linearGradient id="${expGradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f5a3a3"/>
          <stop offset="100%" stop-color="#fad0d0"/>
        </linearGradient>
      </defs>
      ${grid}
      <line x1="${padL}" y1="${padT + ch}" x2="${W - padR}" y2="${padT + ch}" stroke="#d8dce1" stroke-width="1"/>
      ${bars}
    </svg>`;
  }

  function buildTrendData(year) {
    const arr = [];
    for (let m = 0; m < 12; m++) {
      const anchor = new Date(year, m, 15);
      const range = getCycleRange(anchor);
      const recs = recordsInRange(range);
      const income = recs.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
      const expense = recs.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
      arr.push({ label: (m + 1) + '月', income, expense });
    }
    return arr;
  }

  /* ============ 注册模块 ============ */
  Registry.register({
    id: 'ledger',
    name: '记账',
    icon: '💰',
    order: 20,
    storageKey: KEY,

    homeCard() {
      const range = getCycleRange(new Date());
      const recs = recordsInRange(range);
      const expense = recs.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
      const income  = recs.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
      const balance = income - expense;
      const bs = computeBudgetStatus();

      const budgetHtml = bs ? `
        <div class="ledger-home-budget">
          <div class="lhb-head">
            <span class="lhb-label">预算进度</span>
            <span class="lhb-pct ${bs.cls}">${bs.pct}%</span>
          </div>
          <div class="lhb-bar"><i class="${bs.cls}" style="width:${Math.min(100, bs.pct)}%"></i></div>
          <div class="lhb-foot ${bs.cls}">
            ${bs.remain >= 0
              ? '剩余 ' + fmtFen(bs.remain) + ' / ' + fmtFen(bs.budget)
              : '超支 ' + fmtFen(-bs.remain)}
          </div>
        </div>` : '';

      if (!recs.length && !bs) {
        return `<div class="card">
          <div class="card-head">
            <span class="card-icon">💰</span>
            <span class="card-title">记账</span>
            <a class="card-more" href="#ledger">去记录 ›</a>
          </div>
          <div class="card-empty">本周期还没有记录</div>
        </div>`;
      }

      return `<div class="card">
        <div class="card-head">
          <span class="card-icon">💰</span>
          <span class="card-title">记账 · 本周期</span>
          <a class="card-more" href="#ledger">详情 ›</a>
        </div>
        <div class="ledger-home-stats">
          <div class="lh-stat">
            <span class="lh-label">支出</span>
            <span class="lh-val expense">${fmtFen(expense)}</span>
          </div>
          <div class="lh-stat">
            <span class="lh-label">收入</span>
            <span class="lh-val income">${fmtFen(income)}</span>
          </div>
          <div class="lh-stat">
            <span class="lh-label">结余</span>
            <span class="lh-val ${balance >= 0 ? 'ok' : 'bad'}">${balance >= 0 ? '' : '-'}${fmtFen(Math.abs(balance))}</span>
          </div>
        </div>
        ${budgetHtml}
      </div>`;
    },

    page() { return renderPage(); },

    handleAction(act, el, ctx) {
      /* ---- 打开记账面板 ---- */
      if (act === 'ledger-add') { openSheet(null); return true; }
      if (act === 'ledger-edit') {
        const rec = getData().records.find(r => r.id === el.dataset.id);
        if (rec) openSheet(rec);
        return true;
      }
      if (act === 'ledger-del') {
        const id = el.dataset.id;
        UI.confirm('确定删除这条记录吗？').then(ok => {
          if (!ok) return;
          Store.update(KEY, d => {
            d.records = d.records.filter(r => r.id !== id);
            return d;
          });
        });
        return true;
      }

      /* ---- 主 Tab ---- */
      if (act === 'ledger-tab') {
        viewTab = el.dataset.tab;
        ctx.refresh();
        return true;
      }

      /* ---- 流水页的 周/月/年 切换 ---- */
      if (act === 'ledger-range') {
        viewRange = el.dataset.range;
        ctx.refresh();
        return true;
      }

      /* ---- 前后翻页 ---- */
      if (act === 'ledger-prev' || act === 'ledger-next') {
        const dir = act === 'ledger-prev' ? -1 : 1;
        const a = getAnchor();
        if (viewRange === 'week') a.setDate(a.getDate() + 7 * dir);
        else if (viewRange === 'month') a.setMonth(a.getMonth() + dir);
        else a.setFullYear(a.getFullYear() + dir);
        anchorDate = a;
        ctx.refresh();
        return true;
      }
      if (act === 'ledger-now') {
        anchorDate = new Date();
        ctx.refresh();
        return true;
      }

      /* ---- 设置周期起始日 + 预算 ---- */
      if (act === 'ledger-set-cycle') {
        const data = getData();
        UI.form('预算设置', [
          { name: 'day', label: '每月起始日（1-28）', type: 'number',
            value: data.cycleStartDay, required: true },
          { name: 'budget', label: '每周期支出预算（元，留空 = 不设）', type: 'number',
            value: data.budget > 0 ? fenToYuan(data.budget) : '' }
        ]).then(r => {
          if (!r) return;
          Store.update(KEY, d => {
            d.cycleStartDay = Math.max(1, Math.min(28, Number(r.day) || 1));
            if (r.budget === '' || r.budget == null) d.budget = 0;
            else d.budget = yuanToFen(r.budget) || 0;
            return d;
          });
          UI.toast('已保存');
        });
        return true;
      }

      /* ---- 账户：转发到独立函数 ---- */
      if (act === 'acc-add')          { doAccAdd(); return true; }
      if (act === 'acc-action-sheet') { openAccActionSheet(el.dataset.id); return true; }
      if (act === 'acc-add-money')    { doAccAddMoney(el.dataset.id); return true; }
      if (act === 'acc-sub-money')    { doAccSubMoney(el.dataset.id); return true; }
      if (act === 'acc-edit')         { doAccEdit(el.dataset.id); return true; }
      if (act === 'acc-del')          { doAccDel(el.dataset.id); return true; }

      return false;
    }
  });

  /* ============ 主页面 ============ */
  function renderPage() {
    const data = getData();
    const settingParts = ['周期 ' + data.cycleStartDay + ' 号起'];
    if (data.budget > 0) settingParts.push('预算 ' + fmtFen(data.budget));

    const head = `
      <div class="ledger-page-head">
        <span class="ledger-page-title">记账</span>
        <button class="ledger-page-setting" data-act="ledger-set-cycle" title="预算设置">
          ⚙️ ${settingParts.join(' · ')}
        </button>
      </div>`;

    const tabs = `
      <div class="tabs">
        <button class="tab ${viewTab === 'list' ? 'active' : ''}" data-act="ledger-tab" data-tab="list">流水</button>
        <button class="tab ${viewTab === 'stats' ? 'active' : ''}" data-act="ledger-tab" data-tab="stats">统计</button>
        <button class="tab ${viewTab === 'trend' ? 'active' : ''}" data-act="ledger-tab" data-tab="trend">趋势</button>
        <button class="tab ${viewTab === 'accounts' ? 'active' : ''}" data-act="ledger-tab" data-tab="accounts">账户</button>
      </div>`;

    let body = '';
    if (viewTab === 'list') body = renderList();
    else if (viewTab === 'stats') body = renderStats();
    else if (viewTab === 'trend') body = renderTrend();
    else body = renderAccounts();

    return `<div class="module ledger-module">
      ${head}
      ${tabs}
      ${body}
      <button class="fab" data-act="ledger-add" aria-label="记一笔">+</button>
    </div>`;
  }

  /* ============ 流水页 ============ */
  function renderList() {
    const range = getRangeFor(viewRange, getAnchor());
    const recs = recordsInRange(range);
    const expense = recs.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    const income  = recs.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    const balance = income - expense;

    const rangeSwitcher = `
      <div class="ledger-range-switch">
        <button class="${viewRange === 'week' ? 'active' : ''}" data-act="ledger-range" data-range="week">周</button>
        <button class="${viewRange === 'month' ? 'active' : ''}" data-act="ledger-range" data-range="month">月</button>
        <button class="${viewRange === 'year' ? 'active' : ''}" data-act="ledger-range" data-range="year">年</button>
      </div>`;

    const head = `
      <div class="ledger-range-head">
        <button class="sum-nav" data-act="ledger-prev">‹</button>
        <span class="ledger-range-title">${fmtRangeLabel(range)}</span>
        <div class="ledger-range-right">
          <button class="sum-now" data-act="ledger-now">现在</button>
          <button class="sum-nav" data-act="ledger-next">›</button>
        </div>
      </div>`;

    const summary = `
      <div class="ledger-summary">
        <div class="ls-item">
          <span class="ls-label">支出</span>
          <span class="ls-val expense">${fmtFen(expense)}</span>
        </div>
        <div class="ls-item">
          <span class="ls-label">收入</span>
          <span class="ls-val income">${fmtFen(income)}</span>
        </div>
        <div class="ls-item">
          <span class="ls-label">结余</span>
          <span class="ls-val ${balance >= 0 ? 'ok' : 'bad'}">${balance >= 0 ? '' : '-'}${fmtFen(Math.abs(balance))}</span>
        </div>
      </div>`;

    // 预算条
    const bs = computeBudgetStatus();
    const budgetBar = bs ? `
      <div class="ledger-budget">
        <div class="lb-head">
          <span class="lb-title">📊 本周期预算</span>
          <span class="lb-pct ${bs.cls}">${bs.pct}%</span>
        </div>
        <div class="lb-bar"><i class="${bs.cls}" style="width:${Math.min(100, bs.pct)}%"></i></div>
        <div class="lb-foot">
          <span>已花 ${fmtFen(bs.spent)}</span>
          <span class="${bs.cls}">
            ${bs.remain >= 0
              ? '剩余 ' + fmtFen(bs.remain) + ' / ' + fmtFen(bs.budget)
              : '超支 ' + fmtFen(-bs.remain)}
          </span>
        </div>
      </div>` : '';

    return `${rangeSwitcher}${head}${summary}${budgetBar}${renderFlowList(recs)}`;
  }

  function renderFlowList(recs) {
    if (!recs.length) {
      return `<div class="empty" style="padding:30px 16px">
        本周期暂无记录<br>
        <button class="btn btn-primary" data-act="ledger-add" style="margin-top:12px">+ 记一笔</button>
      </div>`;
    }
    // 按日期分组
    const byDate = {};
    recs.forEach(r => {
      const d = r.date || '';
      (byDate[d] = byDate[d] || []).push(r);
    });
    const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

    return `<div class="ledger-list">` + dates.map(date => {
      const dayRecs = byDate[date].slice().sort((a, b) =>
        (b.createdAt || 0) - (a.createdAt || 0));
      const dayExpense = dayRecs.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
      const dayIncome  = dayRecs.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);

      let dateLabel = U.formatDate(date);
      const today = U.todayStr();
      if (date === today) dateLabel = '今天';
      else {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        if (U.todayStr(d) === date) dateLabel = '昨天';
      }
      const subtotalParts = [];
      if (dayExpense) subtotalParts.push(`支 ${fmtFen(dayExpense)}`);
      if (dayIncome)  subtotalParts.push(`收 ${fmtFen(dayIncome)}`);

      const items = dayRecs.map(r => {
        const cat = findCat(r.type, r.category);
        const acc = findAcc(r.account);
        const sign = r.type === 'income' ? '+' : '-';
        const cls = r.type === 'income' ? 'income' : 'expense';
        const subs = [];
        if (r.time) subs.push(r.time);
        if (acc) subs.push(acc.name);
        if (r.note) subs.push(r.note);
        return `<div class="ledger-item">
          <span class="ledger-cat-icon">${U.escape(cat.icon)}</span>
          <div class="ledger-item-main">
            <div class="ledger-item-title">${U.escape(cat.name)}</div>
            <div class="ledger-item-sub">${U.escape(subs.join(' · '))}</div>
          </div>
          <span class="ledger-amount ${cls}">${sign}${fmtFen(r.amount)}</span>
          <button class="ledger-item-menu" data-act="ledger-edit" data-id="${r.id}">⋯</button>
        </div>`;
      }).join('');

      return `<div class="ledger-day">
        <div class="ledger-day-head">
          <span class="ledger-day-label">${dateLabel}</span>
          <span class="ledger-day-sub">${subtotalParts.join(' / ')}</span>
        </div>
        ${items}
      </div>`;
    }).join('') + `</div>`;
  }

  /* ============ 统计页 ============ */
  function renderStats() {
    const range = getRangeFor(viewRange, getAnchor());
    const recs = recordsInRange(range);
    if (!recs.length) {
      return `<div class="empty" style="padding:36px 16px">本周期暂无数据</div>`;
    }
    return `
      ${renderCatRank(recs, 'expense', '支出分类')}
      ${renderCatRank(recs, 'income', '收入分类')}
    `;
  }

  function renderCatRank(recs, type, title) {
    const filtered = recs.filter(r => r.type === type);
    if (!filtered.length) {
      return `<div class="rank-card">
        <div class="rank-title">${title}</div>
        <div class="card-empty" style="padding:6px 0">无记录</div>
      </div>`;
    }
    const map = {};
    filtered.forEach(r => { map[r.category] = (map[r.category] || 0) + r.amount; });
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    const list = Object.keys(map).map(cid => ({
      cat: findCat(type, cid),
      amount: map[cid]
    })).sort((a, b) => b.amount - a.amount);
    const max = list[0].amount;

    const rows = list.map(x => {
      const pct = Math.round(x.amount / total * 100);
      const width = Math.round(x.amount / max * 100);
      const barCls = type === 'income' ? 'income' : 'expense';
      return `<div class="rank-item">
        <span class="rank-icon">${U.escape(x.cat.icon)}</span>
        <div class="rank-main">
          <div class="rank-line">
            <span class="rank-name">${U.escape(x.cat.name)}</span>
            <span class="rank-amount">${fmtFen(x.amount)}</span>
          </div>
          <div class="rank-bar"><i class="${barCls}" style="width:${width}%"></i></div>
        </div>
        <span class="rank-pct">${pct}%</span>
      </div>`;
    }).join('');

    const totalCls = type === 'income' ? 'income' : 'expense';
    return `<div class="rank-card">
      <div class="rank-title">
        <span>${title}</span>
        <span class="rank-total ${totalCls}">${fmtFen(total)}</span>
      </div>
      ${rows}
    </div>`;
  }

  /* ============ 趋势页 ============ */
  function renderTrend() {
    const year = getAnchor().getFullYear();
    const data = buildTrendData(year);
    const totalIncome  = data.reduce((s, d) => s + d.income, 0);
    const totalExpense = data.reduce((s, d) => s + d.expense, 0);
    const balance = totalIncome - totalExpense;

    const head = `
      <div class="ledger-range-head">
        <button class="sum-nav" data-act="ledger-prev">‹</button>
        <span class="ledger-range-title">${year}年</span>
        <div class="ledger-range-right">
          <button class="sum-now" data-act="ledger-now">今年</button>
          <button class="sum-nav" data-act="ledger-next">›</button>
        </div>
      </div>`;

    const summary = `
      <div class="ledger-summary">
        <div class="ls-item">
          <span class="ls-label">年支出</span>
          <span class="ls-val expense">${fmtFen(totalExpense)}</span>
        </div>
        <div class="ls-item">
          <span class="ls-label">年收入</span>
          <span class="ls-val income">${fmtFen(totalIncome)}</span>
        </div>
        <div class="ls-item">
          <span class="ls-label">年结余</span>
          <span class="ls-val ${balance >= 0 ? 'ok' : 'bad'}">${balance >= 0 ? '' : '-'}${fmtFen(Math.abs(balance))}</span>
        </div>
      </div>`;

    const legend = `
      <div class="trend-legend">
        <span><i class="t-dot income"></i>收入</span>
        <span><i class="t-dot expense"></i>支出</span>
      </div>`;

    return `${head}${summary}
      <div class="chart-card">
        <div class="chart-title">
          <span>月度收支趋势</span>
          <span class="chart-unit">${year}年</span>
        </div>
        ${buildBarChart(data)}
        ${legend}
      </div>`;
  }

  /* ============ 账户页 ============ */
  function renderAccounts() {
    const accounts = getData().accounts;

    if (!accounts.length) {
      return `<div class="empty" data-emoji="💰">
        还没有存钱计划<br>
        <button class="btn btn-primary" data-act="acc-add" style="margin-top:12px">+ 新建计划</button>
      </div>`;
    }

    const active = accounts.filter(a => !a.target || a.amount < a.target);
    const done   = accounts.filter(a => a.target && a.amount >= a.target);

    const tabHeader = `
      <div class="acc-tabs-header">
        <span class="acc-tab active">进行中(${active.length})</span>
        <span class="acc-tab-divider">/</span>
        <span class="acc-tab">已结束(${done.length})</span>
      </div>`;

    let body = active.map(a => renderAccCard(a)).join('');
    if (done.length) {
      body += `<div class="acc-done-title">已结束</div>`;
      body += done.map(a => renderAccCard(a)).join('');
    }

    return `${tabHeader}
      <div class="acc-list">${body}</div>
      <button class="btn btn-ghost acc-add-btn" data-act="acc-add">+ 新建存钱计划</button>`;
  }

  function renderAccCard(a) {
    const hasTarget = a.target > 0;
    const pct = hasTarget ? Math.min(100, Math.round(a.amount / a.target * 100 * 100) / 100) : 0;
    const remain = hasTarget ? Math.max(0, a.target - a.amount) : 0;
    const isDone = hasTarget && a.amount >= a.target;

    const gradients = [
      'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
      'linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)',
      'linear-gradient(135deg, #d4fc79 0%, #96e6a1 100%)',
      'linear-gradient(135deg, #fbc2eb 0%, #a6c1ee 100%)',
      'linear-gradient(135deg, #fddb92 0%, #d1fdff 100%)'
    ];
    const fallbackBg = gradients[(a.name || '').length % gradients.length];
    const bgStyle = a.image
      ? `background-image: url('${U.escape(a.image)}');`
      : `background-image: ${fallbackBg};`;

    return `<div class="acc-card-image" style="${bgStyle}" data-act="acc-action-sheet" data-id="${a.id}">
      <div class="acc-card-overlay">
        <div class="acc-card-top">
          <div class="acc-card-name">${U.escape(a.name)}</div>
          <button class="acc-card-menu" data-act="acc-action-sheet" data-id="${a.id}">⋯</button>
        </div>

        <div class="acc-card-middle">
          <div class="acc-card-target">${hasTarget ? '¥ ' + fenToYuan(a.target) : '—'}</div>
          <div class="acc-card-pct">${hasTarget ? pct.toFixed(2) + '%' : '0%'}</div>
        </div>

        <div class="acc-card-bar">
          <div class="acc-card-bar-fill" style="width:${pct}%"></div>
        </div>

        <div class="acc-card-foot">
          <span class="acc-card-saved">已攒入：¥ ${fenToYuan(a.amount)}</span>
          <span class="acc-card-remain">${isDone ? '已达成 🎉' : '剩余：¥ ' + fenToYuan(remain)}</span>
        </div>
      </div>
    </div>`;
  }

  /* =========================================================
     账户操作：独立函数（handleAction 和底部菜单共用）
     ========================================================= */

  function doAccAdd() {
    UI.form('新建存钱计划', [
      { name: 'name', label: '计划名称', required: true, placeholder: '例如：旅行基金' },
      { name: 'target', label: '目标金额', type: 'number', value: '', required: true },
      { name: 'amount', label: '已攒入金额', type: 'number', value: 0, required: true },
      { name: 'image',  label: '背景图片链接（可留空，自动使用渐变）', value: '' }
    ]).then(r => {
      if (!r) return;
      const amtFen = yuanToFen(r.amount) || 0;
      const tgtFen = yuanToFen(r.target) || 0;
      Store.update(KEY, d => {
        d.accounts.push({
          id: U.uid('a'),
          name: r.name,
          target: tgtFen,
          amount: amtFen,
          image: r.image || '',
          createdAt: Date.now()
        });
        return d;
      });
    });
  }

  function doAccAddMoney(id) {
    const acc = getData().accounts.find(a => a.id === id);
    if (!acc) return;
    UI.form('存入「' + acc.name + '」', [
      { name: 'amt', label: '存入金额', type: 'number', value: '', required: true }
    ]).then(r => {
      if (!r) return;
      const fen = yuanToFen(r.amt);
      if (!fen) return;
      Store.update(KEY, d => {
        const t = d.accounts.find(x => x.id === id);
        if (t) t.amount += fen;
        return d;
      });
      UI.toast('已存入');
    });
  }

  function doAccSubMoney(id) {
    const acc = getData().accounts.find(a => a.id === id);
    if (!acc) return;
    UI.form('从「' + acc.name + '」取出', [
      { name: 'amt', label: '取出金额', type: 'number', value: '', required: true }
    ]).then(r => {
      if (!r) return;
      const fen = yuanToFen(r.amt);
      if (!fen) return;
      Store.update(KEY, d => {
        const t = d.accounts.find(x => x.id === id);
        if (t) t.amount = Math.max(0, t.amount - fen);
        return d;
      });
      UI.toast('已取出');
    });
  }

  function doAccEdit(id) {
    const acc = getData().accounts.find(a => a.id === id);
    if (!acc) return;
    UI.form('编辑计划', [
      { name: 'name', label: '计划名称', required: true, value: acc.name },
      { name: 'target', label: '目标金额', type: 'number', value: fenToYuan(acc.target || 0), required: true },
      { name: 'amount', label: '已攒入金额', type: 'number', value: fenToYuan(acc.amount), required: true },
      { name: 'image',  label: '背景图片链接（可留空）', value: acc.image || '' }
    ]).then(r => {
      if (!r) return;
      const amtFen = yuanToFen(r.amount) || 0;
      const tgtFen = yuanToFen(r.target) || 0;
      Store.update(KEY, d => {
        const t = d.accounts.find(x => x.id === id);
        if (t) {
          t.name = r.name;
          t.target = tgtFen;
          t.amount = amtFen;
          t.image = r.image || '';
        }
        return d;
      });
    });
  }

  function doAccDel(id) {
    const acc = getData().accounts.find(a => a.id === id);
    if (!acc) return;
    UI.confirm(`确定删除「${acc.name}」吗？`).then(ok => {
      if (!ok) return;
      Store.update(KEY, d => {
        d.accounts = d.accounts.filter(a => a.id !== id);
        return d;
      });
    });
  }

  /* ============ 账户底部操作菜单 ============ */
  function openAccActionSheet(id) {
    const acc = getData().accounts.find(a => a.id === id);
    if (!acc) return;

    const old = document.getElementById('accSheet');
    if (old) old.remove();

    const mask = document.createElement('div');
    mask.id = 'accSheet';
    mask.className = 'acc-sheet-mask';
    mask.innerHTML = `
      <div class="acc-sheet">
        <div class="acc-sheet-handle"></div>
        <div class="acc-sheet-title">${U.escape(acc.name)}</div>
        <div class="acc-sheet-btns">
          <button class="acc-sheet-btn primary" data-acc-act="add">
            <span class="acc-sheet-icon">📥</span>存入
          </button>
          <button class="acc-sheet-btn" data-acc-act="sub">
            <span class="acc-sheet-icon">📤</span>取出
          </button>
          <button class="acc-sheet-btn" data-acc-act="edit">
            <span class="acc-sheet-icon">✏️</span>编辑
          </button>
          <button class="acc-sheet-btn danger" data-acc-act="del">
            <span class="acc-sheet-icon">🗑️</span>删除
          </button>
        </div>
        <button class="acc-sheet-cancel" data-acc-act="cancel">取消</button>
      </div>`;

    document.body.appendChild(mask);
    requestAnimationFrame(() => mask.classList.add('show'));

    mask.addEventListener('click', e => {
      if (e.target === mask) { closeAccSheet(); return; }
      const btn = e.target.closest('[data-acc-act]');
      if (!btn) return;
      const act = btn.dataset.accAct;
      closeAccSheet();
      // 等底部面板收起来再弹新表单，避免动画打架
      setTimeout(() => {
        if (act === 'add')       doAccAddMoney(id);
        else if (act === 'sub')  doAccSubMoney(id);
        else if (act === 'edit') doAccEdit(id);
        else if (act === 'del')  doAccDel(id);
      }, 220);
    });

    function closeAccSheet() {
      mask.classList.remove('show');
      setTimeout(() => { if (mask.parentNode) mask.parentNode.removeChild(mask); }, 220);
    }
  }

  /* ============ 记账面板 ============ */
  function openSheet(editingRec) {
    if (sheetState) return;
    const data = getData();
    sheetState = {
      type: editingRec ? editingRec.type : 'expense',
      amountStr: editingRec ? fenToYuan(editingRec.amount) : '',
      category: editingRec ? editingRec.category : null,
      account: editingRec ? editingRec.account : data.lastAccount,
      date: editingRec ? editingRec.date : U.todayStr(),
      time: editingRec ? (editingRec.time || '') : currentTimeStr(),
      note: editingRec ? (editingRec.note || '') : '',
      editingId: editingRec ? editingRec.id : null,
      moreOpen: !!editingRec
    };
    buildSheet();
  }
  function currentTimeStr() {
    const n = new Date();
    return U.pad(n.getHours()) + ':' + U.pad(n.getMinutes());
  }

  function buildSheet() {
    const old = document.getElementById('ledger-sheet');
    if (old) old.remove();
    const mask = document.createElement('div');
    mask.id = 'ledger-sheet';
    mask.className = 'sheet-mask';
    mask.innerHTML = renderSheet();
    document.body.appendChild(mask);
    requestAnimationFrame(() => mask.classList.add('show'));
    mask.addEventListener('click', e => {
      if (e.target === mask) closeSheet();
    });
    mask.addEventListener('click', onSheetClick);
    mask.addEventListener('input', onSheetInput);

    const amtInput = mask.querySelector('#ledgerAmount');
    if (amtInput) {
      setTimeout(() => {
        amtInput.focus();
        amtInput.setSelectionRange(amtInput.value.length, amtInput.value.length);
      }, 60);
    }
  }

  function renderSheet() {
    const s = sheetState;
    const cats = catsFor(s.type);
    const isEdit = !!s.editingId;
    const curCat = s.category ? cats.find(c => c.id === s.category) : null;

    const typeTabs = `
      <div class="sheet-type-tabs">
        <button class="sheet-type ${s.type === 'expense' ? 'active' : ''}" data-sheet-act="switch-type" data-type="expense">支出</button>
        <button class="sheet-type ${s.type === 'income' ? 'active' : ''}" data-sheet-act="switch-type" data-type="income">收入</button>
      </div>`;

    const amountRow = `
      <div class="sheet-amount-row">
        <span class="sheet-cur">¥</span>
        <input type="text" inputmode="decimal" id="ledgerAmount"
          class="sheet-amount-input"
          data-sheet-act="set-amount"
          value="${U.escape(s.amountStr)}"
          placeholder="0.00" autocomplete="off">
      </div>
      ${curCat && curCat.hint ? `<div class="sheet-cat-hint">${U.escape(curCat.hint)}</div>` : '<div class="sheet-cat-hint empty">&nbsp;</div>'}`;

    const catGrid = `
      <div class="sheet-section-title">选分类</div>
      <div class="sheet-cat-grid">
        ${cats.map(c => `
          <button class="sheet-cat ${s.category === c.id ? 'active' : ''}"
            data-sheet-act="pick-cat" data-id="${U.escape(c.id)}">
            <span class="sheet-cat-icon">${U.escape(c.icon)}</span>
            <span class="sheet-cat-name">${U.escape(c.name)}</span>
          </button>
        `).join('')}
      </div>`;

    const moreHtml = s.moreOpen ? `
      <div class="sheet-more">
        <div class="sheet-section-title">账户</div>
        <div class="sheet-acc-row">
          ${ACCOUNTS.map(a => `
            <button class="sheet-acc ${s.account === a.id ? 'active' : ''}"
              data-sheet-act="pick-acc" data-id="${a.id}">
              <span>${a.icon}</span><span>${a.name}</span>
            </button>
          `).join('')}
        </div>
        <div class="sheet-section-title">日期</div>
        <input type="date" class="sheet-input" id="ledgerDate"
          value="${U.escape(s.date)}" data-sheet-act="set-date">
        <div class="sheet-section-title">时间</div>
        <input type="time" class="sheet-input" id="ledgerTime"
          value="${U.escape(s.time)}" data-sheet-act="set-time">
        <div class="sheet-section-title">备注</div>
        <input type="text" class="sheet-input" id="ledgerNote"
          placeholder="例如：和朋友聚餐"
          value="${U.escape(s.note)}" data-sheet-act="set-note">
      </div>` : '';

    const moreToggle = `
      <button class="sheet-more-toggle" data-sheet-act="toggle-more">
        ${s.moreOpen ? '收起 ▴' : '更多 ▾'}
      </button>`;

    const footer = `
      <div class="sheet-footer">
        ${isEdit ? `<button class="btn btn-danger" data-sheet-act="del">删除</button>` : ''}
        <button class="btn btn-ghost" data-sheet-act="cancel">取消</button>
        <button class="btn btn-primary sheet-save" data-sheet-act="save">保存</button>
      </div>`;

    return `<div class="sheet-panel">
      <div class="sheet-handle"></div>
      ${typeTabs}${amountRow}${catGrid}${moreToggle}${moreHtml}${footer}
    </div>`;
  }

  function onSheetClick(e) {
    const el = e.target.closest('[data-sheet-act]');
    if (!el) return;
    const act = el.dataset.sheetAct;

    if (act === 'switch-type') {
      sheetState.type = el.dataset.type;
      sheetState.category = null;
      rebuildSheetBody(false);
      return;
    }
    if (act === 'pick-cat') {
      sheetState.category = el.dataset.id;
      rebuildSheetBody(false);
      return;
    }
    if (act === 'pick-acc') {
      sheetState.account = el.dataset.id;
      rebuildSheetBody(false);
      return;
    }
    if (act === 'toggle-more') {
      sheetState.moreOpen = !sheetState.moreOpen;
      rebuildSheetBody(false);
      return;
    }
    if (act === 'cancel') { closeSheet(); return; }
    if (act === 'del') {
      const id = sheetState.editingId;
      closeSheet();
      UI.confirm('确定删除这条记录吗？').then(ok => {
        if (!ok) return;
        Store.update(KEY, d => {
          d.records = d.records.filter(r => r.id !== id);
          return d;
        });
      });
      return;
    }
    if (act === 'save') { saveSheet(); return; }
  }

  function onSheetInput(e) {
    const el = e.target.closest('[data-sheet-act]');
    if (!el) return;
    const act = el.dataset.sheetAct;
    if (act === 'set-amount') sheetState.amountStr = el.value;
    else if (act === 'set-date') sheetState.date = el.value;
    else if (act === 'set-time') sheetState.time = el.value;
    else if (act === 'set-note') sheetState.note = el.value;
  }

  function rebuildSheetBody(focusAmount) {
    const mask = document.getElementById('ledger-sheet');
    if (!mask) return;
    mask.innerHTML = renderSheet();
    if (focusAmount !== false) {
      const amt = mask.querySelector('#ledgerAmount');
      if (amt) {
        amt.focus();
        amt.setSelectionRange(amt.value.length, amt.value.length);
      }
    }
  }

  function saveSheet() {
    const s = sheetState;
    const fen = yuanToFen(s.amountStr);
    if (fen == null || fen <= 0) { UI.toast('请输入金额'); return; }
    if (!s.category) { UI.toast('请选择分类'); return; }

    const payload = {
      type: s.type, amount: fen, category: s.category,
      account: s.account || null,
      date: s.date || U.todayStr(),
      time: s.time || '',
      note: (s.note || '').trim()
    };

    Store.update(KEY, d => {
      if (s.editingId) {
        const t = d.records.find(r => r.id === s.editingId);
        if (t) Object.assign(t, payload);
      } else {
        d.records.push({ id: U.uid('l'), ...payload, createdAt: Date.now() });
      }
      if (s.account) d.lastAccount = s.account;
      return d;
    });
    UI.toast(s.editingId ? '已更新' : '已记录');
    closeSheet();
  }

  function closeSheet() {
    const mask = document.getElementById('ledger-sheet');
    if (!mask) { sheetState = null; return; }
    mask.classList.remove('show');
    setTimeout(() => {
      if (mask.parentNode) mask.parentNode.removeChild(mask);
      sheetState = null;
    }, 200);
  }
})();