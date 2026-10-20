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

  /* ============ 账户背景色方案 ============ */
  const ACC_THEMES = [
    { id: 'auto',    name: '自动',   grad: null },
    { id: 'peach',   name: '蜜桃',   grad: 'linear-gradient(135deg, #ffc3a0, #ffafbd)' },
    { id: 'matcha',  name: '抹茶',   grad: 'linear-gradient(135deg, #a8e6cf, #dcedc1)' },
    { id: 'ocean',   name: '海盐',   grad: 'linear-gradient(135deg, #a1c4fd, #c2e9fb)' },
    { id: 'sunset',  name: '晚霞',   grad: 'linear-gradient(135deg, #f6d365, #fda085)' },
    { id: 'coffee',  name: '奶咖',   grad: 'linear-gradient(135deg, #d4a574, #b08968)' },
    { id: 'forest',  name: '云杉',   grad: 'linear-gradient(135deg, #96e6a1, #4caf7d)' },
    { id: 'rose',    name: '蔷薇',   grad: 'linear-gradient(135deg, #fbc2eb, #f8a5c2)' },
    { id: 'amber',   name: '琥珀',   grad: 'linear-gradient(135deg, #fdc830, #f37335)' },
    { id: 'aurora',  name: '极光',   grad: 'linear-gradient(135deg, #84fab0, #8fd3f4)' },
    { id: 'lilac',   name: '雾紫',   grad: 'linear-gradient(135deg, #c2b3e0, #a6a1e0)' },
    { id: 'meadow',  name: '原野',   grad: 'linear-gradient(135deg, #d4fc79, #96e6a1)' },
    { id: 'midnight',name: '深蓝',   grad: 'linear-gradient(135deg, #667eea, #764ba2)' }
  ];
  function getTheme(id) { return ACC_THEMES.find(t => t.id === id) || null; }

  /* ============ 模块状态 ============ */
  let viewTab = 'list';       // list | stats | trend | accounts | shop
  let viewRange = 'month';    // week | month | year
  let anchorDate = null;
  let sheetState = null;
  let accDetail = null;       // { id, year, view: 'chart' | 'cards' }
  let shopTab = 'cooling';    // cooling | archive

  /* ============ 数据层 ============ */
  function getData() {
    const d = Store.ensure(KEY, () => ({
      cycleStartDay: 20,
      budget: 0,
      lastAccount: 'wechat',
      records: [],
      accounts: [],
      customExpense: [],
      customIncome: [],
      coolingItems: [],
      archiveItems: []
    }));
    if (!Array.isArray(d.records)) d.records = [];
    if (!Array.isArray(d.accounts)) d.accounts = [];
    if (!Array.isArray(d.coolingItems)) d.coolingItems = [];
    if (!Array.isArray(d.archiveItems)) d.archiveItems = [];
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
    return catsFor(type).find(c => c.id === id) || { id: id, icon: '❓', name: '未分类', hint: '' };
  }
  function findAcc(id) { return ACCOUNTS.find(a => a.id === id) || null; }

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
  function dateStr(d) { return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate()); }
  function parseDate(s) {
    const p = String(s).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function parseLocalDate(s) {
    if (!s || typeof s !== 'string') return null;
    const p = s.split('-');
    if (p.length !== 3) return null;
    const y = +p[0], m = +p[1], d = +p[2];
    if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(y, m - 1, d);
    if (isNaN(dt.getTime())) return null;
    return dt;
  }
  function addDays(d, n) {
    const t = new Date(d);
    t.setDate(t.getDate() + n);
    return t;
  }

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

  function getAnchor() { if (!anchorDate) anchorDate = new Date(); return anchorDate; }
  function recordsInRange(range) {
    const s = dateStr(range.start);
    const e = dateStr(range.end);
    return getData().records.filter(r => { const d = r.date || ''; return d >= s && d <= e; });
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

  /* ============ 图表（纯 SVG） ============ */
  function buildBarChart(data) {
    const W = 360, H = 200;
    const padL = 40, padR = 10, padT = 16, padB = 26;
    const cw = W - padL - padR, ch = H - padT - padB;

    if (!data.length) return `<svg viewBox="0 0 ${W} ${H}" class="chart"><text x="${W / 2}" y="${H / 2 + 4}" text-anchor="middle" fill="#bbb" font-size="13">暂无数据</text></svg>`;
    const maxVal = Math.max(1, ...data.map(d => Math.max(d.income, d.expense)));

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
      if (d.income > 0) bars += `<rect x="${cx - barW - gap / 2}" y="${padT + ch - hInc}" width="${barW}" height="${hInc}" fill="url(#${incGradId})" rx="3"/>`;
      if (d.expense > 0) bars += `<rect x="${cx + gap / 2}" y="${padT + ch - hExp}" width="${barW}" height="${hExp}" fill="url(#${expGradId})" rx="3"/>`;
      bars += `<text x="${cx}" y="${H - 8}" text-anchor="middle" font-size="10" fill="#999">${d.label}</text>`;
    });

    return `<svg viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="${incGradId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#7dd6a4"/><stop offset="100%" stop-color="#b8ead0"/></linearGradient>
        <linearGradient id="${expGradId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f5a3a3"/><stop offset="100%" stop-color="#fad0d0"/></linearGradient>
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

      const budgetHtml = bs ? `<div class="ledger-home-budget"><div class="lhb-head"><span class="lhb-label">预算进度</span><span class="lhb-pct ${bs.cls}">${bs.pct}%</span></div><div class="lhb-bar"><i class="${bs.cls}" style="width:${Math.min(100, bs.pct)}%"></i></div><div class="lhb-foot ${bs.cls}">${bs.remain >= 0 ? '剩余 ' + fmtFen(bs.remain) + ' / ' + fmtFen(bs.budget) : '超支 ' + fmtFen(-bs.remain)}</div></div>` : '';

      if (!recs.length && !bs) {
        return `<div class="card"><div class="card-head"><span class="card-icon">💰</span><span class="card-title">记账</span><a class="card-more" href="#ledger">去记录 ›</a></div><div class="card-empty">本周期还没有记录</div></div>`;
      }

      return `<div class="card">
        <div class="card-head"><span class="card-icon">💰</span><span class="card-title">记账 · 本周期</span><a class="card-more" href="#ledger">详情 ›</a></div>
        <div class="ledger-home-stats">
          <div class="lh-stat"><span class="lh-label">支出</span><span class="lh-val expense">${fmtFen(expense)}</span></div>
          <div class="lh-stat"><span class="lh-label">收入</span><span class="lh-val income">${fmtFen(income)}</span></div>
          <div class="lh-stat"><span class="lh-label">结余</span><span class="lh-val ${balance >= 0 ? 'ok' : 'bad'}">${balance >= 0 ? '' : '-'}${fmtFen(Math.abs(balance))}</span></div>
        </div>
        ${budgetHtml}
      </div>`;
    },

    page() { return renderPage(); },

    handleAction(act, el, ctx) {
      /* ---- 打开记账面板 ---- */
      if (act === 'ledger-add') { openSheet(null); return true; }
      if (act === 'ledger-edit') { const rec = getData().records.find(r => r.id === el.dataset.id); if (rec) openSheet(rec); return true; }
      if (act === 'ledger-del') {
        const id = el.dataset.id;
        UI.confirm('确定删除这条记录吗？').then(ok => {
          if (!ok) return;
          Store.update(KEY, d => { d.records = d.records.filter(r => r.id !== id); return d; });
        });
        return true;
      }

      /* ---- 主 Tab ---- */
      if (act === 'ledger-tab') { viewTab = el.dataset.tab; ctx.refresh(); return true; }

      /* ---- 购物清单 Tab 切换 ---- */
      if (act === 'shop-tab') { shopTab = el.dataset.tab; ctx.refresh(); return true; }

      /* ---- 购物清单 CRUD ---- */
      if (act === 'shop-add-cooling') { openCoolingForm(); return true; }
      if (act === 'shop-add-archive') { openArchiveForm(null); return true; }
      if (act === 'shop-edit-archive') { 
        const item = getData().archiveItems.find(x => x.id === el.dataset.id);
        if (item) openArchiveForm(item); 
        return true; 
      }
      if (act === 'shop-buy-cooling') {
        const id = el.dataset.id;
        const item = getData().coolingItems.find(x => x.id === id);
        if (!item) return true;
        UI.form('买下「' + item.name + '」', [
          { name: 'amt', label: '实际购买金额', type: 'number', value: fenToYuan(item.price), required: true }
        ]).then(r => {
          if (!r) return;
          const realPrice = yuanToFen(r.amt) || item.price;
          const isEarly = U.todayStr() < item.endDate;
          Store.update(KEY, d => {
            const t = d.coolingItems.find(x => x.id === id);
            if (t) { t.status = 'bought'; t.realPrice = realPrice; }
            d.archiveItems.push({
              id: U.uid('a'),
              name: item.name,
              price: realPrice,
              date: U.todayStr(),
              status: isEarly ? 'bad' : 'normal', // 如果提前买，默认标记为'bad' (吃灰预警)
              note: isEarly ? '⚠️ 未坚持冷静期，冲动购买' : '坚持了冷静期后购买',
              repurchase: false
            });
            return d;
          });
          UI.toast(isEarly ? '记录完成，下次要忍住哦' : '记录完成');
        });
        return true;
      }
      if (act === 'shop-abandon-cooling') {
        const id = el.dataset.id;
        const item = getData().coolingItems.find(x => x.id === id);
        if (!item) return true;
        UI.form('放弃购买「' + item.name + '」', [
          { name: 'reason', label: '为什么不想买了？', type: 'text', value: '', required: true, placeholder: '例如：发现用不上 / 太贵了' }
        ]).then(r => {
          if (!r) return;
          Store.update(KEY, d => {
            const t = d.coolingItems.find(x => x.id === id);
            if (t) { t.status = 'abandoned'; t.abandonReason = r.reason; }
            return d;
          });
          UI.toast('为你省下了一笔钱！');
        });
        return true;
      }

      /* ---- 账户详情页导航 ---- */
      if (act === 'acc-detail') { accDetail = { id: el.dataset.id, year: new Date().getFullYear(), view: 'chart' }; ctx.refresh(); return true; }
      if (act === 'acc-detail-back') { accDetail = null; ctx.refresh(); return true; }
      if (act === 'acc-detail-view') { if (accDetail) { accDetail.view = el.dataset.view; ctx.refresh(); } return true; }
      if (act === 'acc-detail-year') { if (accDetail) { accDetail.year = Number(el.dataset.year); ctx.refresh(); } return true; }

      /* ---- 账户相关 ---- */
      if (act === 'ledger-set-cycle') { openCycleForm(); return true; }
      if (act === 'acc-add')          { doAccAdd(); return true; }
      if (act === 'acc-action-sheet') { openAccActionSheet(el.dataset.id); return true; }
      if (act === 'acc-add-money')    { doAccAddMoney(el.dataset.id); return true; }
      if (act === 'acc-sub-money')    { doAccSubMoney(el.dataset.id); return true; }
      if (act === 'acc-profit')       { doAccAddProfit(el.dataset.id); return true; }
      if (act === 'acc-edit')         { doAccEdit(el.dataset.id); return true; }
      if (act === 'acc-del')          { doAccDel(el.dataset.id); return true; }

      /* ---- 流水 周/月/年 ---- */
      if (act === 'ledger-range') { viewRange = el.dataset.range; ctx.refresh(); return true; }
      if (act === 'ledger-prev' || act === 'ledger-next') {
        const dir = act === 'ledger-prev' ? -1 : 1;
        const a = getAnchor();
        if (viewRange === 'week') a.setDate(a.getDate() + 7 * dir);
        else if (viewRange === 'month') a.setMonth(a.getMonth() + dir);
        else a.setFullYear(a.getFullYear() + dir);
        anchorDate = a; ctx.refresh(); return true;
      }
      if (act === 'ledger-now') { anchorDate = new Date(); ctx.refresh(); return true; }

      return false;
    }
  });

  /* ============ 主页面渲染 ============ */
  function renderPage() {
    const data = getData();

    if (accDetail) {
      const acc = data.accounts.find(a => a.id === accDetail.id);
      if (!acc) { accDetail = null; }
      else {
        try { return renderAccDetail(acc); }
        catch (e) { console.error(e); accDetail = null; }
      }
    }

    const settingParts = ['周期 ' + data.cycleStartDay + ' 号起'];
    if (data.budget > 0) settingParts.push('预算 ' + fmtFen(data.budget));

    const head = `<div class="ledger-page-head"><span class="ledger-page-title">记账</span><button class="ledger-page-setting" data-act="ledger-set-cycle" title="预算设置">⚙️ ${settingParts.join(' · ')}</button></div>`;

    const tabs = `
      <div class="tabs">
        <button class="tab ${viewTab === 'list' ? 'active' : ''}" data-act="ledger-tab" data-tab="list">流水</button>
        <button class="tab ${viewTab === 'stats' ? 'active' : ''}" data-act="ledger-tab" data-tab="stats">统计</button>
        <button class="tab ${viewTab === 'trend' ? 'active' : ''}" data-act="ledger-tab" data-tab="trend">趋势</button>
        <button class="tab ${viewTab === 'accounts' ? 'active' : ''}" data-act="ledger-tab" data-tab="accounts">账户</button>
        <button class="tab ${viewTab === 'shop' ? 'active' : ''}" data-act="ledger-tab" data-tab="shop">清单</button>
      </div>`;

    let body = '';
    if (viewTab === 'list') body = renderList();
    else if (viewTab === 'stats') body = renderStats();
    else if (viewTab === 'trend') body = renderTrend();
    else if (viewTab === 'accounts') body = renderAccounts();
    else body = renderShop();

    return `<div class="module ledger-module">
      ${head}
      ${tabs}
      ${body}
      ${viewTab !== 'shop' ? `<button class="fab" data-act="ledger-add" aria-label="记一笔">+</button>` : ''}
    </div>`;
  }

  /* ============ 购物清单渲染 ============ */
  function renderShop() {
    const data = getData();
    const tabs = `
      <div class="tabs shop-sub-tabs">
        <button class="tab ${shopTab === 'cooling' ? 'active' : ''}" data-act="shop-tab" data-tab="cooling">⏳ 冷静中</button>
        <button class="tab ${shopTab === 'archive' ? 'active' : ''}" data-act="shop-tab" data-tab="archive">📦 物品档案馆</button>
      </div>`;

    if (shopTab === 'cooling') {
      const cooling = data.coolingItems.filter(i => i.status === 'cooling');
      
      // 计算已省下金额
      let savedMoney = data.coolingItems.filter(i => i.status === 'abandoned').reduce((s, i) => s + i.price, 0);

      const cards = cooling.length ? cooling.map(item => {
        const today = U.todayStr();
        const remainDays = Math.round((parseDate(item.endDate) - parseDate(today)) / 86400000);
        const isDone = today >= item.endDate;
        
        return `<div class="cooling-card ${isDone ? 'is-done' : ''}">
          <div class="cooling-head">
            <span class="cooling-name">${U.escape(item.name)}</span>
            <span class="cooling-price">¥ ${fenToYuan(item.price)}</span>
          </div>
          <div class="cooling-reason">“${U.escape(item.reason)}”</div>
          
          <div class="cooling-progress-wrap">
            ${isDone ? 
              `<div class="cooling-done-text">✅ 冷静期已结束，还买吗？</div>` : 
              `<div class="cooling-progress-text">还需冷静 <b>${remainDays}</b> 天</div>
               <div class="cooling-progress"><i style="width:${Math.min(100, Math.max(0, (item.totalDays - remainDays) / item.totalDays * 100))}%"></i></div>`
            }
          </div>

          <div class="cooling-actions">
            ${isDone ? `
              <button class="btn btn-primary" data-act="shop-buy-cooling" data-id="${item.id}">买下</button>
              <button class="btn btn-ghost" data-act="shop-abandon-cooling" data-id="${item.id}">不买了</button>
            ` : `
              <button class="btn btn-ghost btn-sm" data-act="shop-abandon-cooling" data-id="${item.id}">其实不需要了</button>
              <button class="btn btn-ghost btn-sm text-muted" data-act="shop-buy-cooling" data-id="${item.id}">忍不了了提前买</button>
            `}
          </div>
        </div>`;
      }).join('') : `<div class="empty" data-emoji="🛒">没有正在冷静的物品<br><button class="btn btn-primary" data-act="shop-add-cooling" style="margin-top:12px">+ 添加想买的物品</button></div>`;

      return `${tabs}
        ${savedMoney > 0 ? `<div class="shop-saved-banner">🎉 你已通过冷静期省下了 ¥ ${fenToYuan(savedMoney)}</div>` : ''}
        <div class="cooling-list">${cards}</div>
        ${cooling.length ? `<button class="btn btn-ghost acc-add-btn" data-act="shop-add-cooling">+ 添加想买的物品</button>` : ''}
      `;
    }

    // 物品档案馆
    const archive = data.archiveItems.sort((a,b) => b.date.localeCompare(a.date));
    const cards = archive.length ? archive.map(item => {
      let statusLabel = '中规中矩', statusCls = 'normal';
      if (item.status === 'good') { statusLabel = '🟢 极其好用'; statusCls = 'good'; }
      else if (item.status === 'bad') { statusLabel = '🔴 吃灰/踩坑'; statusCls = 'bad'; }

      const repurchaseHtml = item.repurchase 
        ? `<span class="arch-tag repurchase">🔄 下次还买</span>` 
        : `<span class="arch-tag no-repurchase">❌ 绝对避雷</span>`;

      return `<div class="arch-card border-${statusCls}">
        <div class="arch-head">
          <span class="arch-name">${U.escape(item.name)}</span>
          <span class="arch-price">¥ ${fenToYuan(item.price)}</span>
        </div>
        <div class="arch-tags">
          <span class="arch-tag ${statusCls}">${statusLabel}</span>
          ${repurchaseHtml}
          <span class="arch-date">${item.date}</span>
        </div>
        ${item.note ? `<div class="arch-note">${U.escape(item.note)}</div>` : ''}
        <button class="arch-edit-btn" data-act="shop-edit-archive" data-id="${item.id}">✏️ 修改评价</button>
      </div>`;
    }).join('') : `<div class="empty" data-emoji="📦">档案馆空空如也<br><button class="btn btn-primary" data-act="shop-add-archive" style="margin-top:12px">+ 补录买过的物品</button></div>`;

    return `${tabs}
      <div class="arch-list">${cards}</div>
      ${archive.length ? `<button class="btn btn-ghost acc-add-btn" data-act="shop-add-archive">+ 补录物品</button>` : ''}
    `;
  }

  /* ============ 购物清单表单 ============ */
  function openCoolingForm() {
    UI.form('添加想买的物品', [
      { name: 'name', label: '物品名称', required: true, placeholder: '例如：机械键盘' },
      { name: 'price', label: '预计金额', type: 'number', required: true },
      { name: 'reason', label: '购买理由', type: 'text', required: true, placeholder: '为什么想买？' },
      { name: 'days', label: '冷静周期（天）', type: 'select', value: '7', options: [
        { value: '3', label: '3 天（百元以下小物件）' },
        { value: '7', label: '7 天（百元至五百元）' },
        { value: '14', label: '14 天（大额消费）' },
        { value: '30', label: '30 天（超级大件）' }
      ]}
    ]).then(r => {
      if (!r) return;
      const priceFen = yuanToFen(r.price);
      const days = Number(r.days);
      const start = U.todayStr();
      const end = dateStr(addDays(new Date(), days));
      
      Store.update(KEY, d => {
        d.coolingItems.push({
          id: U.uid('c'),
          name: r.name,
          price: priceFen,
          reason: r.reason,
          startDate: start,
          endDate: end,
          totalDays: days,
          status: 'cooling'
        });
        return d;
      });
      UI.toast('开始冷静期');
    });
  }

  function openArchiveForm(editing) {
    UI.form(editing ? '修改物品评价' : '补录物品', [
      { name: 'name', label: '物品名称', required: true, value: editing ? editing.name : '' },
      { name: 'price', label: '购买金额', type: 'number', required: true, value: editing ? fenToYuan(editing.price) : '' },
      { name: 'date', label: '购买日期', type: 'date', value: editing ? editing.date : U.todayStr(), required: true },
      { name: 'status', label: '使用状态', type: 'select', value: editing ? editing.status : 'normal', options: [
        { value: 'good', label: '🟢 极其好用' },
        { value: 'normal', label: '🟡 中规中矩' },
        { value: 'bad', label: '🔴 吃灰/踩坑' }
      ]},
      { name: 'repurchase', label: '下次还买吗？', type: 'select', value: editing ? (editing.repurchase ? 'yes' : 'no') : 'no', options: [
        { value: 'yes', label: '🔄 还会复购' },
        { value: 'no', label: '❌ 绝对避雷' }
      ]},
      { name: 'note', label: '使用感受/备注', type: 'text', value: editing ? (editing.note || '') : '', placeholder: '好用在哪？为什么吃灰？' }
    ]).then(r => {
      if (!r) return;
      const priceFen = yuanToFen(r.price);
      Store.update(KEY, d => {
        if (editing) {
          const item = d.archiveItems.find(x => x.id === editing.id);
          if (item) {
            item.name = r.name;
            item.price = priceFen;
            item.date = r.date;
            item.status = r.status;
            item.repurchase = r.repurchase === 'yes';
            item.note = r.note;
          }
        } else {
          d.archiveItems.push({
            id: U.uid('a'),
            name: r.name,
            price: priceFen,
            date: r.date,
            status: r.status,
            repurchase: r.repurchase === 'yes',
            note: r.note
          });
        }
        return d;
      });
      UI.toast('已保存');
    });
  }

  /* ============ 其他渲染（保持原样） ============ */
  function renderList() {
    const range = getRangeFor(viewRange, getAnchor());
    const recs = recordsInRange(range);
    const expense = recs.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
    const income  = recs.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
    const balance = income - expense;

    const rangeSwitcher = `<div class="ledger-range-switch"><button class="${viewRange === 'week' ? 'active' : ''}" data-act="ledger-range" data-range="week">周</button><button class="${viewRange === 'month' ? 'active' : ''}" data-act="ledger-range" data-range="month">月</button><button class="${viewRange === 'year' ? 'active' : ''}" data-act="ledger-range" data-range="year">年</button></div>`;
    const head = `<div class="ledger-range-head"><button class="sum-nav" data-act="ledger-prev">‹</button><span class="ledger-range-title">${fmtRangeLabel(range)}</span><div class="ledger-range-right"><button class="sum-now" data-act="ledger-now">现在</button><button class="sum-nav" data-act="ledger-next">›</button></div></div>`;
    const summary = `<div class="ledger-summary"><div class="ls-item"><span class="ls-label">支出</span><span class="ls-val expense">${fmtFen(expense)}</span></div><div class="ls-item"><span class="ls-label">收入</span><span class="ls-val income">${fmtFen(income)}</span></div><div class="ls-item"><span class="ls-label">结余</span><span class="ls-val ${balance >= 0 ? 'ok' : 'bad'}">${balance >= 0 ? '' : '-'}${fmtFen(Math.abs(balance))}</span></div></div>`;
    const bs = computeBudgetStatus();
    const budgetBar = bs ? `<div class="ledger-budget"><div class="lb-head"><span class="lb-title">📊 本周期预算</span><span class="lb-pct ${bs.cls}">${bs.pct}%</span></div><div class="lb-bar"><i class="${bs.cls}" style="width:${Math.min(100, bs.pct)}%"></i></div><div class="lb-foot"><span>已花 ${fmtFen(bs.spent)}</span><span class="${bs.cls}">${bs.remain >= 0 ? '剩余 ' + fmtFen(bs.remain) + ' / ' + fmtFen(bs.budget) : '超支 ' + fmtFen(-bs.remain)}</span></div></div>` : '';
    return `${rangeSwitcher}${head}${summary}${budgetBar}${renderFlowList(recs)}`;
  }

  function renderFlowList(recs) {
    if (!recs.length) return `<div class="empty" style="padding:30px 16px">本周期暂无记录<br><button class="btn btn-primary" data-act="ledger-add" style="margin-top:12px">+ 记一笔</button></div>`;
    const byDate = {};
    recs.forEach(r => { (byDate[r.date || ''] = byDate[r.date || ''] || []).push(r); });
    const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
    return `<div class="ledger-list">` + dates.map(date => {
      const dayRecs = byDate[date].slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      const dayExpense = dayRecs.filter(r => r.type === 'expense').reduce((s, r) => s + r.amount, 0);
      const dayIncome  = dayRecs.filter(r => r.type === 'income').reduce((s, r) => s + r.amount, 0);
      let dateLabel = U.formatDate(date);
      const today = U.todayStr();
      if (date === today) dateLabel = '今天';
      else { const d = new Date(); d.setDate(d.getDate() - 1); if (U.todayStr(d) === date) dateLabel = '昨天'; }
      const subtotalParts = [];
      if (dayExpense) subtotalParts.push(`支 ${fmtFen(dayExpense)}`);
      if (dayIncome)  subtotalParts.push(`收 ${fmtFen(dayIncome)}`);
      const items = dayRecs.map(r => {
        const cat = findCat(r.type, r.category); const acc = findAcc(r.account);
        const sign = r.type === 'income' ? '+' : '-'; const cls = r.type === 'income' ? 'income' : 'expense';
        const subs = []; if (r.time) subs.push(r.time); if (acc) subs.push(acc.name); if (r.note) subs.push(r.note);
        return `<div class="ledger-item"><span class="ledger-cat-icon">${U.escape(cat.icon)}</span><div class="ledger-item-main"><div class="ledger-item-title">${U.escape(cat.name)}</div><div class="ledger-item-sub">${U.escape(subs.join(' · '))}</div></div><span class="ledger-amount ${cls}">${sign}${fmtFen(r.amount)}</span><button class="ledger-item-menu" data-act="ledger-edit" data-id="${r.id}">⋯</button></div>`;
      }).join('');
      return `<div class="ledger-day"><div class="ledger-day-head"><span class="ledger-day-label">${dateLabel}</span><span class="ledger-day-sub">${subtotalParts.join(' / ')}</span></div>${items}</div>`;
    }).join('') + `</div>`;
  }

  function renderStats() {
    const range = getRangeFor(viewRange, getAnchor());
    const recs = recordsInRange(range);
    if (!recs.length) return `<div class="empty" style="padding:36px 16px">本周期暂无数据</div>`;
    return `${renderCatRank(recs, 'expense', '支出分类')}${renderCatRank(recs, 'income', '收入分类')}`;
  }

  function renderCatRank(recs, type, title) {
    const filtered = recs.filter(r => r.type === type);
    if (!filtered.length) return `<div class="rank-card"><div class="rank-title">${title}</div><div class="card-empty" style="padding:6px 0">无记录</div></div>`;
    const map = {}; filtered.forEach(r => { map[r.category] = (map[r.category] || 0) + r.amount; });
    const total = Object.values(map).reduce((s, v) => s + v, 0);
    const list = Object.keys(map).map(cid => ({ cat: findCat(type, cid), amount: map[cid] })).sort((a, b) => b.amount - a.amount);
    const max = list[0].amount;
    const rows = list.map(x => {
      const pct = Math.round(x.amount / total * 100); const width = Math.round(x.amount / max * 100);
      const barCls = type === 'income' ? 'income' : 'expense';
      return `<div class="rank-item"><span class="rank-icon">${U.escape(x.cat.icon)}</span><div class="rank-main"><div class="rank-line"><span class="rank-name">${U.escape(x.cat.name)}</span><span class="rank-amount">${fmtFen(x.amount)}</span></div><div class="rank-bar"><i class="${barCls}" style="width:${width}%"></i></div></div><span class="rank-pct">${pct}%</span></div>`;
    }).join('');
    const totalCls = type === 'income' ? 'income' : 'expense';
    return `<div class="rank-card"><div class="rank-title"><span>${title}</span><span class="rank-total ${totalCls}">${fmtFen(total)}</span></div>${rows}</div>`;
  }

  function renderTrend() {
    const year = getAnchor().getFullYear(); const data = buildTrendData(year);
    const totalIncome  = data.reduce((s, d) => s + d.income, 0); const totalExpense = data.reduce((s, d) => s + d.expense, 0);
    const balance = totalIncome - totalExpense;
    const head = `<div class="ledger-range-head"><button class="sum-nav" data-act="ledger-prev">‹</button><span class="ledger-range-title">${year}年</span><div class="ledger-range-right"><button class="sum-now" data-act="ledger-now">今年</button><button class="sum-nav" data-act="ledger-next">›</button></div></div>`;
    const summary = `<div class="ledger-summary"><div class="ls-item"><span class="ls-label">年支出</span><span class="ls-val expense">${fmtFen(totalExpense)}</span></div><div class="ls-item"><span class="ls-label">年收入</span><span class="ls-val income">${fmtFen(totalIncome)}</span></div><div class="ls-item"><span class="ls-label">年结余</span><span class="ls-val ${balance >= 0 ? 'ok' : 'bad'}">${balance >= 0 ? '' : '-'}${fmtFen(Math.abs(balance))}</span></div></div>`;
    const legend = `<div class="trend-legend"><span><i class="t-dot income"></i>收入</span><span><i class="t-dot expense"></i>支出</span></div>`;
    return `${head}${summary}<div class="chart-card"><div class="chart-title"><span>月度收支趋势</span><span class="chart-unit">${year}年</span></div>${buildBarChart(data)}${legend}</div>`;
  }

  function renderAccounts() {
    const accounts = getData().accounts;
    if (!accounts.length) return `<div class="empty" data-emoji="💰">还没有存钱计划<br><button class="btn btn-primary" data-act="acc-add" style="margin-top:12px">+ 新建计划</button></div>`;
    const active = accounts.filter(a => !a.target || a.amount < a.target);
    const done   = accounts.filter(a => a.target && a.amount >= a.target);
    const tabHeader = `<div class="acc-tabs-header"><span class="acc-tab active">进行中(${active.length})</span><span class="acc-tab-divider">/</span><span class="acc-tab">已结束(${done.length})</span></div>`;
    let body = active.map(a => renderAccCard(a)).join('');
    if (done.length) { body += `<div class="acc-done-title">已结束</div>`; body += done.map(a => renderAccCard(a)).join(''); }
    return `${tabHeader}<div class="acc-list">${body}</div><button class="btn btn-ghost acc-add-btn" data-act="acc-add">+ 新建存钱计划</button>`;
  }

  function renderAccCard(a) {
    const hasTarget = a.target > 0; const pct = hasTarget ? Math.min(100, Math.round(a.amount / a.target * 100 * 100) / 100) : 0;
    const remain = hasTarget ? Math.max(0, a.target - a.amount) : 0; const isDone = hasTarget && a.amount >= a.target;
    let bgStyle = '';
    if (a.image) { bgStyle = `background-image: url('${U.escape(a.image)}');`; }
    else {
      const theme = a.theme && a.theme !== 'auto' ? getTheme(a.theme) : null;
      if (theme && theme.grad) bgStyle = `background-image: ${theme.grad};`;
      else bgStyle = `background-image: linear-gradient(135deg, #f6d365 0%, #fda085 100%);`;
    }
    const timeInfo = computeTimeProgress(a);
    return `<div class="acc-card-image" style="${bgStyle}" data-act="acc-action-sheet" data-id="${a.id}">
      <div class="acc-card-overlay">
        <div class="acc-card-top"><div class="acc-card-name">${U.escape(a.name)}</div><button class="acc-card-menu" data-act="acc-action-sheet" data-id="${a.id}">⋯</button></div>
        <div class="acc-card-middle"><div class="acc-card-target">${hasTarget ? '¥ ' + fenToYuan(a.target) : '—'}</div><div class="acc-card-pct">${hasTarget ? pct.toFixed(2) + '%' : '0%'}</div></div>
        <div class="acc-card-bar"><div class="acc-card-bar-fill" style="width:${pct}%"></div></div>
        ${timeInfo ? `<div class="acc-card-time"><span class="acc-card-time-label">📅 ${timeInfo.rangeText}</span><span class="acc-card-time-pct ${timeInfo.statusCls}">时间已用 ${timeInfo.timePct}%</span></div>` : ''}
        <div class="acc-card-foot"><span class="acc-card-saved">已攒入：¥ ${fenToYuan(a.amount)}</span><span class="acc-card-remain">${isDone ? '已达成 🎉' : '剩余：¥ ' + fenToYuan(remain)}</span></div>
      </div>
    </div>`;
  }

  function computeTimeProgress(acc) {
    try {
      if (!acc || !acc.startDate || !acc.endDate) return null;
      const start = parseLocalDate(acc.startDate); const end = parseLocalDate(acc.endDate);
      if (!start || !end || end <= start) return null;
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const totalDays = Math.max(1, Math.round((end - start) / 86400000) + 1);
      const passedDays = Math.max(0, Math.round((today - start) / 86400000) + 1);
      const remainDays = Math.max(0, Math.round((end - today) / 86400000));
      const timePct = Math.min(100, Math.round(passedDays / totalDays * 100));
      const target = Number(acc.target) || 0; const amount = Number(acc.amount) || 0;
      const moneyPct = target > 0 ? Math.min(100, Math.round(amount / target * 100)) : 0;
      let statusCls = 'ok';
      if (timePct - moneyPct > 15) statusCls = 'behind'; else if (moneyPct - timePct > 15) statusCls = 'ahead';
      const f = d => (d.getMonth() + 1) + '/' + d.getDate();
      return { start, end, totalDays, passedDays, remainDays, timePct, moneyPct, statusCls, rangeText: f(start) + ' - ' + f(end) };
    } catch (e) { return null; }
  }

  /* ============ 账户操作 ============ */
  function doAccAdd() {
    const themeOptions = ACC_THEMES.map(t => ({ value: t.id, label: t.name }));
    UI.form('新建存钱计划', [
      { name: 'name', label: '计划名称', required: true },
      { name: 'target', label: '目标金额', type: 'number', value: '', required: true },
      { name: 'amount', label: '已攒入金额', type: 'number', value: 0, required: true },
      { name: 'startDate', label: '开始日期（可留空）', type: 'date', value: '' },
      { name: 'endDate',   label: '结束日期（可留空）', type: 'date', value: '' },
      { name: 'theme', label: '背景色方案', type: 'select', value: 'auto', options: themeOptions },
      { name: 'image',  label: '背景图片链接（可留空）', value: '' }
    ]).then(r => {
      if (!r) return;
      const amtFen = yuanToFen(r.amount) || 0; const tgtFen = yuanToFen(r.target) || 0;
      Store.update(KEY, d => {
        d.accounts.push({
          id: U.uid('a'), name: r.name, target: tgtFen, amount: amtFen,
          startDate: r.startDate || null, endDate: r.endDate || null,
          theme: r.theme || 'auto', image: r.image || '',
          transactions: amtFen > 0 ? [{ id: U.uid('tx'), type: 'in', amount: amtFen, note: '初始金额', date: r.startDate || U.todayStr(), createdAt: Date.now() }] : [],
          createdAt: Date.now()
        });
        return d;
      });
    });
  }

  function doAccAddMoney(id) {
    const acc = getData().accounts.find(a => a.id === id); if (!acc) return;
    UI.form('存入「' + acc.name + '」', [
      { name: 'amt', label: '存入金额', type: 'number', value: '', required: true },
      { name: 'date', label: '日期', type: 'date', value: U.todayStr(), required: true },
      { name: 'note', label: '备注（可选）', value: '' }
    ]).then(r => {
      if (!r) return;
      const fen = yuanToFen(r.amt); if (!fen) return;
      Store.update(KEY, d => {
        const t = d.accounts.find(x => x.id === id); if (!t) return d;
        t.amount = (t.amount || 0) + fen; if (!t.transactions) t.transactions = [];
        t.transactions.push({ id: U.uid('tx'), type: 'in', amount: fen, note: (r.note || '').trim(), date: r.date || U.todayStr(), createdAt: Date.now() });
        return d;
      });
      UI.toast('已存入');
    });
  }

  function doAccSubMoney(id) {
    const acc = getData().accounts.find(a => a.id === id); if (!acc) return;
    UI.form('从「' + acc.name + '」取出', [
      { name: 'amt', label: '取出金额', type: 'number', value: '', required: true },
      { name: 'date', label: '日期', type: 'date', value: U.todayStr(), required: true },
      { name: 'note', label: '备注（可选）', value: '' }
    ]).then(r => {
      if (!r) return;
      const fen = yuanToFen(r.amt); if (!fen) return;
      Store.update(KEY, d => {
        const t = d.accounts.find(x => x.id === id); if (!t) return d;
        t.amount = Math.max(0, (t.amount || 0) - fen); if (!t.transactions) t.transactions = [];
        t.transactions.push({ id: U.uid('tx'), type: 'out', amount: fen, note: (r.note || '').trim(), date: r.date || U.todayStr(), createdAt: Date.now() });
        return d;
      });
      UI.toast('已取出');
    });
  }

  function doAccAddProfit(id) {
    const acc = getData().accounts.find(a => a.id === id); if (!acc) return;
    UI.form('记录「' + acc.name + '」收益', [
      { name: 'amt', label: '本次收益金额（元）', type: 'number', value: '', required: true, placeholder: '例如：0.71' },
      { name: 'date', label: '日期', type: 'date', value: U.todayStr(), required: true },
      { name: 'note', label: '备注（可选）', value: '基金收益' }
    ]).then(r => {
      if (!r) return;
      const fen = yuanToFen(r.amt); if (!fen) return;
      Store.update(KEY, d => {
        const t = d.accounts.find(x => x.id === id); if (!t) return d;
        t.amount = (t.amount || 0) + fen; if (!t.transactions) t.transactions = [];
        t.transactions.push({ id: U.uid('tx'), type: 'profit', amount: fen, note: (r.note || '').trim(), date: r.date || U.todayStr(), createdAt: Date.now() });
        return d;
      });
      UI.toast('已记录收益');
    });
  }

  function doAccEdit(id) {
    const acc = getData().accounts.find(a => a.id === id); if (!acc) return;
    const oldAmount = acc.amount || 0;
    const themeOptions = ACC_THEMES.map(t => ({ value: t.id, label: t.name }));
    UI.form('编辑计划', [
      { name: 'name', label: '计划名称', required: true, value: acc.name },
      { name: 'target', label: '目标金额', type: 'number', value: fenToYuan(acc.target || 0), required: true },
      { name: 'amount', label: '当前余额', type: 'number', value: fenToYuan(acc.amount), required: true },
      { name: 'startDate', label: '开始日期（可留空）', type: 'date', value: acc.startDate || '' },
      { name: 'endDate',   label: '结束日期（可留空）', type: 'date', value: acc.endDate || '' },
      { name: 'theme', label: '背景色方案', type: 'select', value: acc.theme || 'auto', options: themeOptions },
      { name: 'image',  label: '背景图片链接（可留空）', value: acc.image || '' }
    ]).then(r => {
      if (!r) return;
      const amtFen = yuanToFen(r.amount) || 0; const tgtFen = yuanToFen(r.target) || 0; const diff = amtFen - oldAmount;
      Store.update(KEY, d => {
        const t = d.accounts.find(x => x.id === id); if (!t) return d;
        t.name = r.name; t.target = tgtFen; t.amount = amtFen;
        t.startDate = r.startDate || null; t.endDate = r.endDate || null;
        t.theme = r.theme || 'auto'; t.image = r.image || '';
        if (diff !== 0) {
          if (!t.transactions) t.transactions = [];
          t.transactions.push({ id: U.uid('tx'), type: diff > 0 ? 'in' : 'out', amount: Math.abs(diff), note: '手动调整', date: U.todayStr(), createdAt: Date.now() });
        }
        return d;
      });
      UI.toast('已保存');
    });
  }

  function doAccDel(id) {
    const acc = getData().accounts.find(a => a.id === id); if (!acc) return;
    UI.confirm(`确定删除「${acc.name}」吗？`).then(ok => {
      if (!ok) return;
      Store.update(KEY, d => { d.accounts = d.accounts.filter(a => a.id !== id); return d; });
    });
  }

  function openAccActionSheet(id) {
    const acc = getData().accounts.find(a => a.id === id); if (!acc) return;
    const old = document.getElementById('accSheet'); if (old) old.remove();
    const mask = document.createElement('div'); mask.id = 'accSheet'; mask.className = 'acc-sheet-mask';
    mask.innerHTML = `
      <div class="acc-sheet">
        <div class="acc-sheet-handle"></div><div class="acc-sheet-title">${U.escape(acc.name)}</div>
        <div class="acc-sheet-btns">
          <button class="acc-sheet-btn primary" data-acc-act="add"><span class="acc-sheet-icon">📥</span>存入</button>
          <button class="acc-sheet-btn" data-acc-act="sub"><span class="acc-sheet-icon">📤</span>取出</button>
          <button class="acc-sheet-btn" data-acc-act="profit" style="background:#e8f5e9; color:#2e7d32;"><span class="acc-sheet-icon">📈</span>记收益</button>
          <button class="acc-sheet-btn" data-acc-act="edit"><span class="acc-sheet-icon">✏️</span>编辑</button>
        </div>
        <button class="acc-sheet-btn acc-sheet-detail" data-acc-act="detail"><span class="acc-sheet-icon">📊</span>查看详情</button>
        <button class="acc-sheet-btn danger" data-acc-act="del" style="margin-top:8px;"><span class="acc-sheet-icon">🗑️</span>删除</button>
        <button class="acc-sheet-cancel" data-acc-act="cancel">取消</button>
      </div>`;
    document.body.appendChild(mask);
    requestAnimationFrame(() => mask.classList.add('show'));
    mask.addEventListener('click', e => {
      if (e.target === mask) { closeAccSheet(); return; }
      const btn = e.target.closest('[data-acc-act]'); if (!btn) return;
      const act = btn.dataset.accAct; closeAccSheet();
      setTimeout(() => {
        if (act === 'add')       doAccAddMoney(id);
        else if (act === 'sub')  doAccSubMoney(id);
        else if (act === 'profit') doAccAddProfit(id);
        else if (act === 'edit') doAccEdit(id);
        else if (act === 'del')  doAccDel(id);
        else if (act === 'detail') { accDetail = { id, year: new Date().getFullYear(), view: 'chart' }; if (window.App && App.render) App.render(); }
      }, 220);
    });
    function closeAccSheet() { mask.classList.remove('show'); setTimeout(() => { if (mask.parentNode) mask.parentNode.removeChild(mask); }, 220); }
  }

  function openCycleForm() {
    const data = getData();
    UI.form('预算设置', [
      { name: 'day', label: '每月起始日（1-28）', type: 'number', value: data.cycleStartDay, required: true },
      { name: 'budget', label: '每周期支出预算（元，留空 = 不设）', type: 'number', value: data.budget > 0 ? fenToYuan(data.budget) : '' }
    ]).then(r => {
      if (!r) return;
      Store.update(KEY, d => {
        d.cycleStartDay = Math.max(1, Math.min(28, Number(r.day) || 1));
        d.budget = (r.budget === '' || r.budget == null) ? 0 : (yuanToFen(r.budget) || 0);
        return d;
      });
      UI.toast('已保存');
    });
  }

  /* ============ 详情页与记账面板（原样保留） ============ */
  function renderAccDetail(acc) {
    const year = accDetail.year; const view = accDetail.view; const curYear = new Date().getFullYear();
    const txs = (acc.transactions || []).filter(t => (t.date || '').slice(0, 4) === String(year));
    const monthly = [];
    for (let m = 1; m <= 12; m++) {
      const mk = year + '-' + U.pad(m); const monthTxs = txs.filter(t => (t.date || '').slice(0, 7) === mk);
      const income = monthTxs.filter(t => t.type === 'in').reduce((s, t) => s + t.amount, 0);
      const profit = monthTxs.filter(t => t.type === 'profit').reduce((s, t) => s + t.amount, 0);
      const outcome = monthTxs.filter(t => t.type === 'out').reduce((s, t) => s + t.amount, 0);
      monthly.push({ month: m, label: m + '月', income, profit, outcome, net: income + profit - outcome, count: monthTxs.length });
    }
    const totalIn = monthly.reduce((s, m) => s + m.income, 0);
    const totalProfit = monthly.reduce((s, m) => s + m.profit, 0);
    const totalOut = monthly.reduce((s, m) => s + m.outcome, 0);
    const totalNet = totalIn + totalProfit - totalOut;

    const header = `<div class="acc-detail-head"><button class="acc-detail-back" data-act="acc-detail-back">‹ 返回</button><div class="acc-detail-title"><span class="acc-detail-icon">${U.escape(acc.icon || '💼')}</span><span class="acc-detail-name">${U.escape(acc.name)}</span></div></div>`;
    const balancePct = acc.target > 0 ? Math.min(100, Math.round(acc.amount / acc.target * 100 * 100) / 100) : 0;
    const balanceCard = `<div class="acc-detail-balance-card"><div class="acc-detail-balance-label">当前余额</div><div class="acc-detail-balance">${fmtFen(acc.amount || 0)}</div>${acc.target > 0 ? `<div class="acc-detail-balance-bar"><i style="width:${Math.min(100, balancePct)}%"></i></div><div class="acc-detail-balance-meta">目标 ${fmtFen(acc.target)} · 已完成 ${balancePct.toFixed(1)}%</div>` : `<div class="acc-detail-balance-meta">未设目标金额</div>`}</div>`;

    const timeInfo = computeTimeProgress(acc);
    let timeCard = '';
    if (timeInfo) {
      const f = d => d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
      const remainAmount = Math.max(0, (acc.target || 0) - (acc.amount || 0));
      const needPerDay = timeInfo.remainDays > 0 ? remainAmount / timeInfo.remainDays : 0;
      const gap = timeInfo.moneyPct - timeInfo.timePct;
      let statusText = '', statusCls = 'ok';
      if ((acc.amount || 0) >= (acc.target || 0) && acc.target > 0) { statusText = '🎉 已达成目标'; statusCls = 'done'; }
      else if (timeInfo.remainDays === 0) { statusText = '⏰ 计划已到期'; statusCls = 'over'; }
      else if (gap >= -5) { statusText = '✅ 进度正常'; statusCls = 'ok'; }
      else if (gap >= -20) { statusText = '⚠️ 稍落后 ' + Math.abs(gap) + '%'; statusCls = 'warn'; }
      else { statusText = '❗ 落后 ' + Math.abs(gap) + '%，需要加速'; statusCls = 'over'; }
      const remainText = remainAmount > 0 ? `<div class="acc-time-suggestion"><div class="ats-title">按计划还需攒</div><div class="ats-grid"><div class="ats-item"><span class="ats-num">${fmtFen(Math.ceil(needPerDay))}</span><span class="ats-label">每天</span></div><div class="ats-item"><span class="ats-num">${fmtFen(Math.ceil(needPerDay*7))}</span><span class="ats-label">每周</span></div><div class="ats-item"><span class="ats-num">${fmtFen(Math.ceil(needPerDay*30))}</span><span class="ats-label">每月</span></div></div></div>` : '';
      timeCard = `<div class="acc-time-card"><div class="acc-time-title"><span>📅 计划周期</span><span class="acc-time-status ${statusCls}">${statusText}</span></div><div class="acc-time-range">${f(timeInfo.start)} → ${f(timeInfo.end)}</div><div class="acc-time-meta">已过 ${timeInfo.passedDays} 天 / 共 ${timeInfo.totalDays} 天 ${timeInfo.remainDays > 0 ? ' · 还剩 ' + timeInfo.remainDays + ' 天' : ''}</div><div class="acc-time-bar"><i style="width:${timeInfo.timePct}%"></i><span class="acc-time-bar-mark" style="left:${Math.min(100, timeInfo.moneyPct)}%"></span></div><div class="acc-time-bar-labels"><span>时间进度 ${timeInfo.timePct}%</span><span>金额进度 ${timeInfo.moneyPct}%</span></div>${remainText}</div>`;
    }

    const yearNav = `<div class="acc-detail-year"><button class="sum-nav" data-act="acc-detail-year" data-year="${year - 1}">‹</button><span class="acc-detail-year-title">${year} 年 ${year === curYear ? '<span class="sum-now-tag">今年</span>' : ''}</span><button class="sum-nav" data-act="acc-detail-year" data-year="${year + 1}" ${year >= curYear ? 'disabled' : ''}>›</button></div>`;
    const viewSwitch = `<div class="tabs acc-detail-tabs"><button class="tab ${view === 'chart' ? 'active' : ''}" data-act="acc-detail-view" data-view="chart">折线图</button><button class="tab ${view === 'cards' ? 'active' : ''}" data-act="acc-detail-view" data-view="cards">月度卡片</button></div>`;
    const summary = `<div class="acc-detail-summary"><div class="ads-item"><span class="ads-label">全年存入</span><span class="ads-value income">+${fmtFen(totalIn)}</span></div><div class="ads-item"><span class="ads-label">全年收益</span><span class="ads-value profit">+${fmtFen(totalProfit)}</span></div><div class="ads-item"><span class="ads-label">全年取出</span><span class="ads-value outcome">-${fmtFen(totalOut)}</span></div><div class="ads-item full-width"><span class="ads-label">全年净增长</span><span class="ads-value ${totalNet >= 0 ? 'income' : 'outcome'}">${totalNet >= 0 ? '+' : '-'}${fmtFen(Math.abs(totalNet))}</span></div></div>`;
    
    let body = view === 'chart' ? renderAccChart(monthly) : renderAccCards(monthly);

    return `<div class="module ledger-module acc-detail-page">${header}${balanceCard}${timeCard}${yearNav}${viewSwitch}${summary}${body}</div>`;
  }

  function renderAccChart(monthly) {
    const W = 360, H = 220; const padL = 46, padR = 14, padT = 16, padB = 32; const cw = W - padL - padR; const ch = H - padT - padB;
    const maxVal = Math.max(1, ...monthly.map(m => Math.max(m.income, m.outcome, m.profit)));
    const yMax = Math.max(100, Math.ceil(maxVal / 100) * 100); const yScale = v => padT + ((yMax - v) / yMax) * ch; const xScale = i => padL + (i / 11) * cw;
    let grid = ''; for (let i = 0; i <= 4; i++) { const v = yMax - (yMax / 4) * i; const y = padT + ch * i / 4; grid += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#e8eef5" stroke-dasharray="3 4"/>`; grid += `<text x="${padL - 6}" y="${y + 3.5}" text-anchor="end" font-size="9" fill="#a8b3c1">${fmtFen(Math.round(v))}</text>`; }
    const inPts = monthly.map((m, i) => [xScale(i), yScale(m.income)]); const profitPts = monthly.map((m, i) => [xScale(i), yScale(m.profit)]); const outPts = monthly.map((m, i) => [xScale(i), yScale(m.outcome)]);
    const inLine = `<polyline points="${inPts.map(p => p.join(',')).join(' ')}" fill="none" stroke="#4caf7d" stroke-width="2" stroke-linejoin="round"/>`;
    const profitLine = `<polyline points="${profitPts.map(p => p.join(',')).join(' ')}" fill="none" stroke="#f0a020" stroke-width="2" stroke-linejoin="round" stroke-dasharray="4 2"/>`;
    const outLine = `<polyline points="${outPts.map(p => p.join(',')).join(' ')}" fill="none" stroke="#e35d5d" stroke-width="2" stroke-linejoin="round"/>`;
    let inDots = '', profitDots = '', outDots = '';
    monthly.forEach((m, i) => { if (m.income > 0) inDots += `<circle cx="${xScale(i)}" cy="${yScale(m.income)}" r="3" fill="#4caf7d" stroke="#fff" stroke-width="1.5"/>`; if (m.profit > 0) profitDots += `<circle cx="${xScale(i)}" cy="${yScale(m.profit)}" r="3" fill="#f0a020" stroke="#fff" stroke-width="1.5"/>`; if (m.outcome > 0) outDots += `<circle cx="${xScale(i)}" cy="${yScale(m.outcome)}" r="3" fill="#e35d5d" stroke="#fff" stroke-width="1.5"/>`; });
    let xLabels = ''; monthly.forEach((m, i) => { xLabels += `<text x="${xScale(i)}" y="${H - 10}" text-anchor="middle" font-size="9" fill="#a8b3c1">${m.month}月</text>`; });
    return `<div class="acc-detail-chart"><div class="acc-detail-legend"><span><i class="adl-dot in"></i>存入</span><span><i class="adl-dot profit"></i>收益</span><span><i class="adl-dot out"></i>取出</span></div><svg viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="xMidYMid meet">${grid}<line x1="${padL}" y1="${padT + ch}" x2="${W - padR}" y2="${padT + ch}" stroke="#d8dce1" stroke-width="1"/>${inLine}${profitLine}${outLine}${inDots}${profitDots}${outDots}${xLabels}</svg></div>`;
  }

  function renderAccCards(monthly) {
    const cards = monthly.map(m => {
      const hasData = m.income > 0 || m.outcome > 0 || m.profit > 0;
      return `<div class="acc-month-card ${hasData ? '' : 'empty'}"><div class="acc-month-title">${m.month}月</div>${hasData ? `<div class="acc-month-row"><span class="acc-month-label">存入</span><span class="acc-month-val income">+${fmtFen(m.income)}</span></div><div class="acc-month-row"><span class="acc-month-label">收益</span><span class="acc-month-val profit">+${fmtFen(m.profit)}</span></div><div class="acc-month-row"><span class="acc-month-label">取出</span><span class="acc-month-val outcome">-${fmtFen(m.outcome)}</span></div><div class="acc-month-net ${m.net >= 0 ? 'income' : 'outcome'}">${m.net >= 0 ? '+' : '-'}${fmtFen(Math.abs(m.net))}</div>` : `<div class="acc-month-empty">无记录</div>`}</div>`;
    }).join('');
    return `<div class="acc-detail-cards">${cards}</div>`;
  }

  function openSheet(editingRec) {
    if (sheetState) return;
    const data = getData();
    sheetState = { type: editingRec ? editingRec.type : 'expense', amountStr: editingRec ? fenToYuan(editingRec.amount) : '', category: editingRec ? editingRec.category : null, account: editingRec ? editingRec.account : data.lastAccount, date: editingRec ? editingRec.date : U.todayStr(), time: editingRec ? (editingRec.time || '') : currentTimeStr(), note: editingRec ? (editingRec.note || '') : '', editingId: editingRec ? editingRec.id : null, moreOpen: !!editingRec };
    buildSheet();
  }
  function currentTimeStr() { const n = new Date(); return U.pad(n.getHours()) + ':' + U.pad(n.getMinutes()); }
  function buildSheet() {
    const old = document.getElementById('ledger-sheet'); if (old) old.remove();
    const mask = document.createElement('div'); mask.id = 'ledger-sheet'; mask.className = 'sheet-mask'; mask.innerHTML = renderSheet();
    document.body.appendChild(mask); requestAnimationFrame(() => mask.classList.add('show'));
    mask.addEventListener('click', e => { if (e.target === mask) closeSheet(); });
    mask.addEventListener('click', onSheetClick); mask.addEventListener('input', onSheetInput);
    const amtInput = mask.querySelector('#ledgerAmount');
    if (amtInput) { setTimeout(() => { amtInput.focus(); amtInput.setSelectionRange(amtInput.value.length, amtInput.value.length); }, 60); }
  }
  function renderSheet() {
    const s = sheetState; const cats = catsFor(s.type); const isEdit = !!s.editingId; const curCat = s.category ? cats.find(c => c.id === s.category) : null;
    const typeTabs = `<div class="sheet-type-tabs"><button class="sheet-type ${s.type === 'expense' ? 'active' : ''}" data-sheet-act="switch-type" data-type="expense">支出</button><button class="sheet-type ${s.type === 'income' ? 'active' : ''}" data-sheet-act="switch-type" data-type="income">收入</button></div>`;
    const amountRow = `<div class="sheet-amount-row"><span class="sheet-cur">¥</span><input type="text" inputmode="decimal" id="ledgerAmount" class="sheet-amount-input" data-sheet-act="set-amount" value="${U.escape(s.amountStr)}" placeholder="0.00" autocomplete="off"></div>${curCat && curCat.hint ? `<div class="sheet-cat-hint">${U.escape(curCat.hint)}</div>` : '<div class="sheet-cat-hint empty">&nbsp;</div>'}`;
    const catGrid = `<div class="sheet-section-title">选分类</div><div class="sheet-cat-grid">${cats.map(c => `<button class="sheet-cat ${s.category === c.id ? 'active' : ''}" data-sheet-act="pick-cat" data-id="${U.escape(c.id)}"><span class="sheet-cat-icon">${U.escape(c.icon)}</span><span class="sheet-cat-name">${U.escape(c.name)}</span></button>`).join('')}</div>`;
    const moreHtml = s.moreOpen ? `<div class="sheet-more"><div class="sheet-section-title">账户</div><div class="sheet-acc-row">${ACCOUNTS.map(a => `<button class="sheet-acc ${s.account === a.id ? 'active' : ''}" data-sheet-act="pick-acc" data-id="${a.id}"><span>${a.icon}</span><span>${a.name}</span></button>`).join('')}</div><div class="sheet-section-title">日期</div><input type="date" class="sheet-input" id="ledgerDate" value="${U.escape(s.date)}" data-sheet-act="set-date"><div class="sheet-section-title">时间</div><input type="time" class="sheet-input" id="ledgerTime" value="${U.escape(s.time)}" data-sheet-act="set-time"><div class="sheet-section-title">备注</div><input type="text" class="sheet-input" id="ledgerNote" placeholder="例如：和朋友聚餐" value="${U.escape(s.note)}" data-sheet-act="set-note"></div>` : '';
    const moreToggle = `<button class="sheet-more-toggle" data-sheet-act="toggle-more">${s.moreOpen ? '收起 ▴' : '更多 ▾'}</button>`;
    const footer = `<div class="sheet-footer">${isEdit ? `<button class="btn btn-danger" data-sheet-act="del">删除</button>` : ''}<button class="btn btn-ghost" data-sheet-act="cancel">取消</button><button class="btn btn-primary sheet-save" data-sheet-act="save">保存</button></div>`;
    return `<div class="sheet-panel"><div class="sheet-handle"></div>${typeTabs}${amountRow}${catGrid}${moreToggle}${moreHtml}${footer}</div>`;
  }
  function onSheetClick(e) {
    const el = e.target.closest('[data-sheet-act]'); if (!el) return; const act = el.dataset.sheetAct;
    if (act === 'switch-type') { sheetState.type = el.dataset.type; sheetState.category = null; rebuildSheetBody(false); return; }
    if (act === 'pick-cat') { sheetState.category = el.dataset.id; rebuildSheetBody(false); return; }
    if (act === 'pick-acc') { sheetState.account = el.dataset.id; rebuildSheetBody(false); return; }
    if (act === 'toggle-more') { sheetState.moreOpen = !sheetState.moreOpen; rebuildSheetBody(false); return; }
    if (act === 'cancel') { closeSheet(); return; }
    if (act === 'del') { const id = sheetState.editingId; closeSheet(); UI.confirm('确定删除这条记录吗？').then(ok => { if (!ok) return; Store.update(KEY, d => { d.records = d.records.filter(r => r.id !== id); return d; }); }); return; }
    if (act === 'save') { saveSheet(); return; }
  }
  function onSheetInput(e) {
    const el = e.target.closest('[data-sheet-act]'); if (!el) return; const act = el.dataset.sheetAct;
    if (act === 'set-amount') sheetState.amountStr = el.value; else if (act === 'set-date') sheetState.date = el.value; else if (act === 'set-time') sheetState.time = el.value; else if (act === 'set-note') sheetState.note = el.value;
  }
  function rebuildSheetBody(focusAmount) {
    const mask = document.getElementById('ledger-sheet'); if (!mask) return; mask.innerHTML = renderSheet();
    if (focusAmount !== false) { const amt = mask.querySelector('#ledgerAmount'); if (amt) { amt.focus(); amt.setSelectionRange(amt.value.length, amt.value.length); } }
  }
  function saveSheet() {
    const s = sheetState; const fen = yuanToFen(s.amountStr);
    if (fen == null || fen <= 0) { UI.toast('请输入金额'); return; }
    if (!s.category) { UI.toast('请选择分类'); return; }
    const payload = { type: s.type, amount: fen, category: s.category, account: s.account || null, date: s.date || U.todayStr(), time: s.time || '', note: (s.note || '').trim() };
    Store.update(KEY, d => {
      if (s.editingId) { const t = d.records.find(r => r.id === s.editingId); if (t) Object.assign(t, payload); }
      else { d.records.push({ id: U.uid('l'), ...payload, createdAt: Date.now() }); }
      if (s.account) d.lastAccount = s.account;
      return d;
    });
    UI.toast(s.editingId ? '已更新' : '已记录'); closeSheet();
  }
  function closeSheet() {
    const mask = document.getElementById('ledger-sheet'); if (!mask) { sheetState = null; return; }
    mask.classList.remove('show'); setTimeout(() => { if (mask.parentNode) mask.parentNode.removeChild(mask); sheetState = null; }, 200);
  }
})();