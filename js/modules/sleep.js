(function () {
  const KEY = 'sleep';
  let viewRange = 'week';
  let anchorDate = null;
  let listLimit = 10;
  let chartView = 'sleep'; // sleep | awake

  /* =========================================================
     数据层
     ========================================================= */
  function getData() {
    const d = Store.ensure(KEY, () => ({ records: [] }));
    if (!Array.isArray(d.records)) d.records = [];
    // 兼容旧数据：如果是小数且小于24，说明是小时，转换为分钟
    let migrated = false;
    d.records.forEach(r => {
      if (r.deepSleep != null && r.deepSleep < 24 && !Number.isInteger(r.deepSleep)) {
        r.deepSleep = Math.round(r.deepSleep * 60); migrated = true;
      }
      if (r.lightSleep != null && r.lightSleep < 24 && !Number.isInteger(r.lightSleep)) {
        r.lightSleep = Math.round(r.lightSleep * 60); migrated = true;
      }
      if (r.remSleep != null && r.remSleep < 24 && !Number.isInteger(r.remSleep)) {
        r.remSleep = Math.round(r.remSleep * 60); migrated = true;
      }
    });
    if (migrated) {
      const updater = Store.updateSilent || Store.update;
      updater.call(Store, KEY, data => { data.records = d.records; return data; });
    }
    return d;
  }

  /* =========================================================
     时间计算与格式化
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
  function durationHours(start, end) {
    if (!start || !end) return null;
    const s = timeToHours(start);
    const e = timeToHours(end);
    if (s == null || e == null) return null;
    return e > s ? e - s : (e + 24) - s;
  }
  
  // 🌟 核心逻辑：总睡眠 = 醒来-入睡总跨度 - 清醒时长
  function calcTotalSleepMins(r) {
    const durH = durationHours(r.sleepTime, r.wakeTime);
    if (durH == null) return null;
    const totalMins = Math.round(durH * 60);
    const awake = Number(r.awakeTime) || 0;
    return Math.max(0, totalMins - awake);
  }

  function fmtDuration(h) {
    if (h == null || isNaN(h)) return '—';
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return hh + 'h' + (mm ? mm + 'm' : '');
  }
  
  function fmtDurationMins(mins) {
    if (mins == null || mins <= 0) return '';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h === 0) return m + '分钟';
    if (m === 0) return h + '小时';
    return h + '小时' + m + '分';
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

  function recordsInRange(range) {
    const s = dateStr(range.start);
    const e = dateStr(range.end);
    return getData().records
      .filter(r => r.date >= s && r.date <= e)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /* =========================================================
     图表：入睡/醒来时间及总睡眠
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

    let minH = Infinity, maxH = -Infinity;
    series.forEach(s => {
      const sh = timeToHours(s.sleepTime);
      const wh = timeToHours(s.wakeTime);
      if (sh != null) { minH = Math.min(minH, sh); maxH = Math.max(maxH, sh); }
      if (wh != null) { minH = Math.min(minH, wh); maxH = Math.max(maxH, wh); }
    });

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

    const planY = yScale(planH);
    const planLine = `
      <line x1="${padL}" y1="${planY}" x2="${W - padR}" y2="${planY}"
        stroke="#e35d5d" stroke-width="1.4" stroke-dasharray="5 3" opacity="0.8"/>
      <rect x="${padL + 2}" y="${planY - 14}" width="62" height="14"
        rx="4" fill="#e35d5d" opacity="0.94"/>
      <text x="${padL + 6}" y="${planY - 4}"
        font-size="9" fill="#fff" font-weight="600">23:00 计划</text>
    `;

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

      // 使用新逻辑计算总睡眠分钟数
      const totalMins = calcTotalSleepMins(s);
      let gradId = 'sleepBarGreen';
      if (totalMins != null) {
        if (totalMins < 360) gradId = 'sleepBarDeepRed';
        else if (totalMins < 420) gradId = 'sleepBarOrange';
      }

      bars += `<rect x="${x}" y="${y}" width="${barW}" height="${h}"
        rx="4" fill="url(#${gradId})"/>`;

      // 柱体上显示时长
      if (totalMins != null && h >= 22) {
        let durText = '';
        if (barW >= 22) {
          const hh = Math.floor(totalMins / 60);
          const mm = totalMins % 60;
          durText = hh + 'h' + (mm ? String(mm).padStart(2, '0') : '');
        } else if (barW >= 14) {
          durText = Math.round(totalMins / 60) + 'h';
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

    let dots = '';
    series.forEach((s, i) => {
      const sh = timeToHours(s.sleepTime);
      const wh = timeToHours(s.wakeTime);
      if (sh != null) dots += `<circle cx="${xScale(i)}" cy="${yScale(sh)}" r="3.2"
        fill="#7c5cbf" stroke="#fff" stroke-width="1.5"/>`;
      if (wh != null) dots += `<circle cx="${xScale(i)}" cy="${yScale(wh)}" r="3.2"
        fill="#f0a020" stroke="#fff" stroke-width="1.5"/>`;
    });

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
     清醒图表
     ========================================================= */
  function buildAwakeBarChart(series) {
    const W = 360, H = 180;
    const padL = 46, padR = 14, padT = 18, padB = 32;
    const cw = W - padL - padR;
    const ch = H - padT - padB;

    const valid = series.filter(s => s.awakeTime != null && s.awakeTime >= 0);

    if (!valid.length) {
      return `<svg viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="xMidYMid meet">
        <text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="#b8c0cc" font-size="13">暂无清醒时长数据</text>
      </svg>`;
    }

    let maxVal = Math.max(1, ...valid.map(s => s.awakeTime));
    maxVal = Math.max(10, Math.ceil(maxVal / 10) * 10);

    const yScale = v => padT + ((maxVal - v) / maxVal) * ch;

    let grid = '';
    for (let i = 0; i <= 4; i++) {
      const v = maxVal - (maxVal / 4) * i;
      const y = padT + ch * i / 4;
      grid += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#e8eef5" stroke-dasharray="3 4"/>`;
      grid += `<text x="${padL - 6}" y="${y + 3.5}" text-anchor="end" font-size="9" fill="#a8b3c1">${Math.round(v)}分</text>`;
    }

    const colW = cw / series.length;
    const barW = Math.max(8, Math.min(28, colW * 0.55));
    const maxLabels = 7;
    const step = Math.max(1, Math.ceil(series.length / maxLabels));

    let bars = '';
    let xLabels = '';

    series.forEach((s, i) => {
      const cx = padL + colW * (i + 0.5);
      if (s.awakeTime != null && s.awakeTime > 0) {
        const h = (s.awakeTime / maxVal) * ch;
        const y = padT + ch - h;
        bars += `<rect x="${cx - barW / 2}" y="${y}" width="${barW}" height="${h}" rx="3"
          fill="url(#awakeBarGrad)"/>`;
        bars += `<text x="${cx}" y="${y - 3}" text-anchor="middle"
          font-size="9" font-weight="600" fill="#b8760a">${s.awakeTime}</text>`;
      }
      if (i % step === 0 || i === series.length - 1) {
        xLabels += `<text x="${cx}" y="${H - 10}" text-anchor="middle"
          font-size="9" fill="#a8b3c1">${U.escape(s.label)}</text>`;
      }
    });

    return `<svg viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="awakeBarGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f0a020" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="#fad9a3" stop-opacity="0.35"/>
        </linearGradient>
      </defs>
      ${grid}
      <line x1="${padL}" y1="${padT + ch}" x2="${W - padR}" y2="${padT + ch}" stroke="#d8dce1" stroke-width="1"/>
      ${bars}
      ${xLabels}
    </svg>`;
  }

  function buildAwakeLineChart(series) {
    const W = 360, H = 180;
    const padL = 46, padR = 14, padT = 18, padB = 32;
    const cw = W - padL - padR;
    const ch = H - padT - padB;

    const valid = series.filter(s => s.awakeCount != null);

    if (!valid.length) {
      return `<svg viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="xMidYMid meet">
        <text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="#b8c0cc" font-size="13">暂无清醒次数数据</text>
      </svg>`;
    }

    let maxVal = Math.max(1, ...valid.map(s => s.awakeCount));
    maxVal = Math.max(2, Math.ceil(maxVal));

    const yScale = v => padT + ((maxVal - v) / maxVal) * ch;
    const xScale = i => series.length === 1
      ? padL + cw / 2
      : padL + (i / (series.length - 1)) * cw;

    let grid = '';
    const steps = Math.min(maxVal, 4);
    for (let i = 0; i <= steps; i++) {
      const v = maxVal - (maxVal / steps) * i;
      const y = padT + ch * i / steps;
      grid += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#e8eef5" stroke-dasharray="3 4"/>`;
      grid += `<text x="${padL - 6}" y="${y + 3.5}" text-anchor="end" font-size="9" fill="#a8b3c1">${Math.round(v)}次</text>`;
    }

    const pts = [];
    series.forEach((s, i) => {
      if (s.awakeCount != null) {
        pts.push({ x: xScale(i), y: yScale(s.awakeCount), v: s.awakeCount });
      }
    });

    let polyline = '';
    if (pts.length > 1) {
      polyline = `<polyline points="${pts.map(p => p.x + ',' + p.y).join(' ')}"
        fill="none" stroke="#c96a88" stroke-width="2.2"
        stroke-linecap="round" stroke-linejoin="round"/>`;
    }

    let dots = '';
    pts.forEach(p => {
      dots += `<circle cx="${p.x}" cy="${p.y}" r="3.5"
        fill="#c96a88" stroke="#fff" stroke-width="1.8"/>`;
      if (maxVal <= 8) {
        dots += `<text x="${p.x}" y="${p.y - 7}" text-anchor="middle"
          font-size="9" font-weight="600" fill="#c96a88">${p.v}</text>`;
      }
    });

    const maxLabels = 7;
    const step = Math.max(1, Math.ceil(series.length / maxLabels));
    let xLabels = '';
    series.forEach((s, i) => {
      if (i % step !== 0 && i !== series.length - 1) return;
      xLabels += `<text x="${xScale(i)}" y="${H - 10}" text-anchor="middle"
        font-size="9" fill="#a8b3c1">${U.escape(s.label)}</text>`;
    });

    return `<svg viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="xMidYMid meet">
      ${grid}
      <line x1="${padL}" y1="${padT + ch}" x2="${W - padR}" y2="${padT + ch}" stroke="#d8dce1" stroke-width="1"/>
      ${polyline}
      ${dots}
      ${xLabels}
    </svg>`;
  }

  /* =========================================================
     统计逻辑
     ========================================================= */
  function computeStats(recs) {
    const sleepRecs = recs.filter(r => r.sleepTime && r.wakeTime);
    if (!sleepRecs.length) return null;

    let sumSleepH = 0, sumWakeH = 0, sumTotalMins = 0;
    sleepRecs.forEach(r => {
      sumSleepH += timeToHours(r.sleepTime);
      sumWakeH  += timeToHours(r.wakeTime);
      sumTotalMins += (calcTotalSleepMins(r) || 0);
    });
    const n = sleepRecs.length;

    const avgTotalH = sumTotalMins / n / 60;

    const withDeep = recs.filter(r => r.deepSleep != null && r.deepSleep > 0);
    const avgDeep = withDeep.length
      ? withDeep.reduce((s, r) => s + r.deepSleep, 0) / withDeep.length / 60 : null;

    const withRem = recs.filter(r => r.remSleep != null && r.remSleep > 0);
    const avgRem = withRem.length
      ? withRem.reduce((s, r) => s + r.remSleep, 0) / withRem.length / 60 : null;

    return {
      count: n,
      avgSleep: hoursToTime(sumSleepH / n),
      avgWake:  hoursToTime(sumWakeH / n),
      avgDuration: avgTotalH,
      avgDeep,
      avgRem
    };
  }

  /* =========================================================
     注册模块
     ========================================================= */
  Registry.register({
    id: 'sleep', name: '睡眠记录', icon: '🌙', order: 25, storageKey: KEY,

    homeCard() {
      const all = getData().records;
      if (!all.length) {
        return `<div class="card"><div class="card-head"><span class="card-icon">🌙</span><span class="card-title">睡眠记录</span><a class="card-more" href="#sleep">记录 ›</a></div><div class="card-empty">还没有记录，点击右上角开始</div></div>`;
      }

      const sorted = all.slice().sort((a, b) => b.date.localeCompare(a.date));
      const latest = sorted[0];
      const isToday = latest.date === U.todayStr();
      
      const totalMins = calcTotalSleepMins(latest);
      const totalText = totalMins != null ? fmtDuration(totalMins / 60) : '—';

      const last7 = all.filter(r => {
        const d = parseDate(r.date);
        const diff = (new Date() - d) / 86400000;
        return diff <= 7 && calcTotalSleepMins(r) != null;
      });
      const avg7 = last7.length ? last7.reduce((s, r) => s + calcTotalSleepMins(r), 0) / last7.length / 60 : null;

      return `<div class="card">
        <div class="card-head"><span class="card-icon">🌙</span><span class="card-title">睡眠记录</span><span class="card-sub">${isToday ? '昨晚' : U.formatDate(latest.date)}</span><a class="card-more" href="#sleep">详情 ›</a></div>
        <div class="sleep-home-body">
          <div class="sleep-home-row">
            <span class="sleep-home-time">${U.escape(latest.sleepTime || '—')}</span>
            <span class="sleep-home-arrow">→</span>
            <span class="sleep-home-time">${U.escape(latest.wakeTime || '—')}</span>
            ${totalText !== '—' ? `<span class="sleep-home-dur">${totalText}</span>` : ''}
          </div>
          ${avg7 != null ? `<div class="sleep-home-sub">近 7 天平均 <b>${avg7.toFixed(1)}h</b></div>` : ''}
          ${latest.napStart && latest.napEnd ? `<div class="sleep-home-nap">😴 午休 ${U.escape(latest.napStart)}-${U.escape(latest.napEnd)}</div>` : ''}
        </div>
      </div>`;
    },

    page() { return renderPage(); },

    handleAction(act, el, ctx) {
      if (act === 'sleep-range') { viewRange = el.dataset.range; listLimit = 10; ctx.refresh(); return true; }
      if (act === 'sleep-chart-view') { chartView = el.dataset.view; ctx.refresh(); return true; }
      if (act === 'sleep-prev' || act === 'sleep-next') {
        const dir = act === 'sleep-prev' ? -1 : 1;
        const a = getAnchor();
        if (viewRange === 'week') a.setDate(a.getDate() + 7 * dir);
        else if (viewRange === 'month') a.setMonth(a.getMonth() + dir);
        else a.setFullYear(a.getFullYear() + dir);
        anchorDate = a; listLimit = 10; ctx.refresh(); return true;
      }
      if (act === 'sleep-now') { anchorDate = new Date(); listLimit = 10; ctx.refresh(); return true; }

      if (act === 'sleep-add') { openForm(null); return true; }
      if (act === 'sleep-edit') { const rec = getData().records.find(r => r.id === el.dataset.id); if (rec) openForm(rec); return true; }
      if (act === 'sleep-del') {
        const id = el.dataset.id;
        UI.confirm('确定删除这条记录吗？').then(ok => {
          if (!ok) return;
          Store.update(KEY, d => { d.records = d.records.filter(r => r.id !== id); return d; });
        });
        return true;
      }
      if (act === 'sleep-load-more') { listLimit += 20; ctx.refresh(); return true; }

      return false;
    }
  });

  /* =========================================================
     主页面渲染
     ========================================================= */
  function renderPage() {
    const range = getRange(viewRange, getAnchor());
    const recs = recordsInRange(range);
    
    const series = recs.map(r => ({
      date: r.date,
      label: (() => { const d = parseDate(r.date); return (d.getMonth() + 1) + '/' + d.getDate(); })(),
      sleepTime: r.sleepTime,
      wakeTime: r.wakeTime,
      awakeCount: r.awakeCount,
      awakeTime: r.awakeTime
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

    const chartSwitch = `
      <div class="tabs sleep-chart-tabs">
        <button class="tab ${chartView === 'sleep' ? 'active' : ''}" data-act="sleep-chart-view" data-view="sleep">睡眠</button>
        <button class="tab ${chartView === 'awake' ? 'active' : ''}" data-act="sleep-chart-view" data-view="awake">清醒</button>
      </div>`;

    let chart = '';
    if (chartView === 'sleep') {
      chart = `
        <div class="chart-card sleep-chart-card">
          <div class="chart-title">
            <span>入睡 / 醒来时间</span>
            <span class="sleep-legend">
              <i class="dot-sleep"></i>入睡
              <i class="dot-wake"></i>醒来
            </span>
          </div>
          ${buildSleepChart(series)}
          <div class="sleep-chart-hint">柱 = 总睡眠段（即醒-睡跨度扣除清醒时间）· 线 = 每日入睡/醒来时间</div>
          <div class="sleep-chart-hint sleep-chart-legend">
            <span><i class="hint-dot green"></i>7h 及以上</span>
            <span><i class="hint-dot orange"></i>6~7h</span>
            <span><i class="hint-dot deepred"></i>少于 6h</span>
            <span><i class="hint-dash"></i>23:00 计划</span>
          </div>
        </div>`;
    } else {
      chart = `
        <div class="chart-card sleep-chart-card">
          <div class="chart-title">
            <span>清醒总时长</span>
            <span class="chart-unit">分钟</span>
          </div>
          ${buildAwakeBarChart(series)}
          <div class="sleep-chart-hint">柱 = 每晚清醒总时长</div>
        </div>
        <div class="chart-card sleep-chart-card">
          <div class="chart-title">
            <span>清醒次数</span>
            <span class="chart-unit">次</span>
          </div>
          ${buildAwakeLineChart(series)}
          <div class="sleep-chart-hint">线 = 每晚清醒次数</div>
        </div>`;
    }

    const stats = renderStats(recs);
    const list = renderList(recs);

    return `<div class="module sleep-module">
      ${rangeSwitcher}
      ${head}
      ${chartSwitch}
      ${chart}
      ${stats}
      ${list}
      <button class="fab" data-act="sleep-add" aria-label="新增睡眠记录">+</button>
    </div>`;
  }

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

  function renderList(recs) {
    if (!recs.length) {
      return `<div class="empty" data-emoji="🌙">这段时间还没有记录<br><button class="btn btn-primary" data-act="sleep-add" style="margin-top:12px">+ 记录睡眠</button></div>`;
    }

    const sorted = recs.slice().sort((a, b) => b.date.localeCompare(a.date));
    const shown = sorted.slice(0, listLimit);
    const hasMore = sorted.length > listLimit;
    const remain = sorted.length - listLimit;

    let html = `<div class="sleep-list">${shown.map(r => renderItem(r)).join('')}</div>`;

    if (hasMore) {
      html += `<button class="btn btn-ghost sleep-load-more" data-act="sleep-load-more">显示更多 · 还有 ${remain} 条</button>`;
    }

    return html;
  }

  function renderItem(r) {
    const totalMins = calcTotalSleepMins(r);
    const totalText = totalMins != null ? fmtDuration(totalMins / 60) : '—';
    const d = parseDate(r.date);
    const today = U.todayStr();
    const dateLabel = r.date === today ? '今天' : (U.formatDate(r.date) + ' · ' + U.weekday(d));

    const chips = [];
    if (r.deepSleep != null && r.deepSleep > 0) chips.push(`深睡 ${fmtDurationMins(r.deepSleep)}`);
    if (r.lightSleep != null && r.lightSleep > 0) chips.push(`浅睡 ${fmtDurationMins(r.lightSleep)}`);
    if (r.remSleep != null && r.remSleep > 0) chips.push(`REM ${fmtDurationMins(r.remSleep)}`);
    if (r.awakeCount != null && r.awakeCount > 0) chips.push(`醒 ${r.awakeCount}次`);
    if (r.awakeTime != null && r.awakeTime > 0) chips.push(`清醒 ${r.awakeTime}分`);

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
        ${totalText !== '—' ? `<span class="sleep-dur">${totalText}</span>` : ''}
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
      { name: 'date',      label: '日期（起床日）', type: 'date', value: editing ? editing.date : U.todayStr(), required: true },
      { name: 'sleepTime', label: '入睡时间', type: 'time', value: editing ? editing.sleepTime : '23:00', required: true },
      { name: 'wakeTime',  label: '醒来时间', type: 'time', value: editing ? editing.wakeTime : '07:00', required: true },
      { name: 'awakeCount', label: '清醒次数（可留空）', type: 'number', value: editing && editing.awakeCount != null ? editing.awakeCount : '' },
      { name: 'awakeTime',  label: '总清醒时长（分钟，可留空）', type: 'number', value: editing && editing.awakeTime != null ? editing.awakeTime : '' }
    ];

    // 把分钟拆成小时和分钟，方便用户填
    const deepH = editing && editing.deepSleep ? Math.floor(editing.deepSleep / 60) : '';
    const deepM = editing && editing.deepSleep ? editing.deepSleep % 60 : '';
    const lightH = editing && editing.lightSleep ? Math.floor(editing.lightSleep / 60) : '';
    const lightM = editing && editing.lightSleep ? editing.lightSleep % 60 : '';
    const remH = editing && editing.remSleep ? Math.floor(editing.remSleep / 60) : '';
    const remM = editing && editing.remSleep ? editing.remSleep % 60 : '';

    fields.push(
      { name: 'deepSleepH',  label: '深度睡眠 - 小时', type: 'number', value: deepH },
      { name: 'deepSleepM',  label: '深度睡眠 - 分钟', type: 'number', value: deepM },
      { name: 'lightSleepH', label: '浅度睡眠 - 小时', type: 'number', value: lightH },
      { name: 'lightSleepM', label: '浅度睡眠 - 分钟', type: 'number', value: lightM },
      { name: 'remSleepH',   label: '快速眼动 - 小时', type: 'number', value: remH },
      { name: 'remSleepM',   label: '快速眼动 - 分钟', type: 'number', value: remM }
    );

    fields.push(
      { name: 'napStart', label: '午休开始（可留空）', type: 'time', value: editing ? (editing.napStart || '') : '' },
      { name: 'napEnd',   label: '午休结束（可留空）', type: 'time', value: editing ? (editing.napEnd || '') : '' },
      { name: 'note', label: '备注（可选）', type: 'textarea', value: editing ? (editing.note || '') : '' }
    );

    UI.form(editing ? '编辑睡眠记录' : '记录睡眠', fields).then(r => {
      if (!r) return;
      if (!r.date) { UI.toast('请选择日期'); return; }
      if (!r.sleepTime || !r.wakeTime) { UI.toast('请填写入睡和醒来时间'); return; }

      const num = v => (v === '' || v == null) ? null : Number(v);
      
      // 合并小时和分钟到分钟数
      const deepMins = (Number(r.deepSleepH) || 0) * 60 + (Number(r.deepSleepM) || 0);
      const lightMins = (Number(r.lightSleepH) || 0) * 60 + (Number(r.lightSleepM) || 0);
      const remMins = (Number(r.remSleepH) || 0) * 60 + (Number(r.remSleepM) || 0);

      const payload = {
        date: r.date,
        sleepTime: r.sleepTime,
        wakeTime: r.wakeTime,
        awakeCount: num(r.awakeCount),
        awakeTime:  num(r.awakeTime),
        deepSleep:  deepMins > 0 ? deepMins : null,
        lightSleep: lightMins > 0 ? lightMins : null,
        remSleep:   remMins > 0 ? remMins : null,
        napStart: r.napStart || null,
        napEnd:   r.napEnd || null,
        note: (r.note || '').trim()
      };

      Store.update(KEY, d => {
        if (editing) {
          const t = d.records.find(x => x.id === editing.id);
          if (t) Object.assign(t, payload);
        } else {
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