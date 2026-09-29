(function () {
  const KEY = 'event';

  const TAG_COLORS = [
    { id: 'blue',   bg: '#eaf1fe', color: '#2a6fd6' },
    { id: 'green',  bg: '#e6f7ec', color: '#157347' },
    { id: 'orange', bg: '#fef4e0', color: '#b8760a' },
    { id: 'red',    bg: '#fdecec', color: '#b02a2a' },
    { id: 'purple', bg: '#f0e9fd', color: '#6f42c1' },
    { id: 'pink',   bg: '#fde7f1', color: '#c9317a' },
    { id: 'teal',   bg: '#e3f5f5', color: '#0f8a8a' },
    { id: 'gray',   bg: '#eef0f3', color: '#666666' }
  ];

  /* ============ 状态 ============ */
  let viewTab = 'list';   // list | month | year
  let monthYM = null;     // { year, month }
  let yearY = null;       // number
  let dateFilter = null;  // 'YYYY-MM-DD'
  let filterType = 'all';
  let filterTags = [];
  let formState = null;
  let tagMgr = null;

  /* ============ 数据层 ============ */
  function getData() {
    const d = Store.ensure(KEY, () => ({ tags: [], events: [] }));
    if (!Array.isArray(d.tags)) d.tags = [];
    if (!Array.isArray(d.events)) d.events = [];
    return d;
  }
  function findTag(id) { return getData().tags.find(t => t.id === id) || null; }
  function tagColor(id) { return TAG_COLORS.find(c => c.id === id) || TAG_COLORS[0]; }
  function nextColor() {
    const used = getData().tags.map(t => t.color);
    for (const c of TAG_COLORS) if (!used.includes(c.id)) return c.id;
    return TAG_COLORS[getData().tags.length % TAG_COLORS.length].id;
  }
  function currentTimeStr() {
    const n = new Date();
    return U.pad(n.getHours()) + ':' + U.pad(n.getMinutes());
  }
  function formatDateLabel(dateStr) {
    const today = U.todayStr();
    if (dateStr === today) return '今天 · ' + U.weekday();
    const yd = new Date();
    yd.setDate(yd.getDate() - 1);
    if (U.todayStr(yd) === dateStr) return '昨天 · ' + U.weekday();
    const d = new Date(dateStr);
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 · ' + U.weekday(d);
  }
  function applyFilter(events) {
    if (filterType === 'none') return events.filter(e => !e.tags || e.tags.length === 0);
    if (filterType === 'tags' && filterTags.length) {
      return events.filter(e => (e.tags || []).some(t => filterTags.includes(t)));
    }
    return events;
  }
  function getMonthYM() {
    if (!monthYM) {
      const n = new Date();
      monthYM = { year: n.getFullYear(), month: n.getMonth() };
    }
    return monthYM;
  }
  function getYearY() {
    if (!yearY) yearY = new Date().getFullYear();
    return yearY;
  }

  /* ============ 注册模块 ============ */
  Registry.register({
    id: 'event',
    name: '事件记录',
    icon: '📌',
    order: 40,
    storageKey: KEY,

    homeCard() {
      const events = getData().events.slice().sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return (b.time || '').localeCompare(a.time || '');
      });
      if (!events.length) {
        return `<div class="card">
          <div class="card-head">
            <span class="card-icon">📌</span>
            <span class="card-title">事件记录</span>
            <a class="card-more" href="#event">记录 ›</a>
          </div>
          <div class="card-empty">还没有记录，点击右上角开始</div>
        </div>`;
      }
      const latest = events.slice(0, 3).map(e => {
        const t = e.tags && e.tags.length ? findTag(e.tags[0]) : null;
        const c = t ? tagColor(t.color) : null;
        return `<div class="event-home-item">
          <span class="ev-home-time">${U.escape(e.time || '—')}</span>
          <span class="ev-home-title">${U.escape(e.title)}</span>
          ${t ? `<span class="ev-home-tag" style="background:${c.bg};color:${c.color}">${U.escape(t.name)}</span>` : ''}
        </div>`;
      }).join('');
      return `<div class="card">
        <div class="card-head">
          <span class="card-icon">📌</span>
          <span class="card-title">事件记录</span>
          <span class="card-sub">共 ${events.length} 条</span>
          <a class="card-more" href="#event">详情 ›</a>
        </div>
        <div class="event-home-list">${latest}</div>
      </div>`;
    },

    page() { return renderPage(); },

    handleAction(act, el, ctx) {
      /* --- 视图 Tab --- */
      if (act === 'event-view') {
        viewTab = el.dataset.tab;
        dateFilter = null;
        ctx.refresh();
        return true;
      }

      /* --- 月视图翻页 --- */
      if (act === 'ev-month-prev' || act === 'ev-month-next') {
        const ym = getMonthYM();
        let m = ym.month + (act === 'ev-month-prev' ? -1 : 1);
        let y = ym.year;
        if (m < 0) { m = 11; y--; }
        if (m > 11) { m = 0; y++; }
        monthYM = { year: y, month: m };
        ctx.refresh();
        return true;
      }
      if (act === 'ev-month-now') {
        const n = new Date();
        monthYM = { year: n.getFullYear(), month: n.getMonth() };
        ctx.refresh();
        return true;
      }

      /* --- 年视图翻页 --- */
      if (act === 'ev-year-prev' || act === 'ev-year-next') {
        yearY = getYearY() + (act === 'ev-year-prev' ? -1 : 1);
        ctx.refresh();
        return true;
      }
      if (act === 'ev-year-now') {
        yearY = new Date().getFullYear();
        ctx.refresh();
        return true;
      }

      /* --- 跳转 --- */
      if (act === 'ev-goto-date') {
        dateFilter = el.dataset.date;
        viewTab = 'list';
        ctx.refresh();
        return true;
      }
      if (act === 'ev-goto-month') {
        monthYM = { year: +el.dataset.year, month: +el.dataset.month };
        viewTab = 'month';
        ctx.refresh();
        return true;
      }
      if (act === 'ev-clear-date') {
        dateFilter = null;
        ctx.refresh();
        return true;
      }

      /* --- 筛选 --- */
      if (act === 'event-filter-all') { filterType = 'all'; filterTags = []; ctx.refresh(); return true; }
      if (act === 'event-filter-none') { filterType = 'none'; filterTags = []; ctx.refresh(); return true; }
      if (act === 'event-filter-tag') {
        const id = el.dataset.id;
        if (filterType !== 'tags') {
          filterType = 'tags';
          filterTags = [id];
        } else {
          if (filterTags.includes(id)) filterTags = filterTags.filter(x => x !== id);
          else filterTags = filterTags.concat(id);
          if (!filterTags.length) filterType = 'all';
        }
        ctx.refresh();
        return true;
      }

      /* --- 事件 CRUD --- */
      if (act === 'event-add') { openForm(null); return true; }
      if (act === 'event-edit') {
        const e = getData().events.find(x => x.id === el.dataset.id);
        if (e) openForm(e);
        return true;
      }
      if (act === 'event-tag-mgr') { openTagManager(); return true; }

      return false;
    }
  });

  /* ============ 主页面 ============ */
  function renderPage() {
    const head = `
      <div class="event-page-head">
        <span class="event-page-title">事件记录</span>
        <button class="event-tag-mgr-btn" data-act="event-tag-mgr">🏷️ 标签管理</button>
      </div>`;

    const viewTabs = `
      <div class="tabs">
        <button class="tab ${viewTab === 'list' ? 'active' : ''}" data-act="event-view" data-tab="list">列表</button>
        <button class="tab ${viewTab === 'month' ? 'active' : ''}" data-act="event-view" data-tab="month">月</button>
        <button class="tab ${viewTab === 'year' ? 'active' : ''}" data-act="event-view" data-tab="year">年</button>
      </div>`;

    let body = '';
    if (viewTab === 'list') body = renderListView();
    else if (viewTab === 'month') body = renderMonthView();
    else body = renderYearView();

    return `<div class="module event-module">
      ${head}
      ${viewTabs}
      ${body}
      <button class="fab" data-act="event-add" aria-label="新增事件">+</button>
    </div>`;
  }

  /* ============ 列表视图 ============ */
  function renderListView() {
    const data = getData();
    let events = data.events;
    if (dateFilter) {
      events = events.filter(e => e.date === dateFilter);
    } else {
      events = applyFilter(events);
    }

    const chip = dateFilter ? `
      <div class="ev-date-chip">
        <span>📅 ${U.formatDate(dateFilter)}</span>
        <button data-act="ev-clear-date" aria-label="清除">×</button>
      </div>` : '';

    const filterBar = !dateFilter ? `
      <div class="event-filter-bar">
        <button class="ev-filter ${filterType === 'all' ? 'active' : ''}" data-act="event-filter-all">全部</button>
        <button class="ev-filter ${filterType === 'none' ? 'active' : ''}" data-act="event-filter-none">无标签</button>
        ${data.tags.length ? '<div class="ev-filter-divider"></div>' : ''}
        ${data.tags.map(t => {
          const c = tagColor(t.color);
          const active = filterType === 'tags' && filterTags.includes(t.id);
          return `<button class="ev-filter ev-filter-tag ${active ? 'active' : ''}"
            data-act="event-filter-tag" data-id="${t.id}"
            style="${active ? `background:${c.bg};color:${c.color};border-color:${c.color}` : ''}">
            ${U.escape(t.name)}
          </button>`;
        }).join('')}
      </div>` : '';

    return `${chip}${filterBar}${renderTimeline(events)}`;
  }

  /* ============ 时间轴 ============ */
  function renderTimeline(events) {
    if (!events.length) {
      const hasAny = getData().events.length > 0;
      return `<div class="empty" style="padding:40px 16px">
        ${dateFilter ? '这一天没有记录' : (hasAny ? '当前筛选下没有事件' : '还没有记录，点击右下角开始')}
        <br>
        <button class="btn btn-primary" data-act="event-add" style="margin-top:14px">+ 新增事件</button>
      </div>`;
    }

    const byDate = {};
    events.forEach(e => {
      const d = e.date || '';
      (byDate[d] = byDate[d] || []).push(e);
    });
    const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

    const days = dates.map(date => {
      const items = byDate[date].slice().sort((a, b) => {
        const ta = a.time || '00:00';
        const tb = b.time || '00:00';
        return tb.localeCompare(ta);
      });
      const cards = items.map(e => renderEventCard(e)).join('');
      return `<div class="tl-day">
        <div class="tl-day-head">
          <div class="tl-dot"></div>
          <div class="tl-date">${formatDateLabel(date)}</div>
          <div class="tl-count">${items.length} 条</div>
        </div>
        <div class="tl-cards">${cards}</div>
      </div>`;
    }).join('');

    return `<div class="timeline">${days}</div>`;
  }

  function renderEventCard(e) {
    const tags = (e.tags || []).map(tid => findTag(tid)).filter(Boolean);
    return `<div class="tl-card" data-act="event-edit" data-id="${e.id}">
      <div class="tl-card-row">
        <div class="tl-card-time">${U.escape(e.time || '—')}</div>
        <div class="tl-card-main">
          <div class="tl-card-title">${U.escape(e.title)}</div>
          ${e.desc ? `<div class="tl-card-desc">${U.escape(e.desc)}</div>` : ''}
          ${tags.length ? `<div class="tl-card-tags">
            ${tags.map(t => {
              const c = tagColor(t.color);
              return `<span class="tl-tag" style="background:${c.bg};color:${c.color}">${U.escape(t.name)}</span>`;
            }).join('')}
          </div>` : ''}
        </div>
        <div class="tl-card-arrow">›</div>
      </div>
    </div>`;
  }

  /* ============ 月视图 ============ */
  function renderMonthView() {
    const ym = getMonthYM();
    const year = ym.year, month = ym.month;
    const firstDay = new Date(year, month, 1);
    const dim = new Date(year, month + 1, 0).getDate();
    const offset = (firstDay.getDay() + 6) % 7;  // 周一为第一列
    const todayStr = U.todayStr();

    // 统计每天记录数
    const prefix = year + '-' + U.pad(month + 1);
    const countByDate = {};
    getData().events.forEach(e => {
      const d = e.date || '';
      if (d.indexOf(prefix) === 0) countByDate[d] = (countByDate[d] || 0) + 1;
    });

    let cells = '';
    for (let i = 0; i < offset; i++) cells += '<div class="ev-month-cell empty"></div>';
    for (let d = 1; d <= dim; d++) {
      const ds = prefix + '-' + U.pad(d);
      const cnt = countByDate[ds] || 0;
      const isFuture = ds > todayStr;
      const isToday = ds === todayStr;
      let cls = 'ev-month-cell';
      if (isFuture) cls += ' future';
      else if (cnt > 0) cls += ' has-data';
      if (isToday) cls += ' today';
      cells += `<div class="${cls}" data-act="ev-goto-date" data-date="${ds}">
        <span class="ev-month-day">${d}</span>
        ${cnt > 0 ? `<span class="ev-month-count">${cnt}</span>` : ''}
      </div>`;
    }

    const now = new Date();
    const isCurrent = now.getFullYear() === year && now.getMonth() === month;

    return `<div class="ev-view-head">
      <button class="sum-nav" data-act="ev-month-prev">‹</button>
      <span class="ev-view-title">${year}年${month + 1}月${isCurrent ? '<span class="sum-now-tag">本月</span>' : ''}</span>
      <div class="ev-view-right">
        ${!isCurrent ? '<button class="sum-now" data-act="ev-month-now">回到本月</button>' : ''}
        <button class="sum-nav" data-act="ev-month-next">›</button>
      </div>
    </div>
    <div class="ev-month-card">
      <div class="ev-month-week">${['一','二','三','四','五','六','日'].map(w => `<span>${w}</span>`).join('')}</div>
      <div class="ev-month-body">${cells}</div>
    </div>
    <div class="ev-view-hint">点击有记录的日期查看当天事件</div>`;
  }

  /* ============ 年视图 ============ */
  function renderYearView() {
    const y = getYearY();
    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth();

    const counts = {};
    getData().events.forEach(e => {
      const d = e.date || '';
      if (d.indexOf(y + '-') === 0) {
        const mk = d.slice(0, 7);  // 'YYYY-MM'
        counts[mk] = (counts[mk] || 0) + 1;
      }
    });

    let cells = '';
    for (let m = 0; m < 12; m++) {
      const mk = y + '-' + U.pad(m + 1);
      const cnt = counts[mk] || 0;
      const isFuture = y > curY || (y === curY && m > curM);
      const isCurrent = y === curY && m === curM;
      let cls = 'ev-year-cell';
      if (isFuture) cls += ' future';
      else if (cnt > 0) cls += ' has-data';
      if (isCurrent) cls += ' current';
      cells += `<div class="${cls}" data-act="ev-goto-month" data-year="${y}" data-month="${m}">
        <div class="ev-year-m">${m + 1}月</div>
        <div class="ev-year-c">${cnt > 0 ? cnt + '条' : '—'}</div>
      </div>`;
    }

    return `<div class="ev-view-head">
      <button class="sum-nav" data-act="ev-year-prev">‹</button>
      <span class="ev-view-title">${y}年${y === curY ? '<span class="sum-now-tag">今年</span>' : ''}</span>
      <div class="ev-view-right">
        ${y !== curY ? '<button class="sum-now" data-act="ev-year-now">回到今年</button>' : ''}
        <button class="sum-nav" data-act="ev-year-next">›</button>
      </div>
    </div>
    <div class="ev-year-grid">${cells}</div>
    <div class="ev-view-hint">点击月份可跳转到月视图</div>`;
  }

  /* ============ 表单 ============ */
  function openForm(editing) {
    if (formState) return;
    formState = {
      editingId: editing ? editing.id : null,
      title: editing ? editing.title : '',
      date: editing ? editing.date : U.todayStr(),
      time: editing ? (editing.time || '') : currentTimeStr(),
      desc: editing ? (editing.desc || '') : '',
      tags: editing && editing.tags ? editing.tags.slice() : [],
      quickAdding: false,
      quickName: ''
    };
    buildForm();
  }

  function buildForm() {
    const old = document.getElementById('event-form');
    if (old) old.remove();
    const mask = document.createElement('div');
    mask.id = 'event-form';
    mask.className = 'sheet-mask';
    mask.innerHTML = renderForm();
    document.body.appendChild(mask);
    requestAnimationFrame(() => mask.classList.add('show'));
    mask.addEventListener('click', e => { if (e.target === mask) closeForm(); });
    mask.addEventListener('click', onFormClick);
    mask.addEventListener('input', onFormInput);
    setTimeout(() => {
      const input = mask.querySelector('#evTitle');
      if (input && !formState.title) input.focus();
    }, 60);
  }

  function renderForm() {
    const s = formState;
    const data = getData();
    const isEdit = !!s.editingId;

    const tagChips = data.tags.map(t => {
      const c = tagColor(t.color);
      const active = s.tags.includes(t.id);
      return `<button class="ev-tag-pick ${active ? 'active' : ''}"
        data-form-act="pick-tag" data-id="${t.id}"
        style="${active ? `background:${c.bg};color:${c.color};border-color:${c.color}` : ''}">
        ${U.escape(t.name)}
      </button>`;
    }).join('');

    const quickAdd = s.quickAdding ? `
      <div class="ev-tag-quick">
        <input type="text" id="evQuickTag" class="ev-tag-quick-input"
          placeholder="输入标签名，回车确认"
          value="${U.escape(s.quickName)}"
          data-form-act="quick-name">
      </div>` : '';

    const tagSection = `
      <div class="ev-form-section">
        <label class="ev-form-label">标签</label>
        <div class="ev-tag-picker">
          ${tagChips}
          ${!s.quickAdding ? `<button class="ev-tag-add" data-form-act="quick-open">+ 新标签</button>` : ''}
        </div>
        ${quickAdd}
      </div>`;

    return `<div class="sheet-panel ev-form-panel">
      <div class="sheet-handle"></div>
      <div class="ev-form-title">${isEdit ? '编辑事件' : '新增事件'}</div>
      <div class="ev-form-section">
        <label class="ev-form-label">标题</label>
        <input type="text" id="evTitle" class="ev-form-input"
          placeholder="发生了什么？" value="${U.escape(s.title)}"
          data-form-act="set-title">
      </div>
      <div class="ev-form-section">
        <label class="ev-form-label">描述（可选）</label>
        <textarea class="ev-form-textarea" rows="3"
          placeholder="详细说明…"
          data-form-act="set-desc">${U.escape(s.desc)}</textarea>
      </div>
      <div class="ev-form-row">
        <div class="ev-form-section ev-form-half">
          <label class="ev-form-label">日期</label>
          <input type="date" class="ev-form-input"
            value="${U.escape(s.date)}" data-form-act="set-date">
        </div>
        <div class="ev-form-section ev-form-half">
          <label class="ev-form-label">时间</label>
          <input type="time" class="ev-form-input"
            value="${U.escape(s.time)}" data-form-act="set-time">
        </div>
      </div>
      ${tagSection}
      <div class="sheet-footer">
        ${isEdit ? `<button class="btn btn-danger" data-form-act="del">删除</button>` : ''}
        <button class="btn btn-ghost" data-form-act="cancel">取消</button>
        <button class="btn btn-primary sheet-save" data-form-act="save">保存</button>
      </div>
    </div>`;
  }

  function onFormClick(e) {
    const el = e.target.closest('[data-form-act]');
    if (!el) return;
    const act = el.dataset.formAct;
    if (act === 'pick-tag') {
      const id = el.dataset.id;
      if (formState.tags.includes(id)) formState.tags = formState.tags.filter(x => x !== id);
      else formState.tags = formState.tags.concat(id);
      rebuildForm();
      return;
    }
    if (act === 'quick-open') {
      formState.quickAdding = true;
      formState.quickName = '';
      rebuildForm();
      setTimeout(() => {
        const inp = document.getElementById('evQuickTag');
        if (inp) inp.focus();
      }, 30);
      return;
    }
    if (act === 'cancel') { closeForm(); return; }
    if (act === 'del') {
      const id = formState.editingId;
      closeForm();
      UI.confirm('确定删除这条事件吗？').then(ok => {
        if (!ok) return;
        Store.update(KEY, d => {
          d.events = d.events.filter(x => x.id !== id);
          return d;
        });
      });
      return;
    }
    if (act === 'save') { saveForm(); return; }
  }

  function onFormInput(e) {
    const el = e.target.closest('[data-form-act]');
    if (!el) return;
    const act = el.dataset.formAct;
    if (act === 'set-title') formState.title = el.value;
    else if (act === 'set-desc') formState.desc = el.value;
    else if (act === 'set-date') formState.date = el.value;
    else if (act === 'set-time') formState.time = el.value;
    else if (act === 'quick-name') formState.quickName = el.value;
  }

  document.addEventListener('keydown', e => {
    if (!formState || !formState.quickAdding) return;
    if (e.target && e.target.id === 'evQuickTag' && e.key === 'Enter') {
      const name = (e.target.value || '').trim();
      if (!name) return;
      const color = nextColor();
      const newTag = { id: U.uid('t'), name: name, color: color };
      Store.update(KEY, d => {
        d.tags.push(newTag);
        return d;
      });
      formState.tags.push(newTag.id);
      formState.quickAdding = false;
      formState.quickName = '';
      rebuildForm();
    }
  });

  function rebuildForm() {
    const mask = document.getElementById('event-form');
    if (!mask) return;
    mask.innerHTML = renderForm();
  }

  function saveForm() {
    const s = formState;
    const title = (s.title || '').trim();
    if (!title) { UI.toast('请填写标题'); return; }
    const payload = {
      title: title,
      date: s.date || U.todayStr(),
      time: s.time || '',
      desc: (s.desc || '').trim(),
      tags: s.tags.slice()
    };
    Store.update(KEY, d => {
      if (s.editingId) {
        const t = d.events.find(x => x.id === s.editingId);
        if (t) Object.assign(t, payload);
      } else {
        d.events.push({ id: U.uid('e'), ...payload, createdAt: Date.now() });
      }
      return d;
    });
    UI.toast(s.editingId ? '已更新' : '已记录');
    closeForm();
  }

  function closeForm() {
    const mask = document.getElementById('event-form');
    if (!mask) { formState = null; return; }
    mask.classList.remove('show');
    setTimeout(() => {
      if (mask.parentNode) mask.parentNode.removeChild(mask);
      formState = null;
    }, 200);
  }

  /* ============ 标签管理（与之前相同） ============ */
  function openTagManager() {
    if (tagMgr) return;
    tagMgr = { mode: 'list', editingId: null, name: '', color: TAG_COLORS[0].id };
    buildTagManager();
  }
  function buildTagManager() {
    const old = document.getElementById('event-tag-mgr');
    if (old) old.remove();
    const mask = document.createElement('div');
    mask.id = 'event-tag-mgr';
    mask.className = 'sheet-mask';
    mask.innerHTML = renderTagManager();
    document.body.appendChild(mask);
    requestAnimationFrame(() => mask.classList.add('show'));
    mask.addEventListener('click', e => { if (e.target === mask) closeTagManager(); });
    mask.addEventListener('click', onTagMgrClick);
    mask.addEventListener('input', onTagMgrInput);
    setTimeout(() => {
      const inp = mask.querySelector('#tagNameInput');
      if (inp) inp.focus();
    }, 60);
  }
  function renderTagManager() {
    const m = tagMgr;
    const tags = getData().tags;
    if (m.mode === 'list') {
      const rows = tags.length ? tags.map(t => {
        const c = tagColor(t.color);
        return `<div class="tag-mgr-row">
          <span class="tag-mgr-dot" style="background:${c.bg};border-color:${c.color}"></span>
          <span class="tag-mgr-name" style="color:${c.color}">${U.escape(t.name)}</span>
          <button class="btn btn-ghost tag-mgr-btn" data-tag-act="edit" data-id="${t.id}">编辑</button>
          <button class="btn btn-danger tag-mgr-btn" data-tag-act="del" data-id="${t.id}">删除</button>
        </div>`;
      }).join('') : `<div class="empty" style="padding:20px 0">还没有标签</div>`;
      return `<div class="sheet-panel tag-mgr-panel">
        <div class="sheet-handle"></div>
        <div class="ev-form-title">标签管理</div>
        <div class="tag-mgr-list">${rows}</div>
        <div class="sheet-footer">
          <button class="btn btn-ghost" data-tag-act="close">关闭</button>
          <button class="btn btn-primary" data-tag-act="add">+ 新增标签</button>
        </div>
      </div>`;
    }
    const colorPicker = TAG_COLORS.map(c => `
      <button class="color-pick ${m.color === c.id ? 'active' : ''}"
        data-tag-act="pick-color" data-id="${c.id}"
        style="background:${c.bg};color:${c.color};border-color:${m.color === c.id ? c.color : 'transparent'}">
        ${c.id === m.color ? '✓' : ''}
      </button>`).join('');
    return `<div class="sheet-panel tag-mgr-panel">
      <div class="sheet-handle"></div>
      <div class="ev-form-title">${m.mode === 'add' ? '新增标签' : '编辑标签'}</div>
      <div class="ev-form-section">
        <label class="ev-form-label">名称</label>
        <input type="text" id="tagNameInput" class="ev-form-input"
          placeholder="例如：工作" value="${U.escape(m.name)}"
          data-tag-act="set-name">
      </div>
      <div class="ev-form-section">
        <label class="ev-form-label">颜色</label>
        <div class="color-picker">${colorPicker}</div>
      </div>
      <div class="sheet-footer">
        <button class="btn btn-ghost" data-tag-act="back">返回</button>
        <button class="btn btn-primary" data-tag-act="save">保存</button>
      </div>
    </div>`;
  }
  function onTagMgrClick(e) {
    const el = e.target.closest('[data-tag-act]');
    if (!el) return;
    const act = el.dataset.tagAct;
    if (act === 'close') { closeTagManager(); return; }
    if (act === 'add') {
      tagMgr = { mode: 'add', editingId: null, name: '', color: nextColor() };
      rebuildTagManager(); return;
    }
    if (act === 'edit') {
      const t = findTag(el.dataset.id);
      if (!t) return;
      tagMgr = { mode: 'edit', editingId: t.id, name: t.name, color: t.color };
      rebuildTagManager(); return;
    }
    if (act === 'del') {
      const id = el.dataset.id;
      UI.confirm('删除标签后，事件的标签关联也会移除。确定吗？').then(ok => {
        if (!ok) return;
        Store.update(KEY, d => {
          d.tags = d.tags.filter(x => x.id !== id);
          d.events.forEach(ev => { if (ev.tags) ev.tags = ev.tags.filter(t => t !== id); });
          return d;
        });
        rebuildTagManager();
      });
      return;
    }
    if (act === 'pick-color') { tagMgr.color = el.dataset.id; rebuildTagManager(); return; }
    if (act === 'back') {
      tagMgr = { mode: 'list', editingId: null, name: '', color: TAG_COLORS[0].id };
      rebuildTagManager(); return;
    }
    if (act === 'save') {
      const name = (tagMgr.name || '').trim();
      if (!name) { UI.toast('请输入名称'); return; }
      const m = tagMgr;
      Store.update(KEY, d => {
        if (m.mode === 'edit') {
          const t = d.tags.find(x => x.id === m.editingId);
          if (t) { t.name = name; t.color = m.color; }
        } else {
          d.tags.push({ id: U.uid('t'), name: name, color: m.color });
        }
        return d;
      });
      tagMgr = { mode: 'list', editingId: null, name: '', color: TAG_COLORS[0].id };
      rebuildTagManager(); return;
    }
  }
  function onTagMgrInput(e) {
    const el = e.target.closest('[data-tag-act]');
    if (!el) return;
    if (el.dataset.tagAct === 'set-name') tagMgr.name = el.value;
  }
  function rebuildTagManager() {
    const mask = document.getElementById('event-tag-mgr');
    if (!mask) return;
    mask.innerHTML = renderTagManager();
    setTimeout(() => {
      const inp = mask.querySelector('#tagNameInput');
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }, 30);
  }
  function closeTagManager() {
    const mask = document.getElementById('event-tag-mgr');
    if (!mask) { tagMgr = null; return; }
    mask.classList.remove('show');
    setTimeout(() => {
      if (mask.parentNode) mask.parentNode.removeChild(mask);
      tagMgr = null;
    }, 200);
  }
})();