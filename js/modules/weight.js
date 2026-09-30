(function () {
  const KEY = 'weight';
  let viewTab = 'week'; // week | month | year

  /* =========================================================
     数据层
     ========================================================= */
  function getData() {
    const data = Store.ensure(KEY, () => ({
      height: 170, gender: 'male', age: 30,
      targetWeight: null, unit: 'kg',
      defaultWaist: null, defaultNeck: null, defaultHip: null,
      records: []
    }));
    if (!Array.isArray(data.records)) data.records = [];
    if (!data.unit) data.unit = 'kg';
    if (!data.gender) data.gender = 'male';
    return data;
  }

  function sortedRecords() {
    return getData().records.slice().sort((a, b) => a.date.localeCompare(b.date));
  }
  function latestRecord() {
    const arr = sortedRecords();
    return arr.length ? arr[arr.length - 1] : null;
  }

  /* =========================================================
     单位换算
     ========================================================= */
  function toDisplay(kg, unit) {
    return unit === 'jin' ? kg * 2 : kg;
  }
  function toKg(val, unit) {
    return unit === 'jin' ? val / 2 : val;
  }
  function unitLabel(unit) {
    return unit === 'jin' ? '斤' : 'kg';
  }
  function decimals(unit) {
    return unit === 'jin' ? 0 : 1;
  }

  /* =========================================================
     BMI & 体脂率
     ========================================================= */
  function calcBMI(kg, heightCm) {
    if (!heightCm || heightCm <= 0 || !kg) return null;
    const m = heightCm / 100;
    return kg / (m * m);
  }
  function bmiLabel(bmi) {
    if (bmi == null) return { text: '—', cls: '' };
    if (bmi < 18.5) return { text: '偏瘦', cls: 'bmi-thin' };
    if (bmi < 24)   return { text: '正常', cls: 'bmi-ok' };
    if (bmi < 28)   return { text: '超重', cls: 'bmi-over' };
    return { text: '肥胖', cls: 'bmi-obese' };
  }

  function calcBodyFat(rec, data) {
    const { height, gender, age, defaultWaist, defaultNeck, defaultHip } = data;
    if (!height || height <= 0 || !rec.weight) return null;

    const waist = rec.waist || defaultWaist;
    const neck  = rec.neck  || defaultNeck;
    const hip   = rec.hip   || defaultHip;

    if (gender && waist && neck) {
      let bf = null;
      if (gender === 'male') {
        const inner = waist - neck;
        if (inner > 0) {
          bf = 495 / (1.0324 - 0.19077 * Math.log10(inner)
                          + 0.15456 * Math.log10(height)) - 450;
        }
      } else {
        if (hip && (waist + hip - neck) > 0) {
          bf = 495 / (1.29579 - 0.35004 * Math.log10(waist + hip - neck)
                             + 0.22100 * Math.log10(height)) - 450;
        }
      }
      if (bf != null && bf > 0 && bf < 70) return bf;
    }

    const bmi = calcBMI(rec.weight, height);
    if (bmi && age && gender) {
      const sexFactor = gender === 'male' ? 1 : 0;
      return 1.20 * bmi + 0.23 * age - 10.8 * sexFactor - 5.4;
    }
    return null;
  }

  function bodyFatLabel(bf, gender) {
    if (bf == null) return { text: '—', cls: '' };
    if (gender === 'male') {
      if (bf < 6)  return { text: '偏低', cls: 'bf-low' };
      if (bf < 14) return { text: '优秀', cls: 'bf-excellent' };
      if (bf < 18) return { text: '健康', cls: 'bf-good' };
      if (bf < 25) return { text: '一般', cls: 'bf-fair' };
      return { text: '偏高', cls: 'bf-high' };
    } else {
      if (bf < 14) return { text: '偏低', cls: 'bf-low' };
      if (bf < 21) return { text: '优秀', cls: 'bf-excellent' };
      if (bf < 25) return { text: '健康', cls: 'bf-good' };
      if (bf < 32) return { text: '一般', cls: 'bf-fair' };
      return { text: '偏高', cls: 'bf-high' };
    }
  }

  function bodyFatReady(data) {
    return !!(data.height && data.gender && data.age);
  }

  /* =========================================================
     目标进度计算
     ========================================================= */
  /**
   * 返回 null（无目标/无记录）或者：
   * {
   *   pct,           // 0-100 整数
   *   start,         // kg 起点（第一条记录）
   *   current,       // kg 当前（最新记录）
   *   target,        // kg 目标
   *   direction,     // 'lose' | 'gain' | 'keep'
   *   done,          // 是否已达标
   *   remaining      // kg 还差多少（绝对值）
   * }
   */
  function computeTargetProgress(data) {
    if (!data.targetWeight) return null;
    const recs = sortedRecords();
    if (!recs.length) return null;

    const start = recs[0].weight;
    const current = recs[recs.length - 1].weight;
    const target = data.targetWeight;

    const EPS = 0.01; // 0.01kg 视为相等
    const remaining = Math.abs(current - target);
    const done = remaining < 0.1;

    // 起点=目标
    if (Math.abs(start - target) < EPS) {
      return { pct: 100, start, current, target, direction: 'keep', done: true, remaining };
    }

    // 判断方向
    const direction = start > target ? 'lose' : 'gain';

    let progress;
    if (direction === 'lose') {
      progress = (start - current) / (start - target);
    } else {
      progress = (current - start) / (target - start);
    }

    // clamp 到 [0, 1]
    progress = Math.max(0, Math.min(1, progress));

    return {
      pct: Math.round(progress * 100),
      start, current, target,
      direction,
      done,
      remaining
    };
  }

  /* =========================================================
     日期工具
     ========================================================= */
  function startOfDay(d) {
    const t = new Date(d);
    t.setHours(0, 0, 0, 0);
    return t;
  }
  function dateBefore(days) {
    const d = startOfDay(new Date());
    d.setDate(d.getDate() - days);
    return d;
  }

  /* =========================================================
     折线图
     ========================================================= */
  function buildChart(series, opts) {
    opts = opts || {};
    const W = 360, H = 180;
    const padL = 44, padR = 14, padT = 16, padB = 26;
    const cw = W - padL - padR;
    const ch = H - padT - padB;
    const color = opts.color || '#4c8bf5';
    const yFormat = opts.yFormat || (v => v.toFixed(1));

    if (!series.length) {
      return `<svg viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="xMidYMid meet">
        <text x="${W / 2}" y="${H / 2 + 4}" text-anchor="middle" fill="#bbb" font-size="13">暂无数据</text>
      </svg>`;
    }

    const xs = series.map(p => p.x);
    const ys = series.map(p => p.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    let yMin = Math.min(...ys), yMax = Math.max(...ys);

    if (opts.targetLine && typeof opts.targetLine.value === 'number') {
      yMin = Math.min(yMin, opts.targetLine.value);
      yMax = Math.max(yMax, opts.targetLine.value);
    }

    if (yMin === yMax) { yMin -= 1; yMax += 1; }
    const yPad = (yMax - yMin) * 0.18;
    yMin -= yPad; yMax += yPad;

    const xScale = v => xMax === xMin
      ? padL + cw / 2
      : padL + (v - xMin) / (xMax - xMin) * cw;
    const yScale = v => padT + ch - (v - yMin) / (yMax - yMin) * ch;

    let grid = '';
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const y = padT + ch * i / steps;
      const val = yMax - (yMax - yMin) * i / steps;
      grid += `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="#eef0f3" stroke-width="1"/>`;
      grid += `<text x="${padL - 5}" y="${y + 3.5}" text-anchor="end" font-size="10" fill="#999">${yFormat(val)}</text>`;
    }

    let targetHtml = '';
    if (opts.targetLine && typeof opts.targetLine.value === 'number') {
      const tv = opts.targetLine.value;
      if (tv >= yMin && tv <= yMax) {
        const ty = yScale(tv);
        const tColor = opts.targetLine.color || '#e35d5d';
        targetHtml = `
          <line x1="${padL}" y1="${ty}" x2="${W - padR}" y2="${ty}"
            stroke="${tColor}" stroke-width="1.2" stroke-dasharray="4 3" opacity="0.85"/>
          <text x="${W - padR - 2}" y="${ty - 4}" text-anchor="end"
            font-size="10" fill="${tColor}" font-weight="600">
            ${U.escape(opts.targetLine.label || '目标')}
          </text>`;
      }
    }

    const points = series.map(p => `${xScale(p.x)},${yScale(p.y)}`).join(' ');
    const firstX = xScale(series[0].x);
    const lastX  = xScale(series[series.length - 1].x);
    const area = `${firstX},${padT + ch} ${points} ${lastX},${padT + ch}`;

    let dots = '';
    series.forEach(p => {
      dots += `<circle cx="${xScale(p.x)}" cy="${yScale(p.y)}" r="3.2"
        fill="${color}" stroke="#fff" stroke-width="1.5"/>`;
    });

    const maxLabels = opts.xMaxLabels || 6;
    const step = Math.max(1, Math.ceil(series.length / maxLabels));
    let xLabels = '';
    series.forEach((p, i) => {
      if (i % step !== 0 && i !== series.length - 1) return;
      xLabels += `<text x="${xScale(p.x)}" y="${H - 8}"
        text-anchor="middle" font-size="10" fill="#999">${p.label || ''}</text>`;
    });

const gradId = 'g_' + Math.random().toString(36).slice(2, 8);
return `<svg viewBox="0 0 ${W} ${H}" class="chart" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
    </linearGradient>
  </defs>
  ${grid}
  <polygon points="${area}" fill="url(#${gradId})"/>
  ${targetHtml}
  <polyline points="${points}" fill="none" stroke="${color}"
    stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"
    style="filter: drop-shadow(0 2px 4px ${color}33)"/>
  ${dots}
  ${xLabels}
</svg>`;
  }

  /* =========================================================
     取样
     ========================================================= */
  function buildWeekSeries() {
    const recs = getData().records;
    const today = startOfDay(new Date());
    const series = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = U.todayStr(d);
      const dayRecs = recs.filter(r => r.date === ds);
      if (dayRecs.length) {
        const last = dayRecs[dayRecs.length - 1];
        series.push({
          x: 6 - i, y: last.weight,
          label: (d.getMonth() + 1) + '/' + d.getDate(),
          date: ds, rec: last
        });
      }
    }
    return series;
  }

  function buildMonthSeries() {
    const recs = getData().records;
    const today = startOfDay(new Date());
    const series = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = U.todayStr(d);
      const dayRecs = recs.filter(r => r.date === ds);
      if (dayRecs.length) {
        const last = dayRecs[dayRecs.length - 1];
        series.push({
          x: 29 - i, y: last.weight,
          label: (d.getMonth() + 1) + '/' + d.getDate(),
          date: ds, rec: last
        });
      }
    }
    return series;
  }

  function buildYearSeries() {
    const recs = getData().records;
    const now = new Date();
    const series = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear(), m = d.getMonth();
      const monthRecs = recs.filter(r => {
        const rd = new Date(r.date);
        return rd.getFullYear() === y && rd.getMonth() === m;
      });
      if (monthRecs.length) {
        const avg = monthRecs.reduce((s, r) => s + r.weight, 0) / monthRecs.length;
        const last = monthRecs[monthRecs.length - 1];
        series.push({
          x: 11 - i, y: avg,
          label: (m + 1) + '月',
          date: `${y}-${U.pad(m + 1)}`,
          rec: { ...last, weight: avg }
        });
      }
    }
    return series;
  }

  function getWeightSeries() {
    if (viewTab === 'week') return buildWeekSeries();
    if (viewTab === 'month') return buildMonthSeries();
    return buildYearSeries();
  }

  function toBMISeries(ws, height) {
    if (!height) return [];
    return ws.map(p => {
      const b = calcBMI(p.y, height);
      return b == null ? null : { x: p.x, y: b, label: p.label, date: p.date };
    }).filter(Boolean);
  }

  function toBodyFatSeries(ws, data) {
    if (!bodyFatReady(data)) return [];
    return ws.map(p => {
      const rec = p.rec ? { ...p.rec, weight: p.y } : { weight: p.y };
      const bf = calcBodyFat(rec, data);
      return bf == null ? null : { x: p.x, y: bf, label: p.label, date: p.date };
    }).filter(Boolean);
  }

  function getRangeRecords() {
    const now = startOfDay(new Date());
    let minDate;
    if (viewTab === 'week') {
      minDate = U.todayStr(dateBefore(6));
    } else if (viewTab === 'month') {
      minDate = U.todayStr(dateBefore(29));
    } else {
      const d = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      minDate = U.todayStr(d);
    }
    const maxDate = U.todayStr(now);
    return getData().records
      .filter(r => r.date >= minDate && r.date <= maxDate)
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  function computeStats(series, unit) {
    if (!series.length) {
      return { latest: '—', avg: '—', delta: '—', deltaCls: '' };
    }
    const u = unitLabel(unit);
    const dec = decimals(unit);
    const latest = series[series.length - 1].y;
    const first  = series[0].y;
    const avg = series.reduce((s, p) => s + p.y, 0) / series.length;
    const delta = latest - first;
    const sign = delta > 0 ? '+' : '';
    return {
      latest: latest.toFixed(dec) + u,
      avg: avg.toFixed(dec) + u,
      delta: sign + delta.toFixed(dec) + u,
      deltaCls: delta > 0 ? 'up' : (delta < 0 ? 'down' : '')
    };
  }

  /* =========================================================
     注册模块
     ========================================================= */
  Registry.register({
    id: 'weight',
    name: '体重记录',
    icon: '⚖️',
    order: 30,
    storageKey: KEY,

    /* ---------------- 主页卡片 ---------------- */
    homeCard() {
      const data = getData();
      const unit = data.unit;
      const dec = decimals(unit);
      const latest = latestRecord();

      if (!latest) {
        return `<div class="card">
          <div class="card-head">
            <span class="card-icon">⚖️</span>
            <span class="card-title">体重记录</span>
            <a class="card-more" href="#weight">记录 ›</a>
          </div>
          <div class="card-empty">还没有记录，点击右上角开始</div>
        </div>`;
      }

      const w = toDisplay(latest.weight, unit);
      const bmi = calcBMI(latest.weight, data.height);
      const bmiTag = bmiLabel(bmi);
      const bf = calcBodyFat(latest, data);
      const bfTag = bodyFatLabel(bf, data.gender);

      // 与上一条对比
      let deltaHtml = '';
      const arr = sortedRecords();
      if (arr.length >= 2) {
        const prev = arr[arr.length - 2];
        const delta = toDisplay(latest.weight - prev.weight, unit);
        const sign = delta > 0 ? '+' : '';
        const cls = delta > 0 ? 'up' : (delta < 0 ? 'down' : '');
        deltaHtml = `<span class="weight-delta ${cls}">${sign}${delta.toFixed(dec)}${unitLabel(unit)}</span>`;
      }

      // 目标进度条
      const prog = computeTargetProgress(data);
      let targetHtml = '';
      if (prog) {
        const startDisp  = toDisplay(prog.start, unit).toFixed(dec);
        const targetDisp = toDisplay(prog.target, unit).toFixed(dec);
        const curDisp    = toDisplay(prog.current, unit).toFixed(dec);
        const remDisp    = toDisplay(prog.remaining, unit).toFixed(dec);
        const dirText    = prog.direction === 'lose' ? '减重'
                         : prog.direction === 'gain' ? '增重' : '保持';
        const statusText = prog.done ? '已达标 🎉'
                         : `距目标 ${remDisp}${unitLabel(unit)}`;

        targetHtml = `
          <div class="weight-target">
            <div class="weight-target-head">
              <span class="weight-target-label">${dirText}目标 ${targetDisp}${unitLabel(unit)}</span>
              <span class="weight-target-pct ${prog.done ? 'done' : ''}">${prog.pct}%</span>
            </div>
            <div class="weight-target-bar">
              <i style="width:${prog.pct}%"></i>
            </div>
            <div class="weight-target-foot">
              <span>起点 ${startDisp}${unitLabel(unit)}</span>
              <span class="weight-target-now">${curDisp}${unitLabel(unit)}</span>
              <span>目标 ${targetDisp}${unitLabel(unit)}</span>
            </div>
            <div class="weight-target-status ${prog.done ? 'done' : ''}">${statusText}</div>
          </div>`;
      }

      return `<div class="card">
        <div class="card-head">
          <span class="card-icon">⚖️</span>
          <span class="card-title">体重记录</span>
          <a class="card-more" href="#weight">详情 ›</a>
        </div>
        <div class="weight-home-body">
          <div class="weight-home-main">
            <span class="weight-home-num">${w.toFixed(dec)}</span>
            <span class="weight-home-unit">${unitLabel(unit)}</span>
            ${deltaHtml}
          </div>
          <div class="weight-home-sub">
            <span class="bmi-tag ${bmiTag.cls}">BMI ${bmi ? bmi.toFixed(1) : '—'} ${bmiTag.text}</span>
            ${bf != null ? `<span class="bmi-tag ${bfTag.cls}">体脂 ${bf.toFixed(1)}% ${bfTag.text}</span>` : ''}
          </div>
          ${targetHtml}
          <div class="weight-home-date">${U.formatDate(latest.date)}</div>
        </div>
      </div>`;
    },

    /* ---------------- 模块页面 ---------------- */
    page() {
      return renderDetail();
    },

    /* ---------------- 事件处理 ---------------- */
    handleAction(act, el, ctx) {
      if (act === 'weight-tab') {
        viewTab = el.dataset.tab;
        ctx.refresh();
        return true;
      }

      if (act === 'weight-toggle-unit') {
        Store.update(KEY, d => {
          d.unit = d.unit === 'kg' ? 'jin' : 'kg';
          return d;
        });
        return true;
      }

      if (act === 'weight-set-profile') {
        const data = getData();
        const unit = data.unit;
        const dec = decimals(unit);
        UI.form('身体参数（用于计算 BMI 与体脂率）', [
          { name: 'gender', label: '性别', type: 'select', value: data.gender,
            options: [{ value: 'male', label: '男' }, { value: 'female', label: '女' }] },
          { name: 'age',    label: '年龄', type: 'number', value: data.age || 30, required: true },
          { name: 'height', label: '身高（cm）', type: 'number', value: data.height || 170, required: true },
          { name: 'targetWeight', label: '目标体重（' + unitLabel(unit) + '，留空表示不设）',
            type: 'number', value: data.targetWeight != null ? toDisplay(data.targetWeight, unit).toFixed(dec) : '' },
        { name: 'defaultWaist', label: '默认腰围（cm，肚脐水平一圈，可留空）', type: 'number', value: data.defaultWaist || '' },
{ name: 'defaultNeck',  label: '默认颈围（cm，喉结下方最细处，可留空）', type: 'number', value: data.defaultNeck  || '' },
{ name: 'defaultHip',   label: '默认臀围（cm，臀部最凸处，可留空）', type: 'number', value: data.defaultHip   || '' },
        ]).then(r => {
          if (!r) return;
          Store.update(KEY, d => {
            d.gender = r.gender;
            d.age = Math.max(1, Math.min(120, Number(r.age) || 30));
            d.height = Math.max(80, Math.min(250, Number(r.height) || 170));
            if (r.targetWeight === '' || r.targetWeight == null) d.targetWeight = null;
            else d.targetWeight = toKg(Number(r.targetWeight), unit) || null;
            d.defaultWaist = r.defaultWaist === '' ? null : Number(r.defaultWaist) || null;
            d.defaultNeck  = r.defaultNeck  === '' ? null : Number(r.defaultNeck)  || null;
            d.defaultHip   = r.defaultHip   === '' ? null : Number(r.defaultHip)   || null;
            return d;
          });
          UI.toast('已保存');
        });
        return true;
      }

      if (act === 'weight-add') {
        const data = getData();
        const unit = data.unit;
        const fields = [
          { name: 'date', label: '日期', type: 'date', value: U.todayStr(), required: true },
          { name: 'weight', label: '体重（' + unitLabel(unit) + '）', type: 'number', value: '', required: true },
          { name: 'waist', label: '腰围（cm，肚脐水平一圈，可留空）', type: 'number', value: '' },
{ name: 'neck',  label: '颈围（cm，喉结下方最细处，可留空）', type: 'number', value: '' }
        ];
        if (data.gender === 'female') {
          fields.push({ name: 'hip',   label: '臀围（cm，臀部最凸处，可留空）', type: 'number', value: '' });
        }
        fields.push({ name: 'note', label: '备注（可选）', value: '' });

        UI.form('记录体重', fields).then(r => {
          if (!r) return;
          const kg = toKg(Number(r.weight), unit);
          if (!kg || kg <= 0) { UI.toast('体重必须大于 0'); return; }
          Store.update(KEY, d => {
            d.records.push({
              id: U.uid('w'),
              date: r.date,
              weight: kg,
              waist: r.waist === '' ? null : Number(r.waist) || null,
              neck:  r.neck  === '' ? null : Number(r.neck)  || null,
              hip:   r.hip   === '' ? null : Number(r.hip)   || null,
              note: r.note || '',
              createdAt: Date.now()
            });
            return d;
          });
          UI.toast('已记录');
        });
        return true;
      }

      if (act === 'weight-edit') {
        const id = el.dataset.id;
        const data = getData();
        const rec = data.records.find(r => r.id === id);
        if (!rec) return true;
        const unit = data.unit;
        const dec = decimals(unit);
        const fields = [
          { name: 'date', label: '日期', type: 'date', value: rec.date, required: true },
          { name: 'weight', label: '体重（' + unitLabel(unit) + '）',
            type: 'number', value: toDisplay(rec.weight, unit).toFixed(dec), required: true },
          { name: 'waist', label: '腰围（cm，可留空）', type: 'number', value: rec.waist || '' },
          { name: 'neck',  label: '颈围（cm，可留空）', type: 'number', value: rec.neck  || '' }
        ];
        if (data.gender === 'female') {
          fields.push({ name: 'hip', label: '臀围（cm，可留空）', type: 'number', value: rec.hip || '' });
        }
        fields.push({ name: 'note', label: '备注（可选）', value: rec.note || '' });

        UI.form('编辑记录', fields).then(r => {
          if (!r) return;
          const kg = toKg(Number(r.weight), unit);
          if (!kg || kg <= 0) { UI.toast('体重必须大于 0'); return; }
          Store.update(KEY, d => {
            const t = d.records.find(x => x.id === id);
            if (t) {
              t.date = r.date;
              t.weight = kg;
              t.waist = r.waist === '' ? null : Number(r.waist) || null;
              t.neck  = r.neck  === '' ? null : Number(r.neck)  || null;
              t.hip   = r.hip   === '' ? null : Number(r.hip)   || null;
              t.note  = r.note || '';
            }
            return d;
          });
        });
        return true;
      }

      if (act === 'weight-del') {
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
     详情页
     ========================================================= */
  function renderDetail() {
    const data = getData();
    const unit = data.unit;
    const dec = decimals(unit);
    const bfReady = bodyFatReady(data);

    const header = `
      <div class="detail-head">
        <a class="detail-back" href="#home">‹ 返回</a>
        <div class="detail-title">
          <span class="habit-icon lg">⚖️</span>
          <span>体重记录</span>
        </div>
        <div class="detail-actions">
          <button class="btn btn-ghost" data-act="weight-toggle-unit">
            ${unit === 'kg' ? '切斤' : '切kg'}
          </button>
          <button class="btn btn-ghost" data-act="weight-set-profile">参数</button>
          <button class="btn btn-primary" data-act="weight-add">+ 记录</button>
        </div>
      </div>`;

    const tabs = `
      <div class="tabs">
        <button class="tab ${viewTab === 'week' ? 'active' : ''}" data-act="weight-tab" data-tab="week">周</button>
        <button class="tab ${viewTab === 'month' ? 'active' : ''}" data-act="weight-tab" data-tab="month">月</button>
        <button class="tab ${viewTab === 'year' ? 'active' : ''}" data-act="weight-tab" data-tab="year">年</button>
      </div>`;

    // 目标进度卡片（详情页，放在 tabs 之前）
    const targetCardHtml = renderTargetCard(data, unit, dec);

    const rawSeries = getWeightSeries();
    const wSeries = rawSeries.map(p => ({
      x: p.x, y: toDisplay(p.y, unit), label: p.label
    }));
    const wYFormat = v => v.toFixed(dec);

    let targetLine = null;
    if (data.targetWeight) {
      targetLine = {
        value: toDisplay(data.targetWeight, unit),
        label: '目标 ' + toDisplay(data.targetWeight, unit).toFixed(dec),
        color: '#e35d5d'
      };
    }

    const bmiSeries = toBMISeries(rawSeries, data.height);
    const bfSeries = toBodyFatSeries(rawSeries, data);
    const stats = computeStats(wSeries, unit);
    const list = renderRecordList();

    let bfSub;
    if (!bfReady) bfSub = '请先设置性别、年龄、身高';
    else if (!data.defaultWaist && !data.defaultNeck) bfSub = '海军公式需腰围+颈围，未填则用 BMI 估算';
    else bfSub = '基于 ' + (data.gender === 'male' ? '男' : '女') + ' ' + data.age + '岁';

    return `<div class="module weight-module">
      ${header}
      ${targetCardHtml}
      ${tabs}

      <div class="chart-card">
        <div class="chart-title">
          <span>体重变化</span>
          <span class="chart-unit">${unitLabel(unit)}</span>
        </div>
        ${buildChart(wSeries, { color: '#4c8bf5', yFormat: wYFormat, targetLine })}
      </div>

      <div class="chart-card">
        <div class="chart-title">
          <span>BMI 变化</span>
          <span class="chart-unit">${data.height ? '身高 ' + data.height + 'cm' : '未设置身高'}</span>
        </div>
        ${buildChart(bmiSeries, { color: '#2fb56b', yFormat: v => v.toFixed(1) })}
      </div>

      <div class="chart-card">
        <div class="chart-title">
          <span>体脂率变化</span>
          <span class="chart-unit">${bfSub}</span>
        </div>
        ${buildChart(bfSeries, { color: '#e8a33d', yFormat: v => v.toFixed(1) + '%' })}
      </div>

      <div class="stats-row">
        <div class="stat-item"><span>最新</span><strong>${stats.latest}</strong></div>
        <div class="stat-item"><span>平均</span><strong>${stats.avg}</strong></div>
        <div class="stat-item"><span>区间变化</span><strong class="${stats.deltaCls}">${stats.delta}</strong></div>
      </div>

      <div class="record-list-title">
        <span>记录明细</span>
        <span class="muted">${list.count} 条</span>
      </div>
      ${list.html}
    </div>`;
  }

  /* ---------------- 目标卡片 ---------------- */
  function renderTargetCard(data, unit, dec) {
    const prog = computeTargetProgress(data);

    if (!prog) {
      return `<div class="target-card empty">
        <div class="target-empty-text">
          ${data.targetWeight ? '还没有记录，先记一条才能显示进度' : '未设置目标体重'}
        </div>
        <button class="btn btn-primary" data-act="weight-set-profile">
          ${data.targetWeight ? '去记录' : '设置目标'}
        </button>
      </div>`;
    }

    const startDisp  = toDisplay(prog.start, unit).toFixed(dec);
    const targetDisp = toDisplay(prog.target, unit).toFixed(dec);
    const curDisp    = toDisplay(prog.current, unit).toFixed(dec);
    const remDisp    = toDisplay(prog.remaining, unit).toFixed(dec);
    const dirText    = prog.direction === 'lose' ? '减重'
                     : prog.direction === 'gain' ? '增重' : '保持';
    const statusText = prog.done ? '已达标 🎉'
                     : `距目标 ${remDisp}${unitLabel(unit)}`;

    return `<div class="target-card">
      <div class="target-card-head">
        <span class="target-card-title">${dirText}目标</span>
        <span class="target-card-pct ${prog.done ? 'done' : ''}">${prog.pct}%</span>
      </div>
      <div class="target-card-bar">
        <i style="width:${prog.pct}%"></i>
      </div>
      <div class="target-card-foot">
        <span>起点 ${startDisp}${unitLabel(unit)}</span>
        <span class="target-card-now">现在 ${curDisp}${unitLabel(unit)}</span>
        <span>目标 ${targetDisp}${unitLabel(unit)}</span>
      </div>
      <div class="target-card-status ${prog.done ? 'done' : ''}">${statusText}</div>
    </div>`;
  }

  function renderRecordList() {
    const data = getData();
    const unit = data.unit;
    const dec = decimals(unit);
    const recs = getRangeRecords();

    if (!recs.length) {
      return {
        count: 0,
        html: `<div class="empty" style="padding:24px">当前视图范围内暂无记录</div>`
      };
    }

    const html = `<div class="record-list">` + recs.map(r => {
      const w = toDisplay(r.weight, unit).toFixed(dec);
      const bmi = calcBMI(r.weight, data.height);
      const bmiTag = bmiLabel(bmi);
      const bf = calcBodyFat(r, data);
      const bfTag = bodyFatLabel(bf, data.gender);

      const tags = [];
      tags.push(`<span class="bmi-tag ${bmiTag.cls}">BMI ${bmi ? bmi.toFixed(1) : '—'} ${bmiTag.text}</span>`);
      if (bf != null) {
        tags.push(`<span class="bmi-tag ${bfTag.cls}">体脂 ${bf.toFixed(1)}% ${bfTag.text}</span>`);
      }

      return `<div class="record-item">
        <div class="record-main">
          <div class="record-date">${U.formatDate(r.date)}</div>
          <div class="record-weight-line">
            <span class="record-weight">${w}<i>${unitLabel(unit)}</i></span>
          </div>
          <div class="record-tags">${tags.join('')}</div>
          ${r.note ? `<div class="record-note">${U.escape(r.note)}</div>` : ''}
        </div>
        <div class="record-actions">
          <button class="btn btn-ghost" data-act="weight-edit" data-id="${r.id}">编辑</button>
          <button class="btn btn-danger" data-act="weight-del" data-id="${r.id}">删除</button>
        </div>
      </div>`;
    }).join('') + `</div>`;

    return { count: recs.length, html };
  }
})();