(function () {
  const KEY = 'checkin';

  /* ============ 状态 ============ */
  // 默认就是未完成，用户从主页/侧边栏进来第一眼看到的就是未签的
  let viewFilter = 'todo';
  let _lastHash = '';   // 用于检测是否从其他模块进入

  /* ============ 数据层 ============ */
  function getData() {
    const d = Store.ensure(KEY, () => ({ games: [] }));
    if (!Array.isArray(d.games)) d.games = [];
    return d;
  }
  function todayStr() { return U.todayStr(); }

  function isChecked(acc, date) {
    return !!(acc.records && acc.records[date]);
  }

  function toggleCheck(gameId, accId) {
    const date = todayStr();
    const updater = Store.updateSilent || Store.update;
    updater.call(Store, KEY, data => {
      const g = data.games.find(x => x.id === gameId);
      if (!g) return data;
      const a = g.accounts.find(x => x.id === accId);
      if (!a) return data;
      if (!a.records) a.records = {};
      if (a.records[date]) delete a.records[date];
      else a.records[date] = true;
      return data;
    });
  }

  function todayStats() {
    const data = getData();
    const today = todayStr();
    let total = 0, done = 0;
    data.games.forEach(g => {
      (g.accounts || []).forEach(a => {
        total++;
        if (isChecked(a, today)) done++;
      });
    });
    return { total, done };
  }
  function gameStats(g) {
    const today = todayStr();
    const total = (g.accounts || []).length;
    const done = (g.accounts || []).filter(a => isChecked(a, today)).length;
    return { total, done };
  }

  /* ============ 注册模块 ============ */
  Registry.register({
    id: 'checkin',
    name: '游戏签到',
    icon: '🎮',
    order: 45,
    storageKey: KEY,

    /* ---------------- 主页卡片：只显示未完成 ---------------- */
    homeCard() {
      const data = getData();
      const today = todayStr();

      if (!data.games.length) {
        return `<div class="card">
          <div class="card-head">
            <span class="card-icon">🎮</span>
            <span class="card-title">游戏签到</span>
            <a class="card-more" href="#checkin">去添加 ›</a>
          </div>
          <div class="card-empty">还没有游戏，点击右上角添加</div>
        </div>`;
      }

      // 收集未完成的账户
      const pending = [];
      data.games.forEach(g => {
        (g.accounts || []).forEach(a => {
          if (!isChecked(a, today)) {
            pending.push({ game: g, acc: a });
          }
        });
      });

      const totalAccs = data.games.reduce((s, g) => s + (g.accounts || []).length, 0);
      const doneAccs = totalAccs - pending.length;

      // 全部签完
      if (pending.length === 0) {
        return `<div class="card">
          <div class="card-head">
            <span class="card-icon">🎮</span>
            <span class="card-title">游戏签到</span>
            <span class="card-sub">${doneAccs}/${totalAccs}</span>
            <a class="card-more" href="#checkin">详情 ›</a>
          </div>
          <div class="ck-home-all-done">今天都签完啦 🎉</div>
        </div>`;
      }

      // 主页最多显示 5 条，避免卡片太长
      const shown = pending.slice(0, 5);
      const remain = pending.length - shown.length;

      const rows = shown.map(({ game, acc }) => `
        <div class="ck-home-row" data-act="ck-toggle" data-module="checkin"
          data-game-id="${game.id}" data-acc-id="${acc.id}">
          <span class="ck-home-icon">${U.escape(game.icon || '🎮')}</span>
          <span class="ck-home-name">
            ${U.escape(game.name)}
            <span class="ck-home-sep">·</span>
            <span class="ck-home-acc">${U.escape(acc.name)}</span>
          </span>
          <span class="ck-home-check"></span>
        </div>
      `).join('');

      return `<div class="card">
        <div class="card-head">
          <span class="card-icon">🎮</span>
          <span class="card-title">游戏签到</span>
          <span class="card-sub">${doneAccs}/${totalAccs}</span>
          <a class="card-more" href="#checkin">详情 ›</a>
        </div>
        <div class="ck-home-list">${rows}</div>
        ${remain > 0 ? `<a class="ck-home-more" href="#checkin">还有 ${remain} 个未签 ›</a>` : ''}
      </div>`;
    },

    /* ---------------- 模块页面 ---------------- */
    page(ctx) {
      // 检测是否从其他模块进入：hash 变化时重置为"未完成"
      const curHash = (location.hash || '#home').split('/')[0];
      if (_lastHash !== curHash) {
        viewFilter = 'todo';
        _lastHash = curHash;
      }
      return renderPage();
    },

    /* ---------------- 事件处理 ---------------- */
    handleAction(act, el, ctx) {
      if (act === 'ck-filter') {
        viewFilter = el.dataset.filter;
        ctx.refresh();
        return true;
      }
      if (act === 'ck-add-game') { openGameForm(null); return true; }

      if (act === 'ck-game-menu') {
        openGameMenu(el.dataset.id);
        return true;
      }

      if (act === 'ck-add-acc') {
        openAccForm(el.dataset.gameId, null);
        return true;
      }

      if (act === 'ck-acc-menu') {
        openAccMenu(el.dataset.gameId, el.dataset.accId);
        return true;
      }

      /* 打卡切换：兼容 主页行 / 紧凑视图行 / 卡片视图行 */
      if (act === 'ck-toggle') {
        const { gameId, accId } = el.dataset;
        toggleCheck(gameId, accId);

        const date = todayStr();
        const g = getData().games.find(x => x.id === gameId);
        const a = g && g.accounts.find(x => x.id === accId);
        const checked = a && isChecked(a, date);

        /* 1. 主页卡片行：淡出移除 */
        const homeRow = el.closest('.ck-home-row');
        if (homeRow) {
          homeRow.style.transition = 'opacity .2s ease, height .25s ease, padding .25s ease';
          homeRow.style.opacity = '0';
          homeRow.style.height = '0';
          homeRow.style.paddingTop = '0';
          homeRow.style.paddingBottom = '0';
          setTimeout(() => {
            homeRow.remove();
            // 如果主页卡片剩下的未完成行都空了，给个"都完成"的提示
            const list = homeRow.parentNode;
            if (list && list.classList.contains('ck-home-list') && list.children.length === 0) {
              const card = list.closest('.card');
              if (card) {
                const allDone = document.createElement('div');
                allDone.className = 'ck-home-all-done';
                allDone.textContent = '今天都签完啦 🎉';
                list.replaceWith(allDone);
              }
            }
          }, 280);
          return true;
        }

        /* 2. 模块页紧凑视图：淡出移除 */
        const compactRow = el.closest('.ck-compact-row');
        if (compactRow) {
          compactRow.classList.add('checked');
          const check = compactRow.querySelector('.ck-compact-check');
          if (check) check.textContent = '✓';
          setTimeout(() => {
            compactRow.style.transition = 'opacity .22s ease, height .25s ease, margin .25s ease, padding .25s ease';
            compactRow.style.opacity = '0';
            compactRow.style.height = '0';
            compactRow.style.marginBottom = '0';
            compactRow.style.paddingTop = '0';
            compactRow.style.paddingBottom = '0';
            setTimeout(() => {
              compactRow.remove();
              const remain = document.querySelectorAll('.ck-compact-row').length;
              if (remain === 0) {
                const list = document.querySelector('.ck-compact-list');
                if (list) {
                  list.outerHTML = `<div class="empty" data-emoji="✨">今天的签到都完成啦</div>`;
                }
              }
            }, 260);
          }, 220);
          return true;
        }

        /* 3. 模块页卡片视图：行内状态更新 */
        const row = el.closest('.ck-acc-row');
        if (row) {
          row.classList.toggle('checked', checked);
          const mark = row.querySelector('.ck-check');
          if (mark) mark.textContent = checked ? '✓' : '';
          const status = row.querySelector('.ck-status');
          if (status) status.textContent = checked ? '已签' : '未签';
        }
        if (g) {
          const s = gameStats(g);
          const countEl = document.querySelector(`[data-game-count="${gameId}"]`);
          if (countEl) {
            countEl.textContent = `${s.done}/${s.total}`;
            countEl.classList.toggle('done', s.done === s.total && s.total > 0);
          }
        }
        return true;
      }

      return false;
    }
  });

  /* ============ 页面渲染 ============ */
  function renderPage() {
    const data = getData();

    const head = `
      <div class="ck-page-head">
        <span class="ck-page-title">游戏签到</span>
        <button class="btn btn-primary ck-add-btn" data-act="ck-add-game">+ 添加游戏</button>
      </div>`;

    const filterBar = `
      <div class="tabs ck-tabs">
        <button class="tab ${viewFilter === 'todo' ? 'active' : ''}" data-act="ck-filter" data-filter="todo">今日未完成</button>
        <button class="tab ${viewFilter === 'all' ? 'active' : ''}" data-act="ck-filter" data-filter="all">全部</button>
      </div>`;

    if (!data.games.length) {
      return `<div class="module checkin-module">
        ${head}
        ${filterBar}
        <div class="empty" data-emoji="🎮">
          还没有添加游戏<br>
          <button class="btn btn-primary" data-act="ck-add-game" style="margin-top:12px">+ 添加游戏</button>
        </div>
      </div>`;
    }

    /* -------- 未完成：紧凑列表 -------- */
    if (viewFilter === 'todo') {
      const pending = [];
      data.games.forEach(g => {
        (g.accounts || []).forEach(a => {
          if (!isChecked(a, todayStr())) {
            pending.push({ game: g, acc: a });
          }
        });
      });

      const listHtml = pending.length
        ? `<div class="ck-compact-list">
            ${pending.map(({ game, acc }) => `
              <div class="ck-compact-row" data-act="ck-toggle"
                data-game-id="${game.id}" data-acc-id="${acc.id}">
                <span class="ck-compact-icon">${U.escape(game.icon || '🎮')}</span>
                <span class="ck-compact-name">
                  ${U.escape(game.name)}
                  <span class="ck-compact-sep">·</span>
                  <span class="ck-compact-acc">${U.escape(acc.name)}</span>
                </span>
                <span class="ck-compact-check"></span>
              </div>
            `).join('')}
          </div>`
        : `<div class="empty" data-emoji="✨">今天的签到都完成啦</div>`;

      return `<div class="module checkin-module">
        ${head}
        ${filterBar}
        ${listHtml}
      </div>`;
    }

    /* -------- 全部：卡片视图 -------- */
    const cardsHtml = data.games.map(g => renderGameCard(g)).join('');

    return `<div class="module checkin-module">
      ${head}
      ${filterBar}
      <div class="ck-list">${cardsHtml}</div>
    </div>`;
  }

  function renderGameCard(g) {
    const today = todayStr();
    const s = gameStats(g);
    const allDone = s.total > 0 && s.done === s.total;

    const accRows = (g.accounts && g.accounts.length)
      ? g.accounts.map(a => {
          const checked = isChecked(a, today);
          return `<div class="ck-acc-row ${checked ? 'checked' : ''}"
            data-act="ck-toggle" data-game-id="${g.id}" data-acc-id="${a.id}">
            <span class="ck-check">${checked ? '✓' : ''}</span>
            <span class="ck-acc-name">${U.escape(a.name)}</span>
            <span class="ck-status">${checked ? '已签' : '未签'}</span>
            <button class="ck-acc-menu" data-act="ck-acc-menu"
              data-game-id="${g.id}" data-acc-id="${a.id}">⋯</button>
          </div>`;
        }).join('')
      : `<div class="ck-empty-hint">还没有账户，点下方按钮添加</div>`;

    return `<div class="ck-card">
      <div class="ck-card-head">
        <span class="ck-icon">${U.escape(g.icon || '🎮')}</span>
        <span class="ck-name">${U.escape(g.name)}</span>
        <span class="ck-count ${allDone ? 'done' : ''}" data-game-count="${g.id}">${s.done}/${s.total}</span>
        <button class="ck-game-menu" data-act="ck-game-menu" data-id="${g.id}">⋯</button>
      </div>
      <div class="ck-acc-list">
        ${accRows}
        <button class="ck-add-acc" data-act="ck-add-acc" data-game-id="${g.id}">+ 添加账户</button>
      </div>
    </div>`;
  }

  /* ============ 游戏表单 ============ */
  function openGameForm(editing) {
    UI.form(editing ? '编辑游戏' : '添加游戏', [
      { name: 'name', label: '游戏名称', required: true, placeholder: '例如：原神' },
      { name: 'icon', label: '图标（emoji）', value: editing ? editing.icon : '🎮' }
    ]).then(r => {
      if (!r) return;
      const name = (r.name || '').trim();
      if (!name) return;
      Store.update(KEY, d => {
        if (editing) {
          const g = d.games.find(x => x.id === editing.id);
          if (g) { g.name = name; g.icon = r.icon || '🎮'; }
        } else {
          d.games.push({
            id: U.uid('g'),
            name,
            icon: r.icon || '🎮',
            accounts: []
          });
        }
        return d;
      });
    });
  }

  /* ============ 账户表单 ============ */
  function openAccForm(gameId, editing) {
    UI.form(editing ? '编辑账户' : '添加账户', [
      { name: 'name', label: '账户名称', required: true,
        value: editing ? editing.name : '',
        placeholder: '例如：主号 / 小号 / 亚服' }
    ]).then(r => {
      if (!r) return;
      const name = (r.name || '').trim();
      if (!name) return;
      Store.update(KEY, d => {
        const g = d.games.find(x => x.id === gameId);
        if (!g) return d;
        if (!g.accounts) g.accounts = [];
        if (editing) {
          const a = g.accounts.find(x => x.id === editing.id);
          if (a) a.name = name;
        } else {
          g.accounts.push({
            id: U.uid('a'),
            name,
            records: {}
          });
        }
        return d;
      });
    });
  }

  /* ============ 游戏菜单 ============ */
  function openGameMenu(gameId) {
    const g = getData().games.find(x => x.id === gameId);
    if (!g) return;

    const old = document.getElementById('ckMenu');
    if (old) old.remove();

    const mask = document.createElement('div');
    mask.id = 'ckMenu';
    mask.className = 'ck-menu-mask';
    mask.innerHTML = `
      <div class="ck-menu">
        <div class="ck-menu-title">${U.escape(g.name)}</div>
        <button class="ck-menu-btn" data-menu-act="edit-game">
          <span class="ck-menu-icon">✏️</span>编辑游戏
        </button>
        <button class="ck-menu-btn" data-menu-act="add-acc">
          <span class="ck-menu-icon">➕</span>添加账户
        </button>
        <button class="ck-menu-btn danger" data-menu-act="del-game">
          <span class="ck-menu-icon">🗑️</span>删除游戏
        </button>
        <button class="ck-menu-cancel" data-menu-act="cancel">取消</button>
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
        if (act === 'edit-game') {
          const gg = getData().games.find(x => x.id === gameId);
          if (gg) openGameForm(gg);
        } else if (act === 'add-acc') {
          openAccForm(gameId, null);
        } else if (act === 'del-game') {
          UI.confirm(`确定删除「${g.name}」及其所有账户吗？`).then(ok => {
            if (!ok) return;
            Store.update(KEY, d => {
              d.games = d.games.filter(x => x.id !== gameId);
              return d;
            });
          });
        }
      }, 220);
    });

    function close() {
      mask.classList.remove('show');
      setTimeout(() => {
        if (mask.parentNode) mask.parentNode.removeChild(mask);
      }, 220);
    }
  }

  /* ============ 账户菜单 ============ */
  function openAccMenu(gameId, accId) {
    const g = getData().games.find(x => x.id === gameId);
    if (!g) return;
    const a = g.accounts.find(x => x.id === accId);
    if (!a) return;

    const old = document.getElementById('ckMenu');
    if (old) old.remove();

    const mask = document.createElement('div');
    mask.id = 'ckMenu';
    mask.className = 'ck-menu-mask';
    mask.innerHTML = `
      <div class="ck-menu">
        <div class="ck-menu-title">${U.escape(a.name)}</div>
        <button class="ck-menu-btn" data-menu-act="edit-acc">
          <span class="ck-menu-icon">✏️</span>编辑名称
        </button>
        <button class="ck-menu-btn danger" data-menu-act="del-acc">
          <span class="ck-menu-icon">🗑️</span>删除账户
        </button>
        <button class="ck-menu-cancel" data-menu-act="cancel">取消</button>
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
        if (act === 'edit-acc') {
          const gg = getData().games.find(x => x.id === gameId);
          const aa = gg && gg.accounts.find(x => x.id === accId);
          if (aa) openAccForm(gameId, aa);
        } else if (act === 'del-acc') {
          UI.confirm(`删除账户「${a.name}」？`).then(ok => {
            if (!ok) return;
            Store.update(KEY, d => {
              const gg = d.games.find(x => x.id === gameId);
              if (gg) gg.accounts = gg.accounts.filter(x => x.id !== accId);
              return d;
            });
          });
        }
      }, 220);
    });

    function close() {
      mask.classList.remove('show');
      setTimeout(() => {
        if (mask.parentNode) mask.parentNode.removeChild(mask);
      }, 220);
    }
  }
})();