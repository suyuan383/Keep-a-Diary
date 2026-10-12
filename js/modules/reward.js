(function () {
  const KEY = 'reward';

  /* =========================================================
     默认奖励规则
     ========================================================= */
  const DEFAULT_RULES = {
    dailyReward: 100,           // 1 元
    weeklyReward: 500,          // 5 元
    monthlyReward: 2000,        // 20 元
    yearlyReward: 20000,        // 200 元
    streakTiers: [
      { days: 3,   reward: 200 },
      { days: 7,   reward: 500 },
      { days: 14,  reward: 1000 },
      { days: 21,  reward: 1500 },
      { days: 30,  reward: 3000 },
      { days: 60,  reward: 6000 },
      { days: 100, reward: 15000 },
      { days: 365, reward: 80000 }
    ],
    missStreakTiers: [
      { days: 3, penalty: 500 },
      { days: 7, penalty: 1500 }
    ]
  };

  /* =========================================================
     数据层
     ========================================================= */
  function getData() {
    const d = Store.ensure(KEY, () => ({
      groups: [],
      rules: JSON.parse(JSON.stringify(DEFAULT_RULES)),
      transactions: [],
      wishes: [],
      pendingPenalties: [],
      lastSettledDate: null
    }));
    if (!Array.isArray(d.groups)) d.groups = [];
    if (!Array.isArray(d.transactions)) d.transactions = [];
    if (!Array.isArray(d.wishes)) d.wishes = [];
    if (!Array.isArray(d.pendingPenalties)) d.pendingPenalties = [];
    if (!d.rules) d.rules = JSON.parse(JSON.stringify(DEFAULT_RULES));
    // 兼容旧数据：补齐缺失字段
    if (!d.rules.streakTiers) d.rules.streakTiers = DEFAULT_RULES.streakTiers.slice();
    if (!d.rules.missStreakTiers) d.rules.missStreakTiers = DEFAULT_RULES.missStreakTiers.slice();
    return d;
  }

  function saveSilent(fn) {
    const updater = Store.updateSilent || Store.update;
    updater.call(Store, KEY, data => {
      if (!Array.isArray(data.groups)) data.groups = [];
      if (!Array.isArray(data.transactions)) data.transactions = [];
      if (!Array.isArray(data.wishes)) data.wishes = [];
      if (!Array.isArray(data.pendingPenalties)) data.pendingPenalties = [];
      if (!data.rules) data.rules = JSON.parse(JSON.stringify(DEFAULT_RULES));
      fn(data);
      return data;
    });
  }

  function save(fn) {
    Store.update(KEY, data => {
      if (!Array.isArray(data.groups)) data.groups = [];
      if (!Array.isArray(data.transactions)) data.transactions = [];
      if (!Array.isArray(data.wishes)) data.wishes = [];
      if (!Array.isArray(data.pendingPenalties)) data.pendingPenalties = [];
      if (!data.rules) data.rules = JSON.parse(JSON.stringify(DEFAULT_RULES));
      fn(data);
      return data;
    });
  }

  /* =========================================================
     金额格式化
     ========================================================= */
  function fmtFen(fen) {
    const negative = fen < 0;
    const abs = Math.abs(fen);
    const yuan = abs / 100;
    let str;
    if (Number.isInteger(yuan)) str = String(yuan);
    else str = yuan.toFixed(2).replace(/\.?0+$/, '');
    return (negative ? '-' : '') + '¥ ' + str;
  }
  function fmtFenRaw(fen) {
    const negative = fen < 0;
    const abs = Math.abs(fen);
    const yuan = abs / 100;
    let str;
    if (Number.isInteger(yuan)) str = String(yuan);
    else str = yuan.toFixed(2);
    return (negative ? '-' : '') + str;
  }

  /* =========================================================
     日期工具
     ========================================================= */
  function parseDate(s) {
    const p = String(s).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function dateStr(d) {
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate());
  }
  function addDays(d, n) {
    const t = new Date(d);
    t.setDate(t.getDate() + n);
    return t;
  }
  function daysBetween(a, b) {
    const d1 = new Date(a); d1.setHours(0, 0, 0, 0);
    const d2 = new Date(b); d2.setHours(0, 0, 0, 0);
    return Math.round((d2 - d1) / 86400000);
  }
  // ISO 周编号：2026-W42
  function isoWeekKey(dateStr) {
    const d = parseDate(dateStr);
    const t = new Date(d);
    t.setHours(0, 0, 0, 0);
    // 周四定位
    t.setDate(t.getDate() + 3 - (t.getDay() + 6) % 7);
    const week1 = new Date(t.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((t - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    return t.getFullYear() + '-W' + U.pad(weekNum);
  }

  /* =========================================================
     幂等键
     ========================================================= */
  function hasTransaction(key) {
    return getData().transactions.some(t => t.settledKey === key);
  }

  function addTransaction(tx) {
    saveSilent(data => {
      data.transactions.push({
        id: U.uid('t'),
        createdAt: Date.now(),
        ...tx
      });
      const g = data.groups.find(x => x.id === tx.groupId);
      if (g) g.balance = (g.balance || 0) + tx.amount;
    });
  }

  /* =========================================================
     分组
     ========================================================= */
  function getGroup(id) {
    return getData().groups.find(g => g.id === id) || null;
  }
  function getGroups() {
    return getData().groups.slice();
  }
  function getDefaultGroup() {
    const gs = getData().groups;
    return gs.length ? gs[0] : null;
  }

  /* =========================================================
     结算核心
     ========================================================= */

  /**
   * 立即结算某个习惯某天的每日奖励
   * 在 habit.js 打卡成功后调用
   */
  function settleCheck(habit, date) {
    if (!habit || !habit.groupId) return;
    const data = getData();
    const group = data.groups.find(g => g.id === habit.groupId);
    if (!group) return;

    const item = normalizeItem(habit);
    const target = item.dailyTarget;
    const value = (item.records && item.records[date]) || 0;

    // 每日奖励：值 >= 目标
    if (value >= target) {
      const key = `daily|${habit.id}|${date}`;
      if (!hasTransaction(key)) {
        addTransaction({
          groupId: habit.groupId,
          type: 'reward',
          amount: data.rules.dailyReward,
          reason: `每日达标 · ${habit.name}`,
          habitId: habit.id,
          date,
          settledKey: key
        });
      }
      // 连续奖励档位
      checkStreakReward(habit, date);
    } else {
      // 未达标，检查是否触发连续未达标惩罚
      checkMissStreak(habit, date);
    }
  }

  /**
   * 检查连续达标档位
   * 从 date 往前数，连续达标天数
   */
  function checkStreakReward(habit, date) {
    const data = getData();
    const group = data.groups.find(g => g.id === habit.groupId);
    if (!group) return;
    const item = normalizeItem(habit);
    const target = item.dailyTarget;

    // 从 date 往前数连续达标
    let streak = 0;
    let cur = parseDate(date);
    while (true) {
      const ds = dateStr(cur);
      const v = (item.records && item.records[ds]) || 0;
      if (v >= target) {
        streak++;
        cur = addDays(cur, -1);
      } else {
        break;
      }
      // 上限保护：最多回看 500 天
      if (streak > 500) break;
    }

    // 检查是否命中某个档位
    const tier = data.rules.streakTiers.find(t => t.days === streak);
    if (!tier) return;

    const key = `streak|${habit.id}|${tier.days}|${date}`;
    if (hasTransaction(key)) return;

    addTransaction({
      groupId: habit.groupId,
      type: 'reward',
      amount: tier.reward,
      reason: `连续 ${tier.days} 天 · ${habit.name}`,
      habitId: habit.id,
      date,
      settledKey: key
    });
  }

  /**
   * 检查连续未达标惩罚（半自动）
   * 不直接扣钱，写入 pendingPenalties
   */
  function checkMissStreak(habit, date) {
    const data = getData();
    const item = normalizeItem(habit);
    const target = item.dailyTarget;

    // 从 date 往前数连续未达标
    let miss = 0;
    let cur = parseDate(date);
    while (true) {
      const ds = dateStr(cur);
      const v = (item.records && item.records[ds]) || 0;
      if (v < target) {
        miss++;
        cur = addDays(cur, -1);
      } else {
        break;
      }
      if (miss > 500) break;
    }

    const tier = data.rules.missStreakTiers.find(t => t.days === miss);
    if (!tier) return;

    const key = `miss|${habit.id}|${tier.days}|${date}`;
    // 已经在待确认或已确认/跳过里
    if (data.pendingPenalties.some(p => p.key === key)) return;

    saveSilent(d => {
      d.pendingPenalties.push({
        id: U.uid('p'),
        habitId: habit.id,
        habitName: habit.name,
        groupId: habit.groupId,
        days: tier.days,
        amount: tier.penalty,
        reason: `${habit.name} 已连续 ${tier.days} 天未打卡`,
        key,
        date,
        status: 'pending',
        createdAt: Date.now()
      });
    });
  }

  /* =========================================================
     全量补算
     ========================================================= */
  function settleAll() {
    const data = getData();
    const today = U.todayStr();

    // 没有分组，不补算
    if (!data.groups.length) return;

    // 起始日：lastSettledDate + 1，或者最近 60 天（首次使用）
    let startDate;
    if (data.lastSettledDate) {
      startDate = dateStr(addDays(parseDate(data.lastSettledDate), 1));
    } else {
      startDate = dateStr(addDays(parseDate(today), -60));
    }

    // 获取所有习惯
    const habitData = Store.get('habit') || {};
    const items = (habitData.items || []).filter(it => !it.archived && it.groupId);

    if (!items.length && !data.lastSettledDate) {
      // 没有习惯且首次，直接记录 lastSettledDate
      saveSilent(d => { d.lastSettledDate = today; });
      return;
    }

    // 逐天补算
    let cur = parseDate(startDate);
    const end = parseDate(today);
    let guard = 0;
    while (cur <= end && guard < 800) {
      const ds = dateStr(cur);
      items.forEach(it => {
        const item = normalizeItem(it);
        // 只补算习惯创建之后的日期
        if (item.createdAt && ds < item.createdAt) return;
        const v = (item.records && item.records[ds]) || 0;
        const key = `daily|${it.id}|${ds}`;
        if (v >= item.dailyTarget && !hasTransaction(key)) {
          addTransaction({
            groupId: it.groupId,
            type: 'reward',
            amount: data.rules.dailyReward,
            reason: `每日达标 · ${it.name}`,
            habitId: it.id,
            date: ds,
            settledKey: key
          });
          checkStreakReward(it, ds);
        } else if (v < item.dailyTarget) {
          checkMissStreak(it, ds);
        }
      });
      cur = addDays(cur, 1);
      guard++;
    }

    // 周/月/年奖励
    settleWeekly(items);
    settleMonthly(items);
    settleYearly(items);

    // 清理超过 1 年的明细
    cleanupOldTransactions();

    // 更新 lastSettledDate
    saveSilent(d => { d.lastSettledDate = today; });
  }

  function settleWeekly(items) {
    const data = getData();
    const today = new Date();
    // 上周一 ~ 上周日
    const wd = today.getDay();  // 0=周日
    const thisMon = new Date(today);
    thisMon.setDate(thisMon.getDate() + (wd === 0 ? -6 : 1 - wd));
    thisMon.setHours(0, 0, 0, 0);
    const lastMon = addDays(thisMon, -7);

    items.forEach(it => {
      const item = normalizeItem(it);
      if (!item.weeklyTarget) return;

      // 上周完成天数
      let done = 0;
      for (let i = 0; i < 7; i++) {
        const ds = dateStr(addDays(lastMon, i));
        if (item.createdAt && ds < item.createdAt) continue;
        const v = (item.records && item.records[ds]) || 0;
        if (v >= item.dailyTarget) done++;
      }
      if (done >= item.weeklyTarget) {
        const wk = isoWeekKey(dateStr(lastMon));
        const key = `weekly|${it.id}|${wk}`;
        if (!hasTransaction(key)) {
          addTransaction({
            groupId: it.groupId,
            type: 'reward',
            amount: data.rules.weeklyReward,
            reason: `周达标 · ${it.name}（${done}/${item.weeklyTarget}）`,
            habitId: it.id,
            date: dateStr(thisMon),
            settledKey: key
          });
        }
      }
    });
  }

  function settleMonthly(items) {
    const data = getData();
    const today = new Date();
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const ly = lastMonth.getFullYear();
    const lm = lastMonth.getMonth();
    const dim = new Date(ly, lm + 1, 0).getDate();

    items.forEach(it => {
      const item = normalizeItem(it);
      if (!item.monthlyTarget) return;

      let done = 0;
      for (let d = 1; d <= dim; d++) {
        const ds = U.todayStr(new Date(ly, lm, d));
        if (item.createdAt && ds < item.createdAt) continue;
        const v = (item.records && item.records[ds]) || 0;
        if (v >= item.dailyTarget) done++;
      }
      if (done >= item.monthlyTarget) {
        const mk = ly + '-' + U.pad(lm + 1);
        const key = `monthly|${it.id}|${mk}`;
        if (!hasTransaction(key)) {
          addTransaction({
            groupId: it.groupId,
            type: 'reward',
            amount: data.rules.monthlyReward,
            reason: `月达标 · ${it.name}（${done}/${item.monthlyTarget}）`,
            habitId: it.id,
            date: U.todayStr(),
            settledKey: key
          });
        }
      }
    });
  }

  function settleYearly(items) {
    const data = getData();
    const today = new Date();
    const lastYear = today.getFullYear() - 1;
    if (lastYear < 2000) return;

    items.forEach(it => {
      const item = normalizeItem(it);
      if (!item.yearlyTarget) return;

      let done = 0;
      for (let m = 0; m < 12; m++) {
        const dim = new Date(lastYear, m + 1, 0).getDate();
        for (let d = 1; d <= dim; d++) {
          const ds = U.todayStr(new Date(lastYear, m, d));
          if (item.createdAt && ds < item.createdAt) continue;
          const v = (item.records && item.records[ds]) || 0;
          if (v >= item.dailyTarget) done++;
        }
      }
      if (done >= item.yearlyTarget) {
        const key = `yearly|${it.id}|${lastYear}`;
        if (!hasTransaction(key)) {
          addTransaction({
            groupId: it.groupId,
            type: 'reward',
            amount: data.rules.yearlyReward,
            reason: `年达标 · ${it.name}（${done}/${item.yearlyTarget}）`,
            habitId: it.id,
            date: U.todayStr(),
            settledKey: key
          });
        }
      }
    });
  }

  /**
   * 清理超过 1 年的明细
   */
  function cleanupOldTransactions() {
    const cutoff = dateStr(addDays(new Date(), -365));
    saveSilent(d => {
      d.transactions = d.transactions.filter(t => {
        // 只按发生日期判断，保留最近 1 年
        return (t.date || '') >= cutoff;
      });
    });
  }

  /* =========================================================
     规范化习惯（复用 habit 模块的字段）
     ========================================================= */
  function normalizeItem(it) {
    const item = { ...it };
    if (!item.type) item.type = 'count';
    if (item.dailyTarget == null) item.dailyTarget = Number(item.target) || 1;
    if (item.weeklyTarget === undefined) item.weeklyTarget = null;
    if (item.monthlyTarget === undefined) item.monthlyTarget = null;
    if (item.yearlyTarget === undefined) item.yearlyTarget = null;
    if (!item.records) item.records = {};
    return item;
  }

  /* =========================================================
     渲染：主入口
     ========================================================= */
  let rewardTab = 'accounts';   // accounts | wishes | detail | settings
  let detailFilter = 'all';     // all | g_xxx
  let wishFilter = 'all';       // all | g_xxx

  function render(ctx) {
    // 每次进入都补算
    settleAll();

    const data = getData();
    const head = `
      <div class="reward-head">
        <span class="reward-title">奖励账户</span>
      </div>`;

    const tabs = `
      <div class="reward-tabs">
        <button class="reward-tab ${rewardTab === 'accounts' ? 'active' : ''}" data-act="reward-tab" data-tab="accounts">账户</button>
        <button class="reward-tab ${rewardTab === 'wishes' ? 'active' : ''}" data-act="reward-tab" data-tab="wishes">愿望</button>
        <button class="reward-tab ${rewardTab === 'detail' ? 'active' : ''}" data-act="reward-tab" data-tab="detail">明细</button>
        <button class="reward-tab ${rewardTab === 'settings' ? 'active' : ''}" data-act="reward-tab" data-tab="settings">设置</button>
      </div>`;

    let body = '';
    if (rewardTab === 'accounts') body = renderAccounts(data);
    else if (rewardTab === 'wishes') body = renderWishes(data);
    else if (rewardTab === 'detail') body = renderDetail(data);
    else body = renderSettings(data);

    // 待确认惩罚的提示条
    const pending = data.pendingPenalties.filter(p => p.status === 'pending');
    const pendingBar = pending.length
      ? `<div class="reward-pending-bar">
          ⚠️ ${pending.length} 条待确认惩罚
          <button class="reward-pending-link" data-act="reward-show-pending">查看</button>
        </div>`
      : '';

    return `<div class="reward-wrap">
      ${head}
      ${tabs}
      ${pendingBar}
      ${body}
    </div>`;
  }

  /* =========================================================
     渲染：账户页
     ========================================================= */
  function renderAccounts(data) {
    if (!data.groups.length) {
      return `<div class="empty" data-emoji="💰">
        还没有账户<br>
        奖励账户是用来记录你坚持习惯应得的奖励<br>
        <button class="btn btn-primary" data-act="reward-add-group" style="margin-top:14px">+ 新建分组</button>
      </div>`;
    }

    const pending = data.pendingPenalties.filter(p => p.status === 'pending');

    const cards = data.groups.map(g => {
      const today = U.todayStr();
      const thisMonth = today.slice(0, 7);

      // 本月收支
      const monthTx = data.transactions.filter(t =>
        t.groupId === g.id && (t.date || '').slice(0, 7) === thisMonth
      );
      const income = monthTx.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
      const outcome = monthTx.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);

      // 最近 3 笔
      const recent = data.transactions
        .filter(t => t.groupId === g.id)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        .slice(0, 3);

      const recentHtml = recent.length
        ? recent.map(t => `
            <div class="reward-tx-row">
              <span class="reward-tx-reason">${U.escape(t.reason)}</span>
              <span class="reward-tx-amount ${t.amount > 0 ? 'income' : 'outcome'}">${t.amount > 0 ? '+' : ''}${fmtFenRaw(t.amount)}</span>
            </div>
          `).join('')
        : `<div class="reward-tx-empty">还没有记录</div>`;

      const balanceCls = g.balance < 0 ? 'negative' : '';
      const balanceText = g.balance < 0
        ? `欠账 ${fmtFen(Math.abs(g.balance))}`
        : fmtFen(g.balance);

      // 该分组下的待确认
      const groupPending = pending.filter(p => p.groupId === g.id);
      const pendingHtml = groupPending.length
        ? `<div class="reward-group-pending">
            ⚠️ ${groupPending.length} 条待确认
            <button data-act="reward-show-pending-group" data-group="${g.id}">查看</button>
          </div>`
        : '';

      return `<div class="reward-account-card ${g.balance < 0 ? 'is-negative' : ''}">
        <div class="reward-account-head">
          <span class="reward-group-icon">${U.escape(g.icon || '💰')}</span>
          <span class="reward-group-name">${U.escape(g.name)}</span>
          <button class="reward-group-menu" data-act="reward-group-menu" data-id="${g.id}">⋯</button>
        </div>
        <div class="reward-account-balance ${balanceCls}">${balanceText}</div>
        <div class="reward-account-meta">
          本月 +${fmtFenRaw(income)} · ${fmtFenRaw(outcome)}
        </div>
        ${pendingHtml}
        <div class="reward-account-recent">
          <div class="reward-account-recent-title">最近记录</div>
          ${recentHtml}
        </div>
        <button class="reward-account-more" data-act="reward-detail-filter" data-group="${g.id}">查看全部明细 ›</button>
      </div>`;
    }).join('');

    return `<div class="reward-accounts">
      ${cards}
      <button class="reward-add-group-btn" data-act="reward-add-group">+ 新建分组</button>
    </div>`;
  }

  /* =========================================================
     渲染：愿望
     ========================================================= */
  function renderWishes(data) {
    if (!data.groups.length) {
      return `<div class="empty" data-emoji="⭐">
        请先建一个分组
      </div>`;
    }

    const filter = wishFilter;
    let wishes = data.wishes;
    if (filter !== 'all') {
      wishes = wishes.filter(w => w.groupId === filter);
    }

    // 分类
    const exchanged = wishes.filter(w => w.exchangedAt);
    const active = wishes.filter(w => !w.exchangedAt);

    // 状态实时计算
    const activeWithStatus = active.map(w => {
      const group = data.groups.find(g => g.id === w.groupId);
      const balance = group ? (group.balance || 0) : 0;
      const ready = balance >= w.price;
      return { ...w, ready, group };
    });

    // 排序：可兑换在前，然后按优先级、创建时间
    const PRI = { high: 0, mid: 1, low: 2 };
    activeWithStatus.sort((a, b) => {
      if (a.ready !== b.ready) return a.ready ? -1 : 1;
      const pa = PRI[a.priority] != null ? PRI[a.priority] : 1;
      const pb = PRI[b.priority] != null ? PRI[b.priority] : 1;
      if (pa !== pb) return pa - pb;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });

    const filterBar = data.groups.length > 1
      ? `<div class="reward-wish-filter">
          <button class="${filter === 'all' ? 'active' : ''}" data-act="reward-wish-filter" data-group="all">全部</button>
          ${data.groups.map(g => `
            <button class="${filter === g.id ? 'active' : ''}" data-act="reward-wish-filter" data-group="${g.id}">${U.escape(g.name)}</button>
          `).join('')}
        </div>`
      : '';

    const activeHtml = activeWithStatus.length
      ? activeWithStatus.map(w => renderWishCard(w, data)).join('')
      : `<div class="empty" data-emoji="🎁">
          还没有愿望<br>
          <button class="btn btn-primary" data-act="reward-add-wish" style="margin-top:12px">+ 新增愿望</button>
        </div>`;

    const exchangedHtml = exchanged.length
      ? `<div class="reward-wish-section-title">已兑换 (${exchanged.length})</div>
         <div class="reward-wish-exchanged">
           ${exchanged.sort((a, b) => b.exchangedAt - a.exchangedAt).map(w => `
             <div class="reward-wish-row">
               <span class="reward-wish-name">${U.escape(w.name)}</span>
               <span class="reward-wish-price">${fmtFen(w.price)}</span>
               <span class="reward-wish-date">${U.formatDate(dateStr(new Date(w.exchangedAt)))}</span>
             </div>
           `).join('')}
         </div>`
      : '';

    return `<div class="reward-wishes">
      ${filterBar}
      <div class="reward-wish-active">${activeHtml}</div>
      <button class="reward-add-wish-btn" data-act="reward-add-wish">+ 新增愿望</button>
      ${exchangedHtml}
    </div>`;
  }

  function renderWishCard(w, data) {
    const group = w.group;
    const balance = group ? (group.balance || 0) : 0;
    const pct = Math.min(100, Math.round(balance / w.price * 100));
    const remain = Math.max(0, w.price - balance);
    const priLabel = { high: '高', mid: '中', low: '低' }[w.priority] || '中';
    const priCls = w.priority || 'mid';

    return `<div class="reward-wish-card ${w.ready ? 'is-ready' : ''}">
      <div class="reward-wish-head">
        <span class="reward-wish-title">${U.escape(w.name)}</span>
        <span class="reward-wish-priority ${priCls}">${priLabel}</span>
      </div>
      <div class="reward-wish-price-line">
        <span class="reward-wish-price-big">${fmtFen(w.price)}</span>
        <span class="reward-wish-group">${U.escape(group ? group.name : '未知分组')}</span>
      </div>
      ${w.ready ? `
        <div class="reward-wish-ready-hint">🎉 已可兑换（余额 ${fmtFen(balance)}）</div>
        <div class="reward-wish-actions">
          <button class="btn btn-primary" data-act="reward-wish-exchange" data-id="${w.id}">去兑换</button>
          <button class="btn btn-ghost" data-act="reward-wish-edit" data-id="${w.id}">编辑</button>
          <button class="btn btn-danger" data-act="reward-wish-del" data-id="${w.id}">删除</button>
        </div>
      ` : `
        <div class="reward-wish-bar"><i style="width:${pct}%"></i></div>
        <div class="reward-wish-progress">
          <span>已攒 ${fmtFen(balance)}</span>
          <span>还差 ${fmtFen(remain)}</span>
        </div>
        <div class="reward-wish-actions">
          <button class="btn btn-ghost" data-act="reward-wish-edit" data-id="${w.id}">编辑</button>
          <button class="btn btn-danger" data-act="reward-wish-del" data-id="${w.id}">删除</button>
        </div>
      `}
      ${w.note ? `<div class="reward-wish-note">${U.escape(w.note)}</div>` : ''}
    </div>`;
  }

  /* =========================================================
     渲染：明细
     ========================================================= */
  function renderDetail(data) {
    let tx = data.transactions.slice();
    if (detailFilter !== 'all') {
      tx = tx.filter(t => t.groupId === detailFilter);
    }
    tx.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const filterBar = data.groups.length > 1
      ? `<div class="reward-wish-filter">
          <button class="${detailFilter === 'all' ? 'active' : ''}" data-act="reward-detail-filter" data-group="all">全部</button>
          ${data.groups.map(g => `
            <button class="${detailFilter === g.id ? 'active' : ''}" data-act="reward-detail-filter" data-group="${g.id}">${U.escape(g.name)}</button>
          `).join('')}
        </div>`
      : '';

    if (!tx.length) {
      return `<div class="reward-detail">
        ${filterBar}
        <div class="empty" data-emoji="📋">暂无明细</div>
      </div>`;
    }

    // 按日期分组
    const byDate = {};
    tx.forEach(t => {
      const d = t.date || '';
      (byDate[d] = byDate[d] || []).push(t);
    });
    const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

    const html = dates.map(d => {
      const items = byDate[d];
      const rows = items.map(t => {
        const g = data.groups.find(x => x.id === t.groupId);
        return `<div class="reward-detail-row">
          <div class="reward-detail-main">
            <div class="reward-detail-reason">${U.escape(t.reason)}</div>
            <div class="reward-detail-group">${U.escape(g ? g.name : '已删除分组')}</div>
          </div>
          <div class="reward-detail-amount ${t.amount > 0 ? 'income' : 'outcome'}">
            ${t.amount > 0 ? '+' : ''}${fmtFenRaw(t.amount)}
          </div>
        </div>`;
      }).join('');
      return `<div class="reward-detail-day">
        <div class="reward-detail-date">${U.formatDate(d)}</div>
        ${rows}
      </div>`;
    }).join('');

    return `<div class="reward-detail">
      ${filterBar}
      ${html}
    </div>`;
  }

  /* =========================================================
     渲染：设置
     ========================================================= */
  function renderSettings(data) {
    const r = data.rules;

    const groupRows = data.groups.length
      ? data.groups.map(g => `
          <div class="reward-setting-group">
            <span class="reward-setting-icon">${U.escape(g.icon || '💰')}</span>
            <span class="reward-setting-name">${U.escape(g.name)}</span>
            <span class="reward-setting-balance">${fmtFen(g.balance || 0)}</span>
            <button class="reward-setting-edit" data-act="reward-edit-group" data-id="${g.id}">编辑</button>
          </div>
        `).join('')
      : `<div class="reward-setting-empty">还没有分组</div>`;

    const streakRows = r.streakTiers.map((t, i) => `
      <div class="reward-rule-row">
        <span>连续 ${t.days} 天</span>
        <input type="number" data-act="rule-streak" data-idx="${i}" value="${t.reward / 100}" step="0.5" min="0">
        <span>元</span>
      </div>
    `).join('');

    const missRows = r.missStreakTiers.map((t, i) => `
      <div class="reward-rule-row">
        <span>连续 ${t.days} 天未打卡</span>
        <input type="number" data-act="rule-miss" data-idx="${i}" value="${t.penalty / 100}" step="0.5" min="0">
        <span>元</span>
      </div>
    `).join('');

    return `<div class="reward-settings">
      <div class="reward-setting-block">
        <div class="reward-setting-title">分组管理</div>
        ${groupRows}
        <button class="reward-add-group-btn small" data-act="reward-add-group">+ 新建分组</button>
      </div>

      <div class="reward-setting-block">
        <div class="reward-setting-title">每日奖励</div>
        <div class="reward-rule-row">
          <span>每天达标</span>
          <input type="number" data-act="rule-daily" value="${r.dailyReward / 100}" step="0.5" min="0">
          <span>元</span>
        </div>
      </div>

      <div class="reward-setting-block">
        <div class="reward-setting-title">周 / 月 / 年 达标奖励</div>
        <div class="reward-rule-row">
          <span>周达标</span>
          <input type="number" data-act="rule-weekly" value="${r.weeklyReward / 100}" step="0.5" min="0">
          <span>元</span>
        </div>
        <div class="reward-rule-row">
          <span>月达标</span>
          <input type="number" data-act="rule-monthly" value="${r.monthlyReward / 100}" step="0.5" min="0">
          <span>元</span>
        </div>
        <div class="reward-rule-row">
          <span>年达标</span>
          <input type="number" data-act="rule-yearly" value="${r.yearlyReward / 100}" step="0.5" min="0">
          <span>元</span>
        </div>
      </div>

      <div class="reward-setting-block">
        <div class="reward-setting-title">连续达标奖励</div>
        <div class="reward-setting-hint">达到对应天数时一次发放，不叠加</div>
        ${streakRows}
      </div>

      <div class="reward-setting-block">
        <div class="reward-setting-title">连续未打卡惩罚</div>
        <div class="reward-setting-hint">达到对应天数时，会在主页和账户页提醒你确认</div>
        ${missRows}
      </div>
    </div>`;
  }

  /* =========================================================
     事件分发
     ========================================================= */
  function handleAction(act, el, ctx) {
    /* ---------- Tab 切换 ---------- */
    if (act === 'reward-tab') {
      rewardTab = el.dataset.tab;
      ctx.refresh();
      return true;
    }

    /* ---------- 分组 CRUD ---------- */
    if (act === 'reward-add-group') {
      openGroupForm(null);
      return true;
    }
    if (act === 'reward-edit-group') {
      const g = getGroup(el.dataset.id);
      if (g) openGroupForm(g);
      return true;
    }
    if (act === 'reward-group-menu') {
      openGroupMenu(el.dataset.id);
      return true;
    }

    /* ---------- 愿望 CRUD ---------- */
    if (act === 'reward-add-wish') { openWishForm(null); return true; }
    if (act === 'reward-wish-edit') {
      const w = getData().wishes.find(x => x.id === el.dataset.id);
      if (w) openWishForm(w);
      return true;
    }
    if (act === 'reward-wish-del') {
      const id = el.dataset.id;
      UI.confirm('删除这个愿望？').then(ok => {
        if (!ok) return;
        save(d => {
          d.wishes = d.wishes.filter(w => w.id !== id);
        });
      });
      return true;
    }
    if (act === 'reward-wish-exchange') {
      const id = el.dataset.id;
      doExchange(id);
      return true;
    }

    /* ---------- 明细筛选 ---------- */
    if (act === 'reward-detail-filter') {
      const g = el.dataset.group;
      if (g && g !== 'all') {
        detailFilter = g;
        rewardTab = 'detail';
      } else {
        detailFilter = 'all';
      }
      ctx.refresh();
      return true;
    }
    if (act === 'reward-wish-filter') {
      wishFilter = el.dataset.group || 'all';
      ctx.refresh();
      return true;
    }

    /* ---------- 待确认惩罚 ---------- */
    if (act === 'reward-show-pending' || act === 'reward-show-pending-group') {
      openPendingSheet(el.dataset.group || null);
      return true;
    }

    /* ---------- 设置：规则 ---------- */
    if (act === 'rule-daily' || act === 'rule-weekly' || act === 'rule-monthly' ||
        act === 'rule-yearly' || act === 'rule-streak' || act === 'rule-miss') {
      // 用失焦保存，避免每次输入都触发重渲染
      if (el._rewardBound) return;
      el._rewardBound = true;
      el.addEventListener('blur', () => {
        const v = Math.max(0, Number(el.value) || 0) * 100;
        saveSilent(d => {
          if (act === 'rule-daily') d.rules.dailyReward = Math.round(v);
          else if (act === 'rule-weekly') d.rules.weeklyReward = Math.round(v);
          else if (act === 'rule-monthly') d.rules.monthlyReward = Math.round(v);
          else if (act === 'rule-yearly') d.rules.yearlyReward = Math.round(v);
          else if (act === 'rule-streak') {
            const idx = Number(el.dataset.idx);
            if (d.rules.streakTiers[idx]) d.rules.streakTiers[idx].reward = Math.round(v);
          } else if (act === 'rule-miss') {
            const idx = Number(el.dataset.idx);
            if (d.rules.missStreakTiers[idx]) d.rules.missStreakTiers[idx].penalty = Math.round(v);
          }
        });
      });
      return false;  // 不拦截，让输入框正常聚焦
    }

    return false;
  }

  /* =========================================================
     分组表单
     ========================================================= */
  function openGroupForm(editing) {
    UI.form(editing ? '编辑分组' : '新建分组', [
      { name: 'name', label: '分组名称', required: true, placeholder: '例如：日常习惯', value: editing ? editing.name : '' },
      { name: 'icon', label: '图标（emoji）', value: editing ? editing.icon : '🌱' }
    ]).then(r => {
      if (!r) return;
      const name = (r.name || '').trim();
      if (!name) return;
      save(d => {
        if (editing) {
          const g = d.groups.find(x => x.id === editing.id);
          if (g) { g.name = name; g.icon = r.icon || '🌱'; }
        } else {
          d.groups.push({
            id: U.uid('g'),
            name,
            icon: r.icon || '🌱',
            balance: 0,
            createdAt: Date.now()
          });
        }
      });
    });
  }

  function openGroupMenu(groupId) {
    const g = getGroup(groupId);
    if (!g) return;

    const old = document.getElementById('rewardMenu');
    if (old) old.remove();

    const mask = document.createElement('div');
    mask.id = 'rewardMenu';
    mask.className = 'reward-menu-mask';
    mask.innerHTML = `
      <div class="reward-menu">
        <div class="reward-menu-title">${U.escape(g.name)}</div>
        <button class="reward-menu-btn" data-menu-act="edit">
          <span class="reward-menu-icon">✏️</span>编辑分组
        </button>
        <button class="reward-menu-btn" data-menu-act="adjust">
          <span class="reward-menu-icon">⚖️</span>手动调整余额
        </button>
        <button class="reward-menu-btn danger" data-menu-act="del">
          <span class="reward-menu-icon">🗑️</span>删除分组
        </button>
        <button class="reward-menu-cancel" data-menu-act="cancel">取消</button>
      </div>`;
    document.body.appendChild(mask);
    requestAnimationFrame(() => mask.classList.add('show'));

    mask.addEventListener('click', e => {
      if (e.target === mask) { close(); return; }
      const btn = e.target.closest('[data-menu-act]');
      if (!btn) return;
      const act = btn.dataset.menuAct;
      close();
      if (act === 'cancel') return;
      setTimeout(() => {
        if (act === 'edit') openGroupForm(g);
        else if (act === 'adjust') openAdjustForm(g);
        else if (act === 'del') tryDeleteGroup(g);
      }, 220);
    });

    function close() {
      mask.classList.remove('show');
      setTimeout(() => { if (mask.parentNode) mask.parentNode.removeChild(mask); }, 220);
    }
  }

  function openAdjustForm(group) {
    UI.form('手动调整「' + group.name + '」余额', [
      { name: 'amount', label: '调整金额（正数=增加，负数=减少）', type: 'number', value: '', required: true },
      { name: 'reason', label: '原因', required: true, placeholder: '例如：上个月漏算' }
    ]).then(r => {
      if (!r) return;
      const yuan = Number(r.amount);
      if (!isFinite(yuan) || yuan === 0) { UI.toast('请输入非 0 金额'); return; }
      const fen = Math.round(yuan * 100);
      addTransaction({
        groupId: group.id,
        type: 'adjust',
        amount: fen,
        reason: (r.reason || '手动调整'),
        date: U.todayStr(),
        settledKey: 'adjust|' + Date.now()
      });
      UI.toast('已调整');
    });
  }

  function tryDeleteGroup(group) {
    // 检查余额和挂靠习惯
    const habits = (Store.get('habit') || {}).items || [];
    const attached = habits.filter(h => h.groupId === group.id);
    if ((group.balance || 0) !== 0) {
      UI.toast('分组余额不为 0，请先调整到 0');
      return;
    }
    if (attached.length) {
      UI.toast(`还有 ${attached.length} 个习惯在这个分组，请先转移`);
      return;
    }
    UI.confirm(`确定删除分组「${group.name}」吗？`).then(ok => {
      if (!ok) return;
      save(d => {
        d.groups = d.groups.filter(g => g.id !== group.id);
        // 同时清理该分组的明细和愿望
        d.transactions = d.transactions.filter(t => t.groupId !== group.id);
        d.wishes = d.wishes.filter(w => w.groupId !== group.id);
        d.pendingPenalties = d.pendingPenalties.filter(p => p.groupId !== group.id);
      });
      UI.toast('已删除');
    });
  }

  /* =========================================================
     愿望表单
     ========================================================= */
  function openWishForm(editing) {
    const data = getData();
    if (!data.groups.length) {
      UI.toast('请先建一个分组');
      return;
    }

    const groupOptions = data.groups.map(g => ({
      value: g.id,
      label: g.name
    }));

    UI.form(editing ? '编辑愿望' : '新增愿望', [
      { name: 'name', label: '商品名称', required: true, value: editing ? editing.name : '', placeholder: '例如：降噪耳机' },
      { name: 'price', label: '价格（元）', type: 'number', required: true,
        value: editing ? (editing.price / 100).toFixed(2) : '' },
      { name: 'groupId', label: '从哪个分组扣钱', type: 'select',
        value: editing ? editing.groupId : data.groups[0].id,
        options: groupOptions },
      { name: 'priority', label: '优先级', type: 'select',
        value: editing ? (editing.priority || 'mid') : 'mid',
        options: [
          { value: 'high', label: '高' },
          { value: 'mid', label: '中' },
          { value: 'low', label: '低' }
        ] },
      { name: 'note', label: '备注（可选）', value: editing ? (editing.note || '') : '' }
    ]).then(r => {
      if (!r) return;
      const name = (r.name || '').trim();
      const yuan = Number(r.price);
      if (!name || !isFinite(yuan) || yuan <= 0) { UI.toast('请填写名称和价格'); return; }
      const priceFen = Math.round(yuan * 100);

      save(d => {
        if (editing) {
          const w = d.wishes.find(x => x.id === editing.id);
          if (w) {
            w.name = name;
            w.price = priceFen;
            w.groupId = r.groupId;
            w.priority = r.priority;
            w.note = (r.note || '').trim();
          }
        } else {
          d.wishes.push({
            id: U.uid('w'),
            name,
            price: priceFen,
            groupId: r.groupId,
            priority: r.priority,
            note: (r.note || '').trim(),
            createdAt: Date.now(),
            exchangedAt: null
          });
        }
      });
    });
  }

  function doExchange(wishId) {
    const data = getData();
    const w = data.wishes.find(x => x.id === wishId);
    if (!w) return;
    const g = data.groups.find(x => x.id === w.groupId);
    if (!g) return;
    if ((g.balance || 0) < w.price) {
      UI.toast('余额不足');
      return;
    }
    UI.confirm(`兑换「${w.name}」，扣 ${fmtFen(w.price)}？\n剩余：${fmtFen(g.balance - w.price)}`).then(ok => {
      if (!ok) return;
      addTransaction({
        groupId: w.groupId,
        type: 'exchange',
        amount: -w.price,
        reason: `兑换 · ${w.name}`,
        date: U.todayStr(),
        settledKey: 'exchange|' + w.id
      });
      save(d => {
        const t = d.wishes.find(x => x.id === wishId);
        if (t) t.exchangedAt = Date.now();
      });
      UI.toast('兑换成功 🎉');
    });
  }

  /* =========================================================
     待确认惩罚面板
     ========================================================= */
  function openPendingSheet(groupFilter) {
    const data = getData();
    let pending = data.pendingPenalties.filter(p => p.status === 'pending');
    if (groupFilter) pending = pending.filter(p => p.groupId === groupFilter);

    const old = document.getElementById('rewardPending');
    if (old) old.remove();

    if (!pending.length) {
      UI.toast('没有待确认的惩罚');
      return;
    }

    const mask = document.createElement('div');
    mask.id = 'rewardPending';
    mask.className = 'reward-menu-mask';
    mask.innerHTML = `
      <div class="reward-menu reward-pending-sheet">
        <div class="reward-menu-title">待确认惩罚</div>
        <div class="reward-pending-list">
          ${pending.map(p => {
            const g = data.groups.find(x => x.id === p.groupId);
            return `<div class="reward-pending-item" data-pending-id="${p.id}">
              <div class="reward-pending-reason">${U.escape(p.reason)}</div>
              <div class="reward-pending-meta">
                <span>分组：${U.escape(g ? g.name : '已删除')}</span>
                <span class="reward-pending-amount">-${fmtFenRaw(p.amount)}</span>
              </div>
              <div class="reward-pending-actions">
                <button class="btn btn-danger" data-pending-act="confirm" data-id="${p.id}">确认扣款</button>
                <button class="btn btn-ghost" data-pending-act="skip" data-id="${p.id}">这次跳过</button>
              </div>
            </div>`;
          }).join('')}
        </div>
        <button class="reward-menu-cancel" data-pending-act="close">关闭</button>
      </div>`;
    document.body.appendChild(mask);
    requestAnimationFrame(() => mask.classList.add('show'));

    mask.addEventListener('click', e => {
      if (e.target === mask) { close(); return; }
      const btn = e.target.closest('[data-pending-act]');
      if (!btn) return;
      const act = btn.dataset.pendingAct;
      if (act === 'close') { close(); return; }
      const id = btn.dataset.id;
      if (act === 'confirm') {
        const p = getData().pendingPenalties.find(x => x.id === id);
        if (!p) return;
        addTransaction({
          groupId: p.groupId,
          type: 'penalty',
          amount: -p.amount,
          reason: p.reason,
          habitId: p.habitId,
          date: U.todayStr(),
          settledKey: 'penalty|' + p.id
        });
        saveSilent(d => {
          const t = d.pendingPenalties.find(x => x.id === id);
          if (t) t.status = 'confirmed';
        });
        UI.toast('已扣款');
        // 移除该项
        const item = mask.querySelector(`[data-pending-id="${id}"]`);
        if (item) item.remove();
        // 如果全空了就关闭
        if (!mask.querySelector('.reward-pending-item')) close();
      } else if (act === 'skip') {
        saveSilent(d => {
          const t = d.pendingPenalties.find(x => x.id === id);
          if (t) t.status = 'skipped';
        });
        UI.toast('已跳过');
        const item = mask.querySelector(`[data-pending-id="${id}"]`);
        if (item) item.remove();
        if (!mask.querySelector('.reward-pending-item')) close();
      }
    });

    function close() {
      mask.classList.remove('show');
      setTimeout(() => {
        if (mask.parentNode) mask.parentNode.removeChild(mask);
        // 关闭时刷新页面
        if (window.App && App.render) App.render();
      }, 220);
    }
  }

  /* =========================================================
     对外接口
     ========================================================= */
  window.Reward = {
    render,
    handleAction,
    getGroups,
    getDefaultGroup,
    settleCheck,
    settleAll
  };
})();