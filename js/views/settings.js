(function (global) {
  const SettingsView = {
render() {
  const themeCard = `
    <div class="card">
      <div class="card-head"><span class="card-title">主题颜色</span></div>
      <div class="theme-grid">
        ${Theme.all().map(t => `
          <button class="theme-item ${Theme.currentId() === t.id ? 'active' : ''}"
            data-act="theme-pick" data-id="${t.id}" title="${U.escape(t.name)}">
            <span class="theme-dot" style="background:${t.swatch}"></span>
            <span class="theme-name">${U.escape(t.name)}</span>
            ${Theme.currentId() === t.id ? '<span class="theme-check">✓</span>' : ''}
          </button>
        `).join('')}
      </div>
    </div>`;

  return `<div class="settings">
    ${themeCard}
    <div class="card">
      <div class="card-head"><span class="card-title">数据备份</span></div>
      <p class="muted">所有数据保存在本机浏览器，换设备或清缓存前请先导出。</p>
      <div class="btn-row">
        <button class="btn btn-primary" data-act="export">导出 JSON</button>
        <button class="btn btn-ghost" data-act="import">导入 JSON</button>
        <button class="btn btn-danger" data-act="clear">清空全部</button>
      </div>
      <input type="file" id="importFile" accept="application/json" data-act="file-chosen" hidden>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-title">关于</span></div>
      <p class="muted">纯前端 · localStorage · 哈希路由 · 无需服务器</p>
    </div>
  </div>`;
},

    mounted() {},

    handleAction(act, el) {
      if (act === 'theme-pick') {
    Theme.set(el.dataset.id);
    return true;
  }
      if (act === 'export') {
        const blob = new Blob([Store.exportAll()], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'daily-backup-' + U.todayStr() + '.json';
        a.click();
        URL.revokeObjectURL(url);
        return true;
      }

      if (act === 'import') {
        const f = document.getElementById('importFile');
        if (f) f.click();
        return true;
      }

      if (act === 'file-chosen') {
        const file = el.files && el.files[0];
        if (!file) return true;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            Store.importAll(reader.result);
            UI.toast('导入成功');
          } catch (err) {
            alert('导入失败：' + err.message);
          }
          el.value = '';
        };
        reader.readAsText(file);
        return true;
      }

      if (act === 'clear') {
        UI.confirm('将清空所有本地数据，且无法恢复，确定吗？').then(ok => {
          if (!ok) return;
          Store.clearAll();
          UI.toast('已清空');
        });
        return true;
      }

      return false;
    }
  };
  global.SettingsView = SettingsView;
})(window);