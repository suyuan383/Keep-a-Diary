(function () {
  const KEY = 'period';

  /* ============ 预设选项 ============ */
  const SYMPTOMS = [
    '腰酸', '小腹疼痛', '头痛', '乳房胀痛', '疲劳',
    '长痘', '便秘', '腹泻', '恶心', '食欲增加', '食欲减退'
  ];
  const MOODS = [
    '精神不振', '情绪波动', '烦躁易怒', '焦虑',
    '低落', '注意力不集中', '情绪稳定'
  ];
  const FLOWS = [
    { id: 'light',  name: '少', dots: 1 },
    { id: 'medium', name: '中', dots: 2 },
    { id: 'heavy',  name: '多', dots: 3 }
  ];

  /* ============ 状态 ============ */
  let viewTab = 'overview';
  let calYM = null;
  let selectedDate = null;
  let historyLimit = 10;
  let intimacyRange = 'month';
  let intimacyAnchor = null;

  /* ============ 数据读写 ============ */
  function getData() {
    const d = Store.ensure(KEY, () => ({ days: {} }));
    if (!d.days) d.days = {};
    return d;
  }
  function getDay(date) {
    return getData().days[date] || null;
  }
  function ensureDay(date) {
    const d = getData().days;
    if (!d[date]) {
      d[date] = { onPeriod: false, intimacy: false, flow: null, symptoms: [], mood: [], note: '' };
    } else if (d[date].intimacy === undefined) {
      d[date].intimacy = false;
    }
    return d[date];
  }
  function setDay(date, patch) {
    const updater = Store.updateSilent || Store.update;
    updater.call(Store, KEY, data => {
      if (!data.days) data.days = {};
      if (!data.days[date]) {
        data.days[date] = { onPeriod: false, intimacy: false, flow: null, symptoms: [], mood: [], note: '' };
      }
      Object.assign(data.days[date], patch);
      const d = data.days[date];
      const hasData = d.onPeriod || d.intimacy || d.flow ||
                      (d.symptoms && d.symptoms.length) ||
                      (d.mood && d.mood.length) || d.note;
      if (!hasData) delete data.days[date];
      return data;
    });
  }

  /* ============ 日期工具 ============ */
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
  function fmtDate(s) {
    const d = parseDate(s);
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function fmtDateLong(s) {
    const d = parseDate(s);
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function startOfWeek(d) {
    const t = new Date(d);
    const wd = t.getDay();
    t.setDate(t.getDate() + (wd === 0 ? -6 : 1 - wd));
    t.setHours(0, 0, 0, 0);
    return t;
  }

  /* ============ 聚合：连续日期 → 一次经期 ============ */
  function aggregatePeriods() {
    const days = getData().days;
    const periodDates = Object.keys(days).filter(d => days[d].onPeriod).sort();
    const periods = [];
    let cur = null;
    periodDates.forEach(date => {
      if (!cur) {
        cur = { startDate: date, endDate: date, days: [date] };
      } else {
        const last = parseDate(cur.endDate);
        const thisD = parseDate(date);
        const diff = daysBetween(last, thisD);
        if (diff <= 2) {
          cur.endDate = date;
          cur.days.push(date);
        } else {
          periods.push(cur);
          cur = { startDate: date, endDate: date, days: [date] };
        }
      }
    });
    if (cur) periods.push(cur);

    periods.forEach(p => {
      p.duration = daysBetween(p.startDate, p.endDate) + 1;
      const symSet = new Set();
      const moodSet = new Set();
      const flowCounts = {};
      p.days.forEach(d => {
        const day = days[d] || {};
        (day.symptoms || []).forEach(s => symSet.add(s));
        (day.mood || []).forEach(m => moodSet.add(m));
        if (day.flow) flowCounts[day.flow] = (flowCounts[day.flow] || 0) + 1;
      });
      p.symptoms = [...symSet];
      p.mood = [...moodSet];
      p.flow = Object.keys(flowCounts).sort((a, b) => flowCounts[b] - flowCounts[a])[0] || null;
    });

    return periods;
  }

  /* ============ 预测 ============ */
  function computePrediction() {
    const periods = aggregatePeriods();
    if (!periods.length) return null;

    const cycles = [];
    for (let i = 1; i < periods.length; i++) {
      const days = daysBetween(periods[i - 1].startDate, periods[i].startDate);
      if (days >= 15 && days <= 60) cycles.push(days);
    }
    const durations = periods.map(p => p.duration).filter(d => d > 0);

    const recentCycles = cycles.slice(-6);
    const recentDur = durations.slice(-6);

    function weightedAvg(arr) {
      if (!arr.length) return null;
      const weights = arr.map((_, i) => i + 1);
      const sum = arr.reduce((s, v, i) => s + v * weights[i], 0);
      const wsum = weights.reduce((s, w) => s + w, 0);
      return sum / wsum;
    }

    const avgCycle = recentCycles.length ? weightedAvg(recentCycles) : null;
    const avgDuration = recentDur.length ? weightedAvg(recentDur) : 5;

    let stdDev = 0;
    if (recentCycles.length >= 2) {
      const mean = recentCycles.reduce((s, v) => s + v, 0) / recentCycles.length;
      stdDev = Math.sqrt(
        recentCycles.reduce((s, v) => s + (v - mean) * (v - mean), 0) / recentCycles.length
      );
    }

    const lastStart = parseDate(periods[periods.length - 1].startDate);
    const lastEnd = parseDate(periods[periods.length - 1].endDate);
    const nextStart = avgCycle ? addDays(lastStart, Math.round(avgCycle)) : null;
    const nextEnd = nextStart ? addDays(nextStart, Math.round(avgDuration) - 1) : null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const daysSinceLast = daysBetween(lastStart, today);
    const daysToNext = nextStart ? daysBetween(today, nextStart) : null;

    const isOnPeriod = today >= lastStart && today <= lastEnd;
    const periodDay = isOnPeriod ? daysBetween(lastStart, today) + 1 : null;

    let confidence = 'low';
    if (recentCycles.length >= 3 && stdDev < 4) confidence = 'high';
    else if (recentCycles.length >= 2) confidence = 'mid';

    return {
      periods,
      lastStart, lastEnd,
      avgCycle, avgDuration, stdDev,
      nextStart, nextEnd,
      cycles, recentCycles,
      daysSinceLast, daysToNext,
      isOnPeriod, periodDay,
      confidence
    };
  }

  /* ============ 亲密记录统计 ============ */
  function computeIntimacyStats() {
    const days = getData().days;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = dateStr(today);
    const y = today.getFullYear();
    const m = today.getMonth();

    // 本周（周一到今天）
    const monday = startOfWeek(today);
    let weekCount = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      if (dateStr(d) > todayStr) break;
      const ds = dateStr(d);
      if (days[ds] && days[ds].intimacy) weekCount++;
    }

    // 本月（1 号到今天）
    let monthCount = 0;
    for (let d = 1; d <= today.getDate(); d++) {
      const ds = U.todayStr(new Date(y, m, d));
      if (days[ds] && days[ds].intimacy) monthCount++;
    }

    // 本年
    let yearCount = 0;
    const yearPrefix = y + '-';
    Object.keys(days).forEach(ds => {
      if (ds.indexOf(yearPrefix) === 0 && days[ds].intimacy) yearCount++;
    });

    // 最近 7 天
    let last7 = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(today, -i);
      const ds = dateStr(d);
      if (days[ds] && days[ds].intimacy) last7++;
    }

    // 本年已经过的周数
    const yearStart = new Date(y, 0, 1);
    const daysPassed = Math.floor((today - yearStart) / 86400000) + 1;
    const yearWeeks = Math.max(1, Math.ceil(daysPassed / 7));

    return { weekCount, monthCount, yearCount, last7, yearWeeks };
  }

  /* ============ 注册模块 ============ */
  Registry.register({
    id: 'period',
    name: '生理期',
    icon: '🩸',
    order: 28,
    storageKey: KEY,

    homeCard() {
      const p = computePrediction();
      if (!p) {
        return `<div class="card">
          <div class="card-head">
            <span class="card-icon">🩸</span>
            <span class="card-title">生理期</span>
            <a class="card-more" href="#period">开始记录 ›</a>
          </div>
          <div class="card-empty">在日历上点今天，开启第一次记录</div>
        </div>`;
      }

      let mainText, subText;
      if (p.isOnPeriod) {
        mainText = `经期第 ${p.periodDay} 天`;
        subText = `本次从 ${fmtDate(dateStr(p.lastStart))} 开始 · 平均 ${p.avgCycle ? Math.round(p.avgCycle) : '—'} 天周期`;
      } else if (p.daysToNext != null && p.daysToNext >= 0) {
        mainText = `预计还有 ${p.daysToNext} 天`;
        subText = `下次约 ${fmtDate(dateStr(p.nextStart))} · 平均 ${Math.round(p.avgCycle)} 天周期`;
      } else if (p.daysToNext != null && p.daysToNext < 0) {
        mainText = `预计日期已过 ${-p.daysToNext} 天`;
        subText = '点进日历更新一下？';
      } else {
        mainText = `距上次 ${p.daysSinceLast} 天`;
        subText = '继续记录会更准确';
      }

      const confTag = {
        high: `<span class="period-conf high">较准</span>`,
        mid:  `<span class="period-conf mid">一般</span>`,
        low:  `<span class="period-conf low">初次</span>`
      }[p.confidence];

      return `<div class="card">
        <div class="card-head">
          <span class="card-icon">🩸</span>
          <span class="card-title">生理期</span>
          ${confTag}
          <a class="card-more" href="#period">详情 ›</a>
        </div>
        <div class="period-home-main">${mainText}</div>
        <div class="period-home-sub">${subText}</div>
      </div>`;
    },

    page() { return renderPage(); },

    handleAction(act, el, ctx) {
      /* --- Tab --- */
      if (act === 'period-tab') {
        viewTab = el.dataset.tab;
        selectedDate = null;
        ctx.refresh();
        return true;
      }

      /* --- 日历月份切换 --- */
      if (act === 'period-cal-prev' || act === 'period-cal-next') {
        const ym = getCalYM();
        let m = ym.month + (act === 'period-cal-prev' ? -1 : 1);
        let y = ym.year;
        if (m < 0) { m = 11; y--; }
        if (m > 11) { m = 0; y++; }
        calYM = { year: y, month: m };
        selectedDate = null;
        ctx.refresh();
        return true;
      }
      if (act === 'period-cal-now') {
        const n = new Date();
        calYM = { year: n.getFullYear(), month: n.getMonth() };
        selectedDate = U.todayStr();
        ctx.refresh();
        return true;
      }

      /* --- 点日期 --- */
      if (act === 'period-day-click') {
        handleDayClick(el.dataset.date);
        return true;
      }

      /* --- 开关"来月经" --- */
      if (act === 'period-toggle-onperiod') {
        const date = el.dataset.date;
        const day = ensureDay(date);
        day.onPeriod = !day.onPeriod;
        setDay(date, { onPeriod: day.onPeriod });

        const cell = document.querySelector(`.period-cell[data-date="${date}"]`);
        if (cell) {
          cell.classList.toggle('actual', day.onPeriod);
          if (day.onPeriod) cell.classList.remove('has-note');
        }
        const toggle = el.closest('.period-toggle');
        if (toggle) toggle.classList.toggle('active', day.onPeriod);

        const flowSection = document.querySelector('.flow-section');
        if (flowSection) {
          flowSection.style.display = day.onPeriod ? '' : 'none';
        }
        return true;
      }

      /* --- 开关"亲密" --- */
      if (act === 'period-toggle-intimacy') {
        const date = el.dataset.date;
        const day = ensureDay(date);
        day.intimacy = !day.intimacy;
        setDay(date, { intimacy: day.intimacy });

        const toggle = el.closest('.period-toggle');
        if (toggle) toggle.classList.toggle('active', day.intimacy);

        // 更新日历格子小圆点（不影响 actual）
        const cell = document.querySelector(`.period-cell[data-date="${date}"]`);
        if (cell && !cell.classList.contains('actual')) {
          const d = getDay(date) || {};
          const hasNote = d.onPeriod || d.intimacy || d.flow ||
                          (d.symptoms && d.symptoms.length) ||
                          (d.mood && d.mood.length) || d.note;
          cell.classList.toggle('has-note', hasNote);
        }
        return true;
      }

      /* --- 流量 --- */
      if (act === 'period-pick-flow') {
        const date = el.dataset.date;
        const id = el.dataset.id;
        const cur = getDay(date) || {};
        const next = cur.flow === id ? null : id;
        setDay(date, { flow: next });
        document.querySelectorAll(`.flow-btn[data-date="${date}"]`).forEach(btn => {
          btn.classList.toggle('active', btn.dataset.id === next);
        });
        markCellHasNote(date);
        return true;
      }

      /* --- 症状 --- */
      if (act === 'period-pick-sym') {
        const date = el.dataset.date;
        const val = el.dataset.val;
        const cur = (getDay(date) || {}).symptoms || [];
        const next = cur.includes(val) ? cur.filter(x => x !== val) : cur.concat(val);
        setDay(date, { symptoms: next });
        markCellHasNote(date);
        el.classList.toggle('active');
        return true;
      }

      /* --- 心情 --- */
      if (act === 'period-pick-mood') {
        const date = el.dataset.date;
        const val = el.dataset.val;
        const cur = (getDay(date) || {}).mood || [];
        const next = cur.includes(val) ? cur.filter(x => x !== val) : cur.concat(val);
        setDay(date, { mood: next });
        markCellHasNote(date);
        el.classList.toggle('active');
        return true;
      }

      /* --- 备注 --- */
      if (act === 'period-note-blur') {
        const date = el.dataset.date;
        setDay(date, { note: el.value || '' });
        markCellHasNote(date);
        return true;
      }

      /* --- 亲密 Tab：范围切换 --- */
      if (act === 'intimacy-range') {
        intimacyRange = el.dataset.range;
        ctx.refresh();
        return true;
      }
      if (act === 'intimacy-prev' || act === 'intimacy-next') {
        const a = getIntimacyAnchor();
        const dir = act === 'intimacy-prev' ? -1 : 1;
        if (intimacyRange === 'week') a.setDate(a.getDate() + 7 * dir);
        else if (intimacyRange === 'month') a.setMonth(a.getMonth() + dir);
        else a.setFullYear(a.getFullYear() + dir);
        intimacyAnchor = a;
        ctx.refresh();
        return true;
      }
      if (act === 'intimacy-now') {
        intimacyAnchor = new Date();
        ctx.refresh();
        return true;
      }

      /* --- 历史加载更多 --- */
      if (act === 'period-more') {
        historyLimit += 20;
        ctx.refresh();
        return true;
      }

      /* --- 历史跳回日历 --- */
      if (act === 'period-goto-date') {
        const date = el.dataset.date;
        const d = parseDate(date);
        calYM = { year: d.getFullYear(), month: d.getMonth() };
        selectedDate = date;
        viewTab = 'calendar';
        ctx.refresh();
        return true;
      }

      return false;
    }
  });

  /* ============ 主页面 ============ */
  function renderPage() {
    const p = computePrediction();

    const head = `
      <div class="period-page-head">
        <span class="period-page-title">生理期</span>
      </div>`;

    const tabs = `
      <div class="tabs">
        <button class="tab ${viewTab === 'overview' ? 'active' : ''}" data-act="period-tab" data-tab="overview">概览</button>
        <button class="tab ${viewTab === 'calendar' ? 'active' : ''}" data-act="period-tab" data-tab="calendar">日历</button>
        <button class="tab ${viewTab === 'intimacy' ? 'active' : ''}" data-act="period-tab" data-tab="intimacy">亲密</button>
        <button class="tab ${viewTab === 'trend' ? 'active' : ''}" data-act="period-tab" data-tab="trend">趋势</button>
        <button class="tab ${viewTab === 'history' ? 'active' : ''}" data-act="period-tab" data-tab="history">历史</button>
      </div>`;

    let body = '';
    if (viewTab === 'overview') body = renderOverview(p);
    else if (viewTab === 'calendar') body = renderCalendar(p);
    else if (viewTab === 'intimacy') body = renderIntimacy();
    else if (viewTab === 'trend') body = renderTrend(p);
    else body = renderHistory();

    return `<div class="module period-module">
      ${head}
      ${tabs}
      ${body}
    </div>`;
  }

  /* ============ 概览 ============ */
  function renderOverview(p) {
    const stats = computeIntimacyStats();

    const intimacyBlock = `
      <div class="intimacy-overview">
        <div class="intimacy-ov-title">❤️ 亲密记录</div>
        <div class="intimacy-ov-row">
          <span class="intimacy-ov-item"><b>${stats.weekCount}</b><i>本周</i></span>
          <span class="intimacy-ov-item"><b>${stats.monthCount}</b><i>本月</i></span>
          <span class="intimacy-ov-item"><b>${stats.yearCount}</b><i>本年</i></span>
        </div>
        <div class="intimacy-ov-freq">
          平均每周 ${(stats.yearCount / stats.yearWeeks).toFixed(1)} 次
        </div>
        ${stats.last7 >= 2 ? `<div class="intimacy-ov-warn">⚠️ 最近 7 天已有 ${stats.last7} 次，注意身体哦</div>` : ''}
      </div>`;

    if (!p) {
      return `<div class="empty" data-emoji="🩸">
        还没有记录<br>
        <button class="btn btn-primary" data-act="period-tab" data-tab="calendar" style="margin-top:12px">去日历记录</button>
      </div>
      ${intimacyBlock}`;
    }

    const cycleText = p.avgCycle ? Math.round(p.avgCycle) + ' 天' : '—';
    const durText = p.avgDuration ? Math.round(p.avgDuration) + ' 天' : '—';
    const nextText = p.nextStart ? fmtDate(dateStr(p.nextStart)) : '—';
    const endText = p.nextEnd ? fmtDate(dateStr(p.nextEnd)) : '—';

    const warn = p.stdDev >= 7
      ? `<div class="period-warn">⚠️ 近期周期波动较大，预测仅供参考</div>` : '';

    return `
      <div class="period-hero">
        <div class="period-hero-label">${p.isOnPeriod ? '经期中' : '预计下次'}</div>
        <div class="period-hero-value">
          ${p.isOnPeriod
            ? '第 ' + p.periodDay + ' 天'
            : (p.daysToNext >= 0 ? p.daysToNext + ' 天后' : '已过 ' + (-p.daysToNext) + ' 天')}
        </div>
        <div class="period-hero-date">${nextText}${p.nextEnd ? ' ~ ' + endText : ''}</div>
      </div>

      ${warn}

      <div class="period-stats">
        <div class="period-stat">
          <span class="period-stat-label">平均周期</span>
          <span class="period-stat-value">${cycleText}</span>
        </div>
        <div class="period-stat">
          <span class="period-stat-label">平均持续</span>
          <span class="period-stat-value">${durText}</span>
        </div>
        <div class="period-stat">
          <span class="period-stat-label">上次开始</span>
          <span class="period-stat-value small">${fmtDate(dateStr(p.lastStart))}</span>
        </div>
      </div>

      ${intimacyBlock}

      <div class="period-tips">
        <div class="period-tips-title">预测说明</div>
        <div class="period-tips-item">· 基于最近 6 次周期加权平均</div>
        <div class="period-tips-item">· 越近的记录对预测影响越大</div>
        ${p.recentCycles.length < 3
          ? `<div class="period-tips-item warn">· 数据不足 3 次，继续记录会更准确</div>` : ''}
      </div>`;
  }

  /* ============ 日历 ============ */
  function getCalYM() {
    if (!calYM) {
      const n = new Date();
      calYM = { year: n.getFullYear(), month: n.getMonth() };
    }
    return calYM;
  }

  function renderCalendar(p) {
    const ym = getCalYM();
    const year = ym.year, month = ym.month;
    const firstDay = new Date(year, month, 1);
    const dim = new Date(year, month + 1, 0).getDate();
    const offset = (firstDay.getDay() + 6) % 7;
    const todayStr = U.todayStr();

    const days = getData().days;
    const actualDays = {};
    Object.keys(days).forEach(d => { if (days[d].onPeriod) actualDays[d] = true; });

    const predDays = {};
    if (p && p.nextStart && p.nextEnd) {
      let cur = p.nextStart;
      while (cur <= p.nextEnd) {
        predDays[dateStr(cur)] = true;
        cur = addDays(cur, 1);
      }
    }

    let cells = '';
    for (let i = 0; i < offset; i++) cells += `<div class="period-cell is-blank"></div>`;
    for (let d = 1; d <= dim; d++) {
      const ds = U.todayStr(new Date(year, month, d));
      const dayData = days[ds];
      let cls = 'period-cell';
      if (actualDays[ds]) cls += ' actual';
      else if (predDays[ds]) cls += ' predicted';
      else if (dayData && (
        dayData.onPeriod || dayData.intimacy ||
        (dayData.symptoms && dayData.symptoms.length) ||
        (dayData.mood && dayData.mood.length) ||
        dayData.flow || dayData.note
      )) {
        cls += ' has-note';
      }
      if (ds === todayStr) cls += ' today';
      if (ds === selectedDate) cls += ' selected';
      cells += `<div class="${cls}" data-act="period-day-click" data-date="${ds}">${d}</div>`;
    }

    const n = new Date();
    const isCurrent = n.getFullYear() === year && n.getMonth() === month;

    return `
      <div class="period-cal-head">
        <button class="sum-nav" data-act="period-cal-prev">‹</button>
        <span class="period-cal-title">${year}年${month + 1}月</span>
        <div class="period-cal-right">
          ${!isCurrent ? '<button class="sum-now" data-act="period-cal-now">回到本月</button>' : ''}
          <button class="sum-nav" data-act="period-cal-next">›</button>
        </div>
      </div>
      <div class="period-cal-card">
        <div class="period-cal-week">${['一','二','三','四','五','六','日'].map(w => `<span>${w}</span>`).join('')}</div>
        <div class="period-cal-body">${cells}</div>
      </div>
      <div class="period-cal-legend">
        <span><i class="dot actual"></i>经期</span>
        <span><i class="dot predicted"></i>预测</span>
        <span><i class="dot has-note"></i>有记录</span>
        <span><i class="dot today"></i>今天</span>
      </div>
      <div id="period-detail" class="${selectedDate ? '' : 'hidden'}">
        ${selectedDate ? renderDetailPanel(selectedDate) : ''}
      </div>`;
  }

  /* ============ 详情面板 ============ */
  function renderDetailPanel(date) {
    const day = getDay(date) || { onPeriod: false, intimacy: false, flow: null, symptoms: [], mood: [], note: '' };
    const onPeriod = !!day.onPeriod;
    const intimacy = !!day.intimacy;

    return `
      <div class="period-detail-head">
        <span class="period-detail-date">${fmtDateLong(date)}</span>
        <span class="period-detail-week">${['周日','周一','周二','周三','周四','周五','周六'][parseDate(date).getDay()]}</span>
      </div>

      <div class="period-toggle ${onPeriod ? 'active' : ''}"
        data-act="period-toggle-onperiod" data-date="${date}">
        <span class="period-toggle-label">来月经</span>
        <span class="period-toggle-switch"></span>
      </div>

      <div class="period-toggle heart ${intimacy ? 'active' : ''}"
        data-act="period-toggle-intimacy" data-date="${date}">
        <span class="period-toggle-label">❤️ 亲密</span>
        <span class="period-toggle-switch heart"></span>
      </div>

      <div id="period-detail-body">
        ${renderDetailBody(date)}
      </div>`;
  }

  function renderDetailBody(date) {
    const day = getDay(date) || { onPeriod: false, intimacy: false, flow: null, symptoms: [], mood: [], note: '' };
    const onPeriod = !!day.onPeriod;

    const flowRow = `
      <div class="period-detail-section flow-section" style="${onPeriod ? '' : 'display:none'}">
        <div class="period-detail-label">流量</div>
        <div class="flow-row">
          ${FLOWS.map(f => `
            <button class="flow-btn ${day.flow === f.id ? 'active' : ''}"
              data-act="period-pick-flow" data-date="${date}" data-id="${f.id}">
              <span class="flow-dots">${'💧'.repeat(f.dots)}</span>
              <span class="flow-name">${f.name}</span>
            </button>
          `).join('')}
        </div>
      </div>`;

    const symRow = `
      <div class="period-detail-section">
        <div class="period-detail-label">身体状态</div>
        <div class="p-picker">
          ${SYMPTOMS.map(x => `
            <button class="p-pick ${(day.symptoms || []).includes(x) ? 'active' : ''}"
              data-act="period-pick-sym" data-date="${date}" data-val="${U.escape(x)}">${U.escape(x)}</button>
          `).join('')}
        </div>
      </div>`;

    const moodRow = `
      <div class="period-detail-section">
        <div class="period-detail-label">精神状态</div>
        <div class="p-picker">
          ${MOODS.map(x => `
            <button class="p-pick mood ${(day.mood || []).includes(x) ? 'active' : ''}"
              data-act="period-pick-mood" data-date="${date}" data-val="${U.escape(x)}">${U.escape(x)}</button>
          `).join('')}
        </div>
      </div>`;

    const noteRow = `
      <div class="period-detail-section">
        <div class="period-detail-label">备注</div>
        <textarea class="period-note-input" rows="2"
          placeholder="想记点什么…"
          data-act="period-note-blur" data-date="${date}">${U.escape(day.note || '')}</textarea>
      </div>`;

    return flowRow + symRow + moodRow + noteRow;
  }

  /* ============ 亲密记录视图 ============ */
  function getIntimacyAnchor() {
    if (!intimacyAnchor) intimacyAnchor = new Date();
    return intimacyAnchor;
  }

  function fmtIntimacyLabel(anchor) {
    if (intimacyRange === 'week') {
      const monday = startOfWeek(anchor);
      const sunday = addDays(monday, 6);
      const f = d => (d.getMonth() + 1) + '/' + d.getDate();
      return f(monday) + ' - ' + f(sunday);
    }
    if (intimacyRange === 'month') {
      return anchor.getFullYear() + '年' + (anchor.getMonth() + 1) + '月';
    }
    return anchor.getFullYear() + '年';
  }

  function renderIntimacy() {
    const days = getData().days;
    const anchor = getIntimacyAnchor();
    const stats = computeIntimacyStats();

    const rangeSwitch = `
      <div class="tabs">
        <button class="tab ${intimacyRange === 'week' ? 'active' : ''}" data-act="intimacy-range" data-range="week">周</button>
        <button class="tab ${intimacyRange === 'month' ? 'active' : ''}" data-act="intimacy-range" data-range="month">月</button>
        <button class="tab ${intimacyRange === 'year' ? 'active' : ''}" data-act="intimacy-range" data-range="year">年</button>
      </div>`;

    const head = `
      <div class="period-cal-head">
        <button class="sum-nav" data-act="intimacy-prev">‹</button>
        <span class="period-cal-title">${fmtIntimacyLabel(anchor)}</span>
        <div class="period-cal-right">
          <button class="sum-now" data-act="intimacy-now">现在</button>
          <button class="sum-nav" data-act="intimacy-next">›</button>
        </div>
      </div>`;

    const warn = stats.last7 >= 2
      ? `<div class="intimacy-warn">⚠️ 最近 7 天已有 ${stats.last7} 次记录，注意身体哦</div>`
      : '';

    const statsCard = `
      <div class="intimacy-stats">
        <div class="intimacy-stat">
          <span class="intimacy-stat-label">本周</span>
          <span class="intimacy-stat-value">${stats.weekCount}<i>次</i></span>
        </div>
        <div class="intimacy-stat">
          <span class="intimacy-stat-label">本月</span>
          <span class="intimacy-stat-value">${stats.monthCount}<i>次</i></span>
        </div>
        <div class="intimacy-stat">
          <span class="intimacy-stat-label">本年</span>
          <span class="intimacy-stat-value">${stats.yearCount}<i>次</i></span>
        </div>
      </div>`;

    const freqCard = `
      <div class="intimacy-freq">
        📊 平均每周 ${(stats.yearCount / stats.yearWeeks).toFixed(1)} 次
        <span class="intimacy-freq-hint">（基于本年 ${stats.yearWeeks} 周）</span>
      </div>`;

    let body = '';
    if (intimacyRange === 'week') body = renderIntimacyWeek(anchor, days);
    else if (intimacyRange === 'month') body = renderIntimacyMonth(anchor, days);
    else body = renderIntimacyYear(anchor, days);

    return `${rangeSwitch}${head}${warn}${statsCard}${freqCard}
      <div class="intimacy-view-hint">点击日期可以直接切换亲密记录</div>
      ${body}`;
  }

  function renderIntimacyWeek(anchor, days) {
    const monday = startOfWeek(anchor);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = dateStr(today);
    const WEEK = ['一','二','三','四','五','六','日'];

    let cells = '';
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      const ds = dateStr(d);
      const on = !!(days[ds] && days[ds].intimacy);
      const isToday = ds === todayStr;
      const isFuture = ds > todayStr;
      let cls = 'intimacy-cell';
      if (on) cls += ' on';
      if (isToday) cls += ' today';
      if (isFuture) cls += ' future';
      cells += `<div class="${cls}" data-act="intimacy-cell-toggle" data-date="${ds}">
        <div class="intimacy-cell-wd">周${WEEK[i]}</div>
        <div class="intimacy-cell-day">${d.getDate()}</div>
        <div class="intimacy-cell-heart">${on ? '❤️' : ''}</div>
      </div>`;
    }

    return `<div class="intimacy-week-grid">${cells}</div>`;
  }

  function renderIntimacyMonth(anchor, days) {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const firstDay = new Date(year, month, 1);
    const dim = new Date(year, month + 1, 0).getDate();
    const offset = (firstDay.getDay() + 6) % 7;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = dateStr(today);

    let cells = '';
    for (let i = 0; i < offset; i++) cells += `<div class="intimacy-cell is-blank"></div>`;
    for (let d = 1; d <= dim; d++) {
      const ds = U.todayStr(new Date(year, month, d));
      const on = !!(days[ds] && days[ds].intimacy);
      const isToday = ds === todayStr;
      const isFuture = ds > todayStr;
      let cls = 'intimacy-cell';
      if (on) cls += ' on';
      if (isToday) cls += ' today';
      if (isFuture) cls += ' future';
      cells += `<div class="${cls}" data-act="intimacy-cell-toggle" data-date="${ds}">
        <div class="intimacy-cell-day">${d}</div>
        <div class="intimacy-cell-heart">${on ? '❤️' : ''}</div>
      </div>`;
    }

    return `<div class="intimacy-month-grid">
      <div class="intimacy-month-head">${['一','二','三','四','五','六','日'].map(w => `<span>${w}</span>`).join('')}</div>
      <div class="intimacy-month-body">${cells}</div>
    </div>`;
  }

  function renderIntimacyYear(anchor, days) {
    const year = anchor.getFullYear();
    const now = new Date();

    let cells = '';
    for (let m = 0; m < 12; m++) {
      const dim = new Date(year, m + 1, 0).getDate();
      let count = 0;
      for (let d = 1; d <= dim; d++) {
        const ds = U.todayStr(new Date(year, m, d));
        if (days[ds] && days[ds].intimacy) count++;
      }
      const isCurrent = (year === now.getFullYear() && m === now.getMonth());
      let cls = 'intimacy-year-cell';
      if (count > 0) cls += ' on';
      if (isCurrent) cls += ' current';
      cells += `<div class="${cls}">
        <div class="intimacy-year-m">${m + 1}月</div>
        <div class="intimacy-year-count">${count > 0 ? count + ' 次' : '—'}</div>
      </div>`;
    }

    return `<div class="intimacy-year-grid">${cells}</div>`;
  }

  /* ============ 局部更新 ============ */
  function handleDayClick(date) {
    selectedDate = (selectedDate === date) ? null : date;

    document.querySelectorAll('.period-cell').forEach(el => {
      el.classList.toggle('selected', el.dataset.date === selectedDate);
    });

    const detail = document.getElementById('period-detail');
    if (!detail) return;
    if (!selectedDate) {
      detail.classList.add('hidden');
      detail.innerHTML = '';
    } else {
      detail.classList.remove('hidden');
      detail.innerHTML = renderDetailPanel(selectedDate);
    }
  }

  function markCellHasNote(date) {
    const cell = document.querySelector(`.period-cell[data-date="${date}"]`);
    if (!cell) return;
    if (cell.classList.contains('actual')) return;
    const day = getDay(date) || {};
    const hasNote = day.onPeriod || day.intimacy || day.flow ||
                    (day.symptoms && day.symptoms.length) ||
                    (day.mood && day.mood.length) || day.note;
    cell.classList.toggle('has-note', hasNote);
  }

  /* ============ 趋势图 ============ */
  function renderTrend(p) {
    if (!p || !p.recentCycles.length) {
      return `<div class="empty" data-emoji="📈">
        至少需要 2 次完整周期才能画趋势<br>
        <button class="btn btn-primary" data-act="period-tab" data-tab="calendar" style="margin-top:12px">去日历记录</button>
      </div>`;
    }

    const W = 360, H = 200;
    const padL = 36, padR = 14, padT = 16, padB = 32;
    const cw = W - padL - padR, ch = H - padT - padB;

    const arr = p.recentCycles;
    let yMin = Math.min(...arr), yMax = Math.max(...arr);
    yMin = Math.floor(yMin - 2);
    yMax = Math.ceil(yMax + 2);
    if (yMax - yMin < 6) yMax = yMin + 6;

    const yScale = v => padT + ((yMax - v) / (yMax - yMin)) * ch;
    const xScale = i => arr.length === 1
      ? padL + cw / 2
      : padL + (i / (arr.length - 1)) * cw;

    let grid = '';
    for (let i = 0; i <= 4; i++) {
      const v = yMax - (yMax - yMin) * i / 4;
      const y = padT + ch * i / 4;
      grid += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#e8eef5" stroke-dasharray="3 4"/>`;
      grid += `<text x="${padL - 6}" y="${y + 3.5}" text-anchor="end" font-size="9" fill="#a8b3c1">${Math.round(v)}d</text>`;
    }

    const avgY = yScale(p.avgCycle);
    const avgLine = `
      <line x1="${padL}" y1="${avgY}" x2="${W - padR}" y2="${avgY}"
        stroke="#7c5cbf" stroke-width="1" stroke-dasharray="4 3" opacity="0.6"/>
      <text x="${W - padR - 2}" y="${avgY - 3}" text-anchor="end"
        font-size="9" fill="#7c5cbf">平均 ${Math.round(p.avgCycle)}d</text>`;

    const points = arr.map((v, i) => [xScale(i), yScale(v)]);
    const polyline = `<polyline points="${points.map(p => p.join(',')).join(' ')}"
      fill="none" stroke="#e88ea8" stroke-width="2.2"
      stroke-linecap="round" stroke-linejoin="round"/>`;

    let dots = '';
    arr.forEach((v, i) => {
      dots += `<circle cx="${xScale(i)}" cy="${yScale(v)}" r="4"
        fill="#e88ea8" stroke="#fff" stroke-width="2"/>`;
      dots += `<text x="${xScale(i)}" y="${yScale(v) - 8}"
        text-anchor="middle" font-size="9" font-weight="600"
        fill="#c96a88">${v}d</text>`;
    });

    return `
      <div class="period-trend-card">
        <div class="chart-title">
          <span>周期长度趋势</span>
          <span class="chart-unit">最近 ${arr.length} 次</span>
        </div>
        <svg viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="xMidYMid meet">
          ${grid}
          ${avgLine}
          ${polyline}
          ${dots}
        </svg>
        <div class="period-trend-summary">
          <span>平均 ${Math.round(p.avgCycle)} 天</span>
          <span>波动 ±${p.stdDev.toFixed(1)} 天</span>
        </div>
      </div>
      ${renderSymptomStats()}`;
  }

  function renderSymptomStats() {
    const days = getData().days;
    const symCount = {};
    const moodCount = {};
    Object.keys(days).forEach(d => {
      (days[d].symptoms || []).forEach(s => { symCount[s] = (symCount[s] || 0) + 1; });
      (days[d].mood || []).forEach(m => { moodCount[m] = (moodCount[m] || 0) + 1; });
    });

    function renderBars(map, title, cls) {
      const list = Object.keys(map).map(k => ({ name: k, count: map[k] }))
        .sort((a, b) => b.count - a.count);
      if (!list.length) return '';
      const max = list[0].count;
      const rows = list.slice(0, 8).map(x => `
        <div class="sym-row">
          <span class="sym-name">${U.escape(x.name)}</span>
          <div class="sym-bar"><i class="${cls}" style="width:${Math.round(x.count / max * 100)}%"></i></div>
          <span class="sym-count">${x.count}次</span>
        </div>`).join('');
      return `<div class="sym-card">
        <div class="sym-title">${title}</div>
        ${rows}
      </div>`;
    }

    const symHtml = renderBars(symCount, '常见身体症状', 'sym-fill');
    const moodHtml = renderBars(moodCount, '常见精神状态', 'mood-fill');

    if (!symHtml && !moodHtml) return '';
    return symHtml + moodHtml;
  }

  /* ============ 历史 ============ */
  function renderHistory() {
    const periods = aggregatePeriods().reverse();
    if (!periods.length) {
      return `<div class="empty" data-emoji="📋">
        还没有记录<br>
        <button class="btn btn-primary" data-act="period-tab" data-tab="calendar" style="margin-top:12px">去日历记录</button>
      </div>`;
    }

    const shown = periods.slice(0, historyLimit);
    const hasMore = periods.length > historyLimit;

    const items = shown.map((p, i) => {
      const idx = periods.length - i;
      const flow = FLOWS.find(f => f.id === p.flow);
      const flowDots = flow ? '💧'.repeat(flow.dots) : '';

      const symChips = (p.symptoms || []).slice(0, 5).map(s => `<span class="p-chip sym">${U.escape(s)}</span>`).join('');
      const moodChips = (p.mood || []).slice(0, 4).map(m => `<span class="p-chip mood">${U.escape(m)}</span>`).join('');

      return `<div class="period-item">
        <div class="period-item-head">
          <div>
            <span class="period-item-idx">第 ${idx} 次</span>
            <span class="period-item-date">${fmtDate(p.startDate)} — ${fmtDate(p.endDate)}</span>
          </div>
        </div>
        <div class="period-item-meta">
          <span>持续 ${p.duration} 天</span>
          ${flowDots ? `<span class="period-item-flow">${flowDots}</span>` : ''}
          <button class="period-item-goto" data-act="period-goto-date" data-date="${p.startDate}">查看 ›</button>
        </div>
        ${(symChips || moodChips) ? `<div class="period-chips">${symChips}${moodChips}</div>` : ''}
      </div>`;
    }).join('');

    return `<div class="period-list">${items}</div>
      ${hasMore ? `<button class="btn btn-ghost period-more" data-act="period-more">显示更多 · 还有 ${periods.length - historyLimit} 次</button>` : ''}`;
  }
})();