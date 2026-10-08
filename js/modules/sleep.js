let listLimit = 10;   // 列表默认显示条数
(function () {
  const KEY = 'sleep';
  let viewRange = 'week';   // week | month | year
  let anchorDate = null;

  /* =========================================================
     数据层
     ========================================================= */
  function getData() {
    const d = Store.ensure(KEY, () => ({ records: [] }));
    if (!Array.isArray(d.records)) d.records = [];
    return d;
  }

  function dateStr(d) {
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate());
  }
  function parseDate(s) {
    const p = String(s).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function getAnchor() {
    if (!anchorDate) anchorDate = new Date();
    return anchorDate;
  }

  /* =========================================================
     时间处理
     所有时间点都转成"从 18:00 起算的小时数"
     23:30 → 5.5    07:00 → 13    12:00(午) → 18
     ========================================================= */
  function timeToHours(t) {
    if (!t) return null;
    const parts = String(t).split(':');
    let h = (+parts[0] || 0) + (+parts[1] || 0) / 60;
    if (h < 18) h += 24;
    return h - 18;
  }
  function hoursToTime(h) {
    let total = h + 18;
    total = ((total % 24) + 24) % 24;
    const hh = Math.floor(total);
    const mm = Math.round((total - hh) * 60);
    return U.pad(hh) + ':' + U.pad(mm);
  }
  // 计算时间差（小时）
  function durationHours(start, end) {
    if (!start || !end) return null;
    const s = timeToHours(start);
    const e = timeToHours(end);
    if (s == null || e == null) return null;
    // 醒来时间在入睡时间之后（从 18:00 起算的坐标系里）
    return e > s ? e - s : (e + 24) - s;
  }
  function fmtDuration(h) {
    if (h == null || isNaN(h)) return '—';
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return hh + 'h' + (mm ? mm + 'm' : '');
  }

  /* =========================================================
     范围计算
     ========================================================= */
  function getRange(range, anchor) {
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
    if (range === 'month') {
      const start = new Date(d.getFullYear(), d.getMonth(), 1);
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      return { start, end };
    }
    const y = d.getFullYear();
    return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59) };
  }

  function fmtRangeLabel(range) {
    const s = range.start, e = range.end;
    const f = d => (d.getMonth() + 1) + '/' + d.getDate();
    if (viewRange === 'year') return s.getFullYear() + ' 年';
    if (viewRange === 'week') return f(s) + ' - ' + f(e);
    return s.getFullYear() + '/' + f(s) + ' - ' + f(e);
  }

  function recordsInRange(range) {
    const s = dateStr(range.start);
    const e = dateStr(range.end);
    return getData().records
      .filter(r => r.date >= s && r.date <= e)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /* =========================================================
     图表：入睡/醒来的柱状 + 折线对比
     ========================================================= */
  function buildSleepChart(series) {
    const W = 360, H = 230;
    const padL = 46, padR = 14, padT = 20, padB = 36;
    const cw = W - padL - padR;
    const ch = H - padT - padB;

    if (!series.length) {
      return `<svg viewBox="0 0 ${W} ${H}" class="chart sleep-chart" preserveAspectRatio="xMidYMid meet">
        <text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="#b8c0cc" font-size="13">暂无睡眠数据</text>
      </svg>`;
    }

    // Y 轴范围
    let minH = Infinity, maxH = -Infinity;
    series.forEach(s => {
      const sh = timeToHours(s.sleepTime);
      const wh = timeToHours(s.wakeTime);
      if (sh != null) { minH = Math.min(minH, sh); maxH = Math.max(maxH, sh); }
      if (wh != null) { minH = Math.min(minH, wh); maxH = Math.max(maxH, wh); }
    });

    // 计划线：23:00（= 从 18:00 起算 5 小时）
    const planHour = 23;
    const planH = timeToHours(U.pad(planHour) + ':00');
    minH = Math.min(minH, planH);
    maxH = Math.max(maxH, planH);

    if (!isFinite(minH)) { minH = 4; maxH = 14; }
    minH = Math.floor(minH - 1);
    maxH = Math.ceil(maxH + 1);
    if (maxH - minH < 6) maxH = minH + 6;

  const yScale = h => padT + ((maxH - h) / (maxH - minH)) * ch;
    const xScale = i => series.length === 1
      ? padL + cw / 2
      : padL + (i / (series.length - 1)) * cw;

    // 网格 + Y 轴刻度
    let grid = '';
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const hVal = maxH - (maxH - minH) * i / steps;
      const y = padT + ch * i / steps;
      grid += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}"
        stroke="#e8eef5" stroke-dasharray="3 4"/>`;
      grid += `<text x="${padL - 6}" y="${y + 3.5}" text-anchor="end"
        font-size="9" fill="#a8b3c1">${hoursToTime(hVal)}</text>`;
    }

    // 23:00 计划红线
    const planY = yScale(planH);
    const planLine = `
      <line x1="${padL}" y1="${planY}" x2="${W - padR}" y2="${planY}"
        stroke="#e35d5d" stroke-width="1.4" stroke-dasharray="5 3" opacity="0.8"/>
      <rect x="${padL + 2}" y="${planY - 14}" width="62" height="14"
        rx="4" fill="#e35d5d" opacity="0.94"/>
      <text x="${padL + 6}" y="${planY - 4}"
        font-size="9" fill="#fff" font-weight="600">23:00 计划</text>
    `;

    // 每日柱子：三档颜色
    //   < 6h      深红
    //   6h ~ <7h  橙
    //   >= 7h     绿
    const barW = Math.max(10, Math.min(26, cw / series.length * 0.55));
    let bars = '';
    series.forEach((s, i) => {
      const sh = timeToHours(s.sleepTime);
      const wh = timeToHours(s.wakeTime);
      if (sh == null || wh == null) return;
      const y1 = yScale(sh);
      const y2 = yScale(wh);
      const x = xScale(i) - barW / 2;
      const y = Math.min(y1, y2);
      const h = Math.max(3, Math.abs(y2 - y1));

      // 时长：优先手环总睡眠，否则用入睡→醒来差值
      const dur = (s.totalSleep != null && isFinite(s.totalSleep))
        ? s.totalSleep
        : durationHours(s.sleepTime, s.wakeTime);

      let gradId;
      if (dur == null) gradId = 'sleepBarGreen';
      else if (dur < 6) gradId = 'sleepBarDeepRed';
      else if (dur < 7) gradId = 'sleepBarOrange';
      else gradId = 'sleepBarGreen';

            bars += `<rect x="${x}" y="${y}" width="${barW}" height="${h}"
        rx="4" fill="url(#${gradId})"/>`;

      // 柱体上显示时长
      if (dur != null && h >= 22) {
        let durText = '';
        if (barW >= 22) {
          const hh = Math.floor(dur);
          const mm = Math.round((dur - hh) * 60);
          durText = hh + 'h' + (mm ? String(mm).padStart(2, '0') : '');
        } else if (barW >= 14) {
          durText = Math.round(dur) + 'h';
        }
        if (durText) {
          bars += `<text x="${xScale(i)}" y="${y + h / 2 + 3.5}"
            text-anchor="middle" font-size="9" font-weight="700"
            fill="#ffffff"
            style="paint-order: stroke; stroke: rgba(0,0,0,0.32); stroke-width: 2.5px;"
            >${durText}</text>`;
        }
      }
    });

    // 折线（入睡 + 醒来）
    const sleepPts = [];
    const wakePts = [];
    series.forEach((s, i) => {
      const sh = timeToHours(s.sleepTime);
      const wh = timeToHours(s.wakeTime);
      if (sh != null) sleepPts.push([xScale(i), yScale(sh)]);
      if (wh != null) wakePts.push([xScale(i), yScale(wh)]);
    });
    let lines = '';
    if (sleepPts.length > 1) {
      lines += `<polyline points="${sleepPts.map(p => p.join(',')).join(' ')}"
        fill="none" stroke="#7c5cbf" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`;
    }
    if (wakePts.length > 1) {
      lines += `<polyline points="${wakePts.map(p => p.join(',')).join(' ')}"
        fill="none" stroke="#f0a020" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`;
    }

    // 数据点
    let dots = '';
    series.forEach((s, i) => {
      const sh = timeToHours(s.sleepTime);
      const wh = timeToHours(s.wakeTime);
      if (sh != null) dots += `<circle cx="${xScale(i)}" cy="${yScale(sh)}" r="3.2"
        fill="#7c5cbf" stroke="#fff" stroke-width="1.5"/>`;
      if (wh != null) dots += `<circle cx="${xScale(i)}" cy="${yScale(wh)}" r="3.2"
        fill="#f0a020" stroke="#fff" stroke-width="1.5"/>`;
    });

    // X 轴标签
    let xLabels = '';
    const maxLabels = 7;
    const step = Math.max(1, Math.ceil(series.length / maxLabels));
    series.forEach((s, i) => {
      if (i % step !== 0 && i !== series.length - 1) return;
      xLabels += `<text x="${xScale(i)}" y="${H - 12}" text-anchor="middle"
        font-size="9" fill="#a8b3c1">${U.escape(s.label)}</text>`;
    });

    return `<svg viewBox="0 0 ${W} ${H}" class="chart sleep-chart" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="sleepBarGreen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#6fce9e" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="#b8ead0" stop-opacity="0.3"/>
        </linearGradient>
        <linearGradient id="sleepBarOrange" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#e8a33d" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="#fad9a3" stop-opacity="0.3"/>
        </linearGradient>
        <linearGradient id="sleepBarDeepRed" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#d96a6a" stop-opacity="0.95"/>
          <stop offset="100%" stop-color="#f0b8b8" stop-opacity="0.35"/>
        </linearGradient>
      </defs>
      ${grid}
      ${planLine}
      ${bars}
      ${lines}
      ${dots}
      ${xLabels}
    </svg>`;
  }
  /* =========================================================
     序列化（跨天/跨范围）
     ========================================================= */
  function buildSeries() {
    const range = getRange(viewRange, getAnchor());
    const recs = recordsInRange(range);
    return recs.map(r => ({
      date: r.date,
      label: (() => {
        const d = parseDate(r.date);
        return (d.getMonth() + 1) + '/' + d.getDate();
      })(),
      sleepTime: r.sleepTime,
      wakeTime: r.wakeTime,
      raw: r
    }));
  }

  /* =========================================================
     统计
     ========================================================= */
  function computeStats(recs) {
    const sleepRecs = recs.filter(r => r.sleepTime && r.wakeTime);
    if (!sleepRecs.length) return null;

    let sumSleepH = 0, sumWakeH = 0, sumDuration = 0;
    sleepRecs.forEach(r => {
      sumSleepH += timeToHours(r.sleepTime);
      sumWakeH  += timeToHours(r.wakeTime);
      sumDuration += durationHours(r.sleepTime, r.wakeTime);
    });
    const n = sleepRecs.length;

    // 手环数据汇总
    const withTotal = recs.filter(r => r.totalSleep != null);
    const avgTotal = withTotal.length
      ? withTotal.reduce((s, r) => s + r.totalSleep, 0) / withTotal.length
      : sumDuration / n;

    const withDeep = recs.filter(r => r.deepSleep != null);
    const avgDeep = withDeep.length
      ? withDeep.reduce((s, r) => s + r.deepSleep, 0) / withDeep.length : null;

    const withRem = recs.filter(r => r.remSleep != null);
    const avgRem = withRem.length
      ? withRem.reduce((s, r) => s + r.remSleep, 0) / withRem.length : null;

    // 平均入睡/醒来时间：用"循环均值"处理跨午夜
    // 简单处理：直接算算术平均（18:00 起算坐标系里天然不会跨 0）
    return {
      count: n,
      avgSleep: hoursToTime(sumSleepH / n),
      avgWake:  hoursToTime(sumWakeH / n),
      avgDuration: avgTotal,
      avgDeep,
      avgRem,
      avgSleepH: sumSleepH / n,
      avgWakeH: sumWakeH / n
    };
  }

  /* =========================================================
     注册模块
     ========================================================= */
  Registry.register({
    id: 'sleep',
    name: '睡眠记录',
    icon: '🌙',
    order: 25,
    storageKey: KEY,

    homeCard() {
      const today = U.todayStr();
      const all = getData().records;
      if (!all.length) {
        return `<div class="card">
          <div class="card-head">
            <span class="card-icon">🌙</span>
            <span class="card-title">睡眠记录</span>
            <a class="card-more" href="#sleep">记录 ›</a>
          </div>
          <div class="card-empty">还没有记录，点击右上角开始</div>
        </div>`;
      }

      // 最近一条记录（按日期倒序）
      const sorted = all.slice().sort((a, b) => b.date.localeCompare(a.date));
      const latest = sorted[0];
      const isToday = latest.date === today;
      const dur = durationHours(latest.sleepTime, latest.wakeTime);

      // 近 7 天平均睡眠时长
      const last7 = all.filter(r => {
        const d = parseDate(r.date);
        const diff = (new Date() - d) / 86400000;
        return diff <= 7 && r.totalSleep != null;
      });
      const avg7 = last7.length
        ? last7.reduce((s, r) => s + r.totalSleep, 0) / last7.length : null;

      return `<div class="card">
        <div class="card-head">
          <span class="card-icon">🌙</span>
          <span class="card-title">睡眠记录</span>
          <span class="card-sub">${isToday ? '昨晚' : U.formatDate(latest.date)}</span>
          <a class="card-more" href="#sleep">详情 ›</a>
        </div>
        <div class="sleep-home-body">
          <div class="sleep-home-row">
            <span class="sleep-home-time">${U.escape(latest.sleepTime || '—')}</span>
            <span class="sleep-home-arrow">→</span>
            <span class="sleep-home-time">${U.escape(latest.wakeTime || '—')}</span>
            ${dur != null ? `<span class="sleep-home-dur">${fmtDuration(dur)}</span>` : ''}
          </div>
          ${avg7 != null ? `<div class="sleep-home-sub">近 7 天平均 <b>${avg7.toFixed(1)}h</b></div>` : ''}
          ${latest.napStart && latest.napEnd ? `<div class="sleep-home-nap">😴 午休 ${U.escape(latest.napStart)}-${U.escape(latest.napEnd)}</div>` : ''}
        </div>
      </div>`;
    },

    page() { return renderPage(); },

    handleAction(act, el, ctx) {
      /* 范围切换 */
      if (act === 'sleep-range') {
        viewRange = el.dataset.range;
        listLimit = 10;
        ctx.refresh();
        return true;
      }
            /* 加载更多 */
      if (act === 'sleep-load-more') {
        listLimit += 20;
        ctx.refresh();
        return true;
      }
      /* 前后翻页 */
      if (act === 'sleep-prev' || act === 'sleep-next') {
        const dir = act === 'sleep-prev' ? -1 : 1;
        const a = getAnchor();
        if (viewRange === 'week') a.setDate(a.getDate() + 7 * dir);
        else if (viewRange === 'month') a.setMonth(a.getMonth() + dir);
        else a.setFullYear(a.getFullYear() + dir);
        anchorDate = a;
        listLimit = 10;
        ctx.refresh();
        return true;
      }
      if (act === 'sleep-now') {
        anchorDate = new Date();
        listLimit = 10;
        ctx.refresh();
        return true;
      }
      /* 新增 */
      if (act === 'sleep-add') { openForm(null); return true; }
      if (act === 'sleep-edit') {
        const rec = getData().records.find(r => r.id === el.dataset.id);
        if (rec) openForm(rec);
        return true;
      }
      if (act === 'sleep-del') {
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
      return false;
    }
  });

  /* =========================================================
     页面
     ========================================================= */
  function renderPage() {
    const range = getRange(viewRange, getAnchor());
    const recs = recordsInRange(range);
const series = recs.map(r => ({
  date: r.date,
  label: (() => {
    const d = parseDate(r.date);
    return (d.getMonth() + 1) + '/' + d.getDate();
  })(),
  sleepTime: r.sleepTime,
  wakeTime: r.wakeTime,
  totalSleep: r.totalSleep
}));

    const rangeSwitcher = `
      <div class="tabs">
        <button class="tab ${viewRange === 'week' ? 'active' : ''}" data-act="sleep-range" data-range="week">周</button>
        <button class="tab ${viewRange === 'month' ? 'active' : ''}" data-act="sleep-range" data-range="month">月</button>
        <button class="tab ${viewRange === 'year' ? 'active' : ''}" data-act="sleep-range" data-range="year">年</button>
      </div>`;

    const head = `
      <div class="sleep-range-head">
        <button class="sum-nav" data-act="sleep-prev">‹</button>
        <span class="sleep-range-title">${fmtRangeLabel(range)}</span>
        <div class="sleep-range-right">
          <button class="sum-now" data-act="sleep-now">现在</button>
          <button class="sum-nav" data-act="sleep-next">›</button>
        </div>
      </div>`;

const chart = `
  <div class="chart-card sleep-chart-card">
    <div class="chart-title">
      <span>入睡 / 醒来时间</span>
      <span class="sleep-legend">
        <i class="dot-sleep"></i>入睡
        <i class="dot-wake"></i>醒来
      </span>
    </div>
    ${buildSleepChart(series)}
    <div class="sleep-chart-hint">
      柱 = 整晚睡眠段 · 线 = 每日入睡/醒来时间
    </div>
    <div class="sleep-chart-hint sleep-chart-legend">
      <span><i class="hint-dot green"></i>7h 及以上</span>
      <span><i class="hint-dot orange"></i>6~7h</span>
      <span><i class="hint-dot deepred"></i>少于 6h</span>
      <span><i class="hint-dash"></i>23:00 计划</span>
    </div>
  </div>`;

    const stats = renderStats(recs);
    const list = renderList(recs);

    return `<div class="module sleep-module">
      ${rangeSwitcher}
      ${head}
      ${chart}
      ${stats}
      ${list}
      <button class="fab" data-act="sleep-add" aria-label="新增睡眠记录">+</button>
    </div>`;
  }

  /* =========================================================
     统计卡
     ========================================================= */
  function renderStats(recs) {
    const s = computeStats(recs);
    if (!s) return '';

    const cards = [
      { label: '平均入睡', value: s.avgSleep },
      { label: '平均醒来', value: s.avgWake },
      { label: '平均时长', value: s.avgDuration != null ? s.avgDuration.toFixed(1) + 'h' : '—' }
    ];

    const more = [];
    if (s.avgDeep != null) more.push(`深睡 ${s.avgDeep.toFixed(1)}h`);
    if (s.avgRem  != null) more.push(`REM ${s.avgRem.toFixed(1)}h`);

    return `<div class="sleep-stats">
      ${cards.map(c => `
        <div class="sleep-stat">
          <span class="sleep-stat-label">${c.label}</span>
          <span class="sleep-stat-value">${c.value}</span>
        </div>
      `).join('')}
      ${more.length ? `<div class="sleep-stats-more">${more.join(' · ')}</div>` : ''}
    </div>`;
  }

  /* =========================================================
     记录列表
     ========================================================= */
  function renderList(recs) {
    if (!recs.length) {
      return `<div class="empty" data-emoji="🌙">
        这段时间还没有记录<br>
        <button class="btn btn-primary" data-act="sleep-add" style="margin-top:12px">+ 记录睡眠</button>
      </div>`;
    }

    // 倒序：最新在上
    const sorted = recs.slice().sort((a, b) => b.date.localeCompare(a.date));
    const shown = sorted.slice(0, listLimit);
    const hasMore = sorted.length > listLimit;
    const remain = sorted.length - listLimit;

    let html = `<div class="sleep-list">
      ${shown.map(r => renderItem(r)).join('')}
    </div>`;

    if (hasMore) {
      html += `<button class="btn btn-ghost sleep-load-more" data-act="sleep-load-more">
        显示更多 · 还有 ${remain} 条
      </button>`;
    }

    return html;
  }

  function renderItem(r) {
    const dur = durationHours(r.sleepTime, r.wakeTime);
    const d = parseDate(r.date);
    const today = U.todayStr();
    const dateLabel = r.date === today ? '今天'
      : (U.formatDate(r.date) + ' · ' + U.weekday(d));

    // 手环数据徽章
    const chips = [];
    if (r.totalSleep != null) chips.push(`总 ${r.totalSleep.toFixed(1)}h`);
    if (r.deepSleep != null)  chips.push(`深睡 ${r.deepSleep.toFixed(1)}h`);
    if (r.lightSleep != null) chips.push(`浅睡 ${r.lightSleep.toFixed(1)}h`);
    if (r.remSleep != null)   chips.push(`REM ${r.remSleep.toFixed(1)}h`);
    if (r.awakeCount != null) chips.push(`醒 ${r.awakeCount}次`);
    if (r.awakeTime != null)  chips.push(`清醒 ${r.awakeTime}分`);

    // 午休
    let napHtml = '';
    if (r.napStart && r.napEnd) {
      const nd = durationHours(r.napStart, r.napEnd);
      napHtml = `<div class="sleep-nap">
        😴 午休 ${U.escape(r.napStart)} - ${U.escape(r.napEnd)}
        ${nd != null ? `<span class="sleep-nap-dur">${fmtDuration(nd)}</span>` : ''}
      </div>`;
    }

    return `<div class="sleep-item">
      <div class="sleep-item-head">
        <span class="sleep-item-date">${dateLabel}</span>
        <button class="sleep-item-menu" data-act="sleep-edit" data-id="${r.id}">⋯</button>
      </div>
      <div class="sleep-item-main">
        <span class="sleep-time">${U.escape(r.sleepTime || '—')}</span>
        <span class="sleep-arrow">→</span>
        <span class="sleep-time">${U.escape(r.wakeTime || '—')}</span>
        ${dur != null ? `<span class="sleep-dur">${fmtDuration(dur)}</span>` : ''}
      </div>
      ${chips.length ? `<div class="sleep-chips">${chips.map(c => `<span class="sleep-chip">${c}</span>`).join('')}</div>` : ''}
      ${napHtml}
    </div>`;
  }

  /* =========================================================
     表单
     ========================================================= */
  function openForm(editing) {
    const fields = [
      { name: 'date',      label: '日期（起床日）', type: 'date',
        value: editing ? editing.date : U.todayStr(), required: true },
      { name: 'sleepTime', label: '入睡时间', type: 'time',
        value: editing ? editing.sleepTime : '23:00', required: true },
      { name: 'wakeTime',  label: '醒来时间', type: 'time',
        value: editing ? editing.wakeTime : '07:00', required: true },

      { name: 'totalSleep', label: '总睡眠（小时，可留空）', type: 'number',
        value: editing && editing.totalSleep != null ? editing.totalSleep : '' },
      { name: 'deepSleep',  label: '深度睡眠（小时）', type: 'number',
        value: editing && editing.deepSleep != null ? editing.deepSleep : '' },
      { name: 'lightSleep', label: '浅度睡眠（小时）', type: 'number',
        value: editing && editing.lightSleep != null ? editing.lightSleep : '' },
      { name: 'remSleep',   label: '快速眼动（小时）', type: 'number',
        value: editing && editing.remSleep != null ? editing.remSleep : '' },
      { name: 'awakeCount', label: '清醒次数', type: 'number',
        value: editing && editing.awakeCount != null ? editing.awakeCount : '' },
      { name: 'awakeTime',  label: '总清醒（分钟）', type: 'number',
        value: editing && editing.awakeTime != null ? editing.awakeTime : '' },

      { name: 'napStart', label: '午休开始（可留空）', type: 'time',
        value: editing ? (editing.napStart || '') : '' },
      { name: 'napEnd',   label: '午休结束（可留空）', type: 'time',
        value: editing ? (editing.napEnd || '') : '' },

      { name: 'note', label: '备注（可选）', type: 'textarea',
        value: editing ? (editing.note || '') : '' }
    ];

    UI.form(editing ? '编辑睡眠记录' : '记录睡眠', fields).then(r => {
      if (!r) return;
      if (!r.date) { UI.toast('请选择日期'); return; }
      if (!r.sleepTime || !r.wakeTime) { UI.toast('请填写入睡和醒来时间'); return; }

      const num = v => (v === '' || v == null || v === '') ? null : Number(v);
      const payload = {
        date: r.date,
        sleepTime: r.sleepTime,
        wakeTime: r.wakeTime,
        totalSleep: num(r.totalSleep),
        deepSleep:  num(r.deepSleep),
        lightSleep: num(r.lightSleep),
        remSleep:   num(r.remSleep),
        awakeCount: num(r.awakeCount),
        awakeTime:  num(r.awakeTime),
        napStart: r.napStart || null,
        napEnd:   r.napEnd || null,
        note: (r.note || '').trim()
      };

      Store.update(KEY, d => {
        if (editing) {
          const t = d.records.find(x => x.id === editing.id);
          if (t) Object.assign(t, payload);
        } else {
          // 同一天只保留一条记录：如果已有则覆盖提示
          const dup = d.records.find(x => x.date === payload.date);
          if (dup) {
            Object.assign(dup, payload);
          } else {
            d.records.push({ id: U.uid('s'), ...payload, createdAt: Date.now() });
          }
        }
        return d;
      });
      UI.toast(editing ? '已更新' : '已记录');
    });
  }
})();