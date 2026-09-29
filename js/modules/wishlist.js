(function () {
  const KEY = 'wishlist';

  /* ============ 状态 ============ */
  let viewYear = null;
  let filterText = '';
  let filterStatus = 'all';   // all | todo | done
  let importState = null;

  /* ============ 数据层 ============ */
  function getData() {
    const d = Store.ensure(KEY, () => ({ wishes: [] }));
    if (!Array.isArray(d.wishes)) d.wishes = [];
    return d;
  }
  function thisYear() { return new Date().getFullYear(); }
  function getViewYear() {
    if (!viewYear) viewYear = thisYear();
    return viewYear;
  }
  function wishesOf(year) {
    return getData().wishes.filter(w => w.year === year);
  }
  function sortedWishes(year) {
    return wishesOf(year).slice().sort((a, b) => {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
  }
  function applyFilter(list) {
    let r = list;
    if (filterStatus === 'todo') r = r.filter(w => !w.done);
    else if (filterStatus === 'done') r = r.filter(w => w.done);
    if (filterText) {
      const q = filterText.toLowerCase();
      r = r.filter(w => (w.text || '').toLowerCase().includes(q));
    }
    return r;
  }

  /* ============ AI 导入解析 ============ */
  function parseImportText(text) {
    if (!text) return [];
    return text.split(/\r?\n/)
      .map(line => {
        let s = line.trim();
        // 去掉 markdown 标题
        s = s.replace(/^#+\s*/, '');
        // 去掉序号/列表前缀
        s = s.replace(/^(?:\d+[\.\)、:：]\s*|\(\d+\)\s*|[-*•·]\s*)/, '');
        return s.trim();
      })
      .filter(s => s.length > 0 && s.length < 200);
  }

  /* ============ 注册模块 ============ */
  Registry.register({
    id: 'wishlist',
    name: '年度愿望',
    icon: '⭐',
    order: 35,
    storageKey: KEY,

    /* ---------- 主页卡片 ---------- */
    homeCard() {
      const y = thisYear();
      const list = wishesOf(y);
      if (!list.length) {
        return `<div class="card">
          <div class="card-head">
            <span class="card-icon">⭐</span>
            <span class="card-title">${y} 年愿望</span>
            <a class="card-more" href="#wishlist">去添加 ›</a>
          </div>
          <div class="card-empty">还没有愿望，点进去开始 ✨</div>
        </div>`;
      }
      const done = list.filter(w => w.done).length;
      const pct = Math.round(done / list.length * 100);
      const preview = list.filter(w => !w.done).slice(0, 2);
      const rows = preview.length ? preview.map(w => `
        <div class="wish-home-item">
          <span class="wish-home-dot"></span>
          <span class="wish-home-text">${U.escape(w.text)}</span>
        </div>
      `).join('') : '<div class="wish-home-empty">所有愿望都已完成 🎉</div>';

      return `<div class="card">
        <div class="card-head">
          <span class="card-icon">⭐</span>
          <span class="card-title">${y} 年愿望</span>
          <span class="card-sub">${done}/${list.length} 已完成</span>
          <a class="card-more" href="#wishlist">详情 ›</a>
        </div>
        <div class="wish-home-progress"><i style="width:${pct}%"></i></div>
        <div class="wish-home-list">${rows}</div>
      </div>`;
    },

    /* ---------- 模块页面 ---------- */
    page() { return renderPage(); },

    /* ---------- 事件分发 ---------- */
    handleAction(act, el, ctx, type) {
      /* 年份切换 */
      if (act === 'wish-prev-year' || act === 'wish-next-year') {
        const y = getViewYear() + (act === 'wish-prev-year' ? -1 : 1);
        if (y < 2000 || y > 2100) return true;
        viewYear = y;
        filterText = '';
        filterStatus = 'all';
        ctx.refresh();
        return true;
      }
      if (act === 'wish-now-year') {
        viewYear = thisYear();
        ctx.refresh();
        return true;
      }

      /* 新增 / 编辑 / 删除 */
      if (act === 'wish-add') { openWishForm(null); return true; }
      if (act === 'wish-edit') {
        const w = getData().wishes.find(x => x.id === el.dataset.id);
        if (w) openWishForm(w);
        return true;
      }
      if (act === 'wish-del') {
        const id = el.dataset.id;
        UI.confirm('删除这条愿望？').then(ok => {
          if (!ok) return;
          Store.update(KEY, d => {
            d.wishes = d.wishes.filter(x => x.id !== id);
            return d;
          });
        });
        return true;
      }

      /* 打钩 */
      if (act === 'wish-toggle') {
        const id = el.dataset.id;
        Store.update(KEY, d => {
          const w = d.wishes.find(x => x.id === id);
          if (w) {
            w.done = !w.done;
            w.doneAt = w.done ? Date.now() : null;
          }
          return d;
        });
        return true;
      }

      /* 状态筛选 */
      if (act === 'wish-filter-status') {
        filterStatus = el.dataset.status;
        ctx.refresh();
        return true;
      }

      /* 搜索：只更新列表，保焦点 */
      if (act === 'wish-search') {
        filterText = el.value || '';
        const container = document.getElementById('wish-list-container');
        if (container) {
          const y = getViewYear();
          const all = wishesOf(y);
          container.innerHTML = renderList(applyFilter(sortedWishes(y)), all.length);
        }
        return true;
      }

      /* 导入 */
      if (act === 'wish-import') { openImport(); return true; }
      if (act === 'wish-import-confirm') { confirmImport(); return true; }
      if (act === 'wish-import-cancel') { closeImport(); return true; }

      /* 年度报告 */
      if (act === 'wish-report') { openReport(getViewYear()); return true; }

      return false;
    }
  });

  /* ============ 主页面 ============ */
  function renderPage() {
    const y = getViewYear();
    const cur = thisYear();
    const isCurrent = y === cur;
    const all = wishesOf(y);
    const filtered = applyFilter(sortedWishes(y));
    const doneCount = all.filter(w => w.done).length;
    const pct = all.length ? Math.round(doneCount / all.length * 100) : 0;

    const head = `
      <div class="wish-page-head">
        <span class="wish-page-title">年度愿望</span>
        <div class="wish-head-actions">
          <button class="wish-head-btn" data-act="wish-report">📊 报告</button>
          <button class="wish-head-btn" data-act="wish-import">✨ 导入</button>
        </div>
      </div>`;

    const yearNav = `
      <div class="wish-year-nav">
        <button class="sum-nav" data-act="wish-prev-year">‹</button>
        <span class="wish-year-title">
          ${y} 年
          ${isCurrent ? '<span class="sum-now-tag">当前</span>' : ''}
        </span>
        <div class="wish-year-right">
          ${!isCurrent ? '<button class="sum-now" data-act="wish-now-year">回到今年</button>' : ''}
          <button class="sum-nav" data-act="wish-next-year">›</button>
        </div>
      </div>`;

    const progressCard = all.length ? `
      <div class="wish-progress-card">
        <div class="wish-progress-head">
          <span class="wish-progress-label">完成进度</span>
          <span class="wish-progress-pct">${doneCount} / ${all.length} · ${pct}%</span>
        </div>
        <div class="wish-progress-bar"><i style="width:${pct}%"></i></div>
      </div>` : '';

    const filterBar = `
      <div class="wish-filter-bar">
        <input type="text" class="wish-search" placeholder="🔍 搜索关键词…"
          value="${U.escape(filterText)}" data-act="wish-search">
      </div>
      <div class="wish-status-bar">
        <button class="wish-filter-btn ${filterStatus === 'all' ? 'active' : ''}"
          data-act="wish-filter-status" data-status="all">全部</button>
        <button class="wish-filter-btn ${filterStatus === 'todo' ? 'active' : ''}"
          data-act="wish-filter-status" data-status="todo">未完成</button>
        <button class="wish-filter-btn ${filterStatus === 'done' ? 'active' : ''}"
          data-act="wish-filter-status" data-status="done">已完成</button>
      </div>`;

    return `<div class="module wish-module">
      ${head}
      ${yearNav}
      ${progressCard}
      ${filterBar}
      <div id="wish-list-container">${renderList(filtered, all.length)}</div>
      <button class="fab" data-act="wish-add" aria-label="新增愿望">+</button>
    </div>`;
  }

  function renderList(list, total) {
    if (!list.length) {
      return `<div class="empty" style="padding:40px 16px">
        ${total ? '当前筛选下没有愿望' : '这一年还没有愿望，点击右下角开始'}
        <br>
        <button class="btn btn-primary" data-act="wish-add" style="margin-top:14px">+ 新增愿望</button>
      </div>`;
    }
    const rows = list.map(w => `
      <div class="wish-item ${w.done ? 'done' : ''}">
        <button class="wish-check" data-act="wish-toggle" data-id="${w.id}">
          ${w.done ? '✓' : ''}
        </button>
        <div class="wish-text" data-act="wish-edit" data-id="${w.id}">${U.escape(w.text)}</div>
        <button class="wish-del" data-act="wish-del" data-id="${w.id}">×</button>
      </div>
    `).join('');
    return `<div class="wish-list">${rows}</div>`;
  }

  /* ============ 新增/编辑弹窗 ============ */
  function openWishForm(editing) {
    const y = getViewYear();
    UI.form(editing ? '编辑愿望' : '新增愿望', [
      { name: 'text', label: '愿望内容', type: 'textarea', required: true,
        value: editing ? editing.text : '', placeholder: '例如：学会游泳' },
      { name: 'year', label: '年份', type: 'number',
        value: editing ? editing.year : y, required: true }
    ]).then(r => {
      if (!r) return;
      const text = (r.text || '').trim();
      if (!text) return;
      const yr = Math.max(2000, Math.min(2100, Number(r.year) || y));
      Store.update(KEY, d => {
        if (editing) {
          const t = d.wishes.find(x => x.id === editing.id);
          if (t) { t.text = text; t.year = yr; }
        } else {
          d.wishes.push({
            id: U.uid('w'),
            text: text,
            year: yr,
            done: false,
            doneAt: null,
            createdAt: Date.now()
          });
        }
        return d;
      });
    });
  }

  /* ============ AI 批量导入 ============ */
  function openImport() {
    if (importState) return;
    importState = { text: '' };
    buildImport();
  }

  function buildImport() {
    const old = document.getElementById('wish-import');
    if (old) old.remove();

    const mask = document.createElement('div');
    mask.id = 'wish-import';
    mask.className = 'sheet-mask';
    mask.innerHTML = renderImport();
    document.body.appendChild(mask);
    requestAnimationFrame(() => mask.classList.add('show'));

    mask.addEventListener('click', e => {
      if (e.target === mask) closeImport();
    });
    mask.addEventListener('click', onImportClick);
    mask.addEventListener('input', onImportInput);

    setTimeout(() => {
      const ta = mask.querySelector('#wishImportText');
      if (ta) ta.focus();
    }, 60);
  }

  function renderImport() {
    return `<div class="sheet-panel wish-import-panel">
      <div class="sheet-handle"></div>
      <div class="ev-form-title">✨ 批量导入愿望</div>
      <div class="wish-import-hint">
        每行一条。支持 <code>1. 内容</code> <code>- 内容</code> <code>• 内容</code> 等格式，会自动清理。
        也可以把 AI 生成的内容整段粘贴进来。
      </div>
      <textarea id="wishImportText" class="ev-form-textarea wish-import-textarea"
        placeholder="粘贴内容…&#10;例如：&#10;1. 学会游泳&#10;2. 读 20 本书&#10;3. 带爸妈去旅行"
        data-import-act="set-text"></textarea>
      <div class="wish-import-count" id="wishImportCount"></div>
      <div class="wish-import-preview" id="wishImportPreview"></div>
      <div class="sheet-footer">
        <button class="btn btn-ghost" data-import-act="cancel">取消</button>
        <button class="btn btn-primary" data-import-act="confirm" id="wishImportConfirm">导入</button>
      </div>
    </div>`;
  }

  function updateImportPreview() {
    const s = importState || { text: '' };
    const lines = parseImportText(s.text);
    const countEl = document.getElementById('wishImportCount');
    const previewEl = document.getElementById('wishImportPreview');
    const btnEl = document.getElementById('wishImportConfirm');

    if (countEl) {
      countEl.innerHTML = lines.length
        ? `已识别 <strong>${lines.length}</strong> 条${lines.length > 10 ? '（预览前 10 条）' : ''}`
        : '粘贴内容后自动识别';
    }
    if (previewEl) {
      const preview = lines.slice(0, 10).map(l => `<div class="wish-import-preview-item">· ${U.escape(l)}</div>`).join('');
      const more = lines.length > 10 ? `<div class="wish-import-more">…还有 ${lines.length - 10} 条</div>` : '';
      previewEl.innerHTML = preview + more;
    }
    if (btnEl) {
      btnEl.disabled = !lines.length;
      btnEl.textContent = lines.length ? `导入 ${lines.length} 条` : '导入';
    }
  }

  function onImportInput(e) {
    const el = e.target;
    if (!el || el.id !== 'wishImportText') return;
    if (!importState) return;
    importState.text = el.value;
    updateImportPreview();
  }

  function onImportClick(e) {
    const el = e.target.closest('[data-import-act]');
    if (!el) return;
    const act = el.dataset.importAct;
    if (act === 'cancel') { closeImport(); return; }
    if (act === 'confirm') { confirmImport(); return; }
  }

  function confirmImport() {
    const lines = parseImportText(importState ? importState.text : '');
    if (!lines.length) { UI.toast('没有可导入的内容'); return; }
    const year = getViewYear();
    Store.update(KEY, d => {
      lines.forEach(text => {
        d.wishes.push({
          id: U.uid('w'),
          text: text,
          year: year,
          done: false,
          doneAt: null,
          createdAt: Date.now()
        });
      });
      return d;
    });
    UI.toast('已导入 ' + lines.length + ' 条');
    closeImport();
  }

  function closeImport() {
    const mask = document.getElementById('wish-import');
    if (!mask) { importState = null; return; }
    mask.classList.remove('show');
    setTimeout(() => {
      if (mask.parentNode) mask.parentNode.removeChild(mask);
      importState = null;
    }, 200);
  }

  /* ============ 年度报告 ============ */
  function openReport(year) {
    const old = document.getElementById('wish-report');
    if (old) old.remove();

    const mask = document.createElement('div');
    mask.id = 'wish-report';
    mask.className = 'modal-mask';
    mask.innerHTML = renderReport(year);
    document.body.appendChild(mask);
    requestAnimationFrame(() => mask.classList.add('show'));

    mask.addEventListener('click', e => {
      if (e.target === mask || e.target.closest('[data-report-close]')) {
        mask.classList.remove('show');
        setTimeout(() => {
          if (mask.parentNode) mask.parentNode.removeChild(mask);
        }, 200);
      }
    });
  }

  function renderReport(year) {
    const list = wishesOf(year);
    if (!list.length) {
      return `<div class="modal-box wish-report-box">
        <div class="modal-title">${year} 年度报告</div>
        <div class="modal-body"><div class="empty">这一年还没有愿望</div></div>
        <div class="modal-foot">
          <button class="btn btn-primary" data-report-close>关闭</button>
        </div>
      </div>`;
    }

    const done = list.filter(w => w.done);
    const undone = list.filter(w => !w.done);
    const pct = Math.round(done.length / list.length * 100);

    const doneHtml = done.length ? done.map(w => `
      <div class="report-row done">
        <span class="report-check">✓</span>
        <span>${U.escape(w.text)}</span>
      </div>
    `).join('') : '<div class="report-empty">没有完成的愿望</div>';

    const undoneHtml = undone.length ? undone.map(w => `
      <div class="report-row undone">
        <span class="report-check">○</span>
        <span>${U.escape(w.text)}</span>
      </div>
    `).join('') : '<div class="report-empty">全部完成 🎉</div>';

    return `<div class="modal-box wish-report-box">
      <div class="modal-title">${year} 年度报告</div>
      <div class="modal-body">
        <div class="report-hero">
          <div class="report-pct">${pct}%</div>
          <div class="report-sub">${done.length} / ${list.length} 个愿望已完成</div>
        </div>
        <div class="report-section-title">✅ 已完成的愿望</div>
        <div class="report-list">${doneHtml}</div>
        <div class="report-section-title">⭕ 未完成的愿望</div>
        <div class="report-list">${undoneHtml}</div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-primary" data-report-close>关闭</button>
      </div>
    </div>`;
  }
})();