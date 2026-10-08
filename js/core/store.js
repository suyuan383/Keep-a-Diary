(function (global) {
  const PREFIX = (global.APP_CONFIG && global.APP_CONFIG.storagePrefix) || 'app_v1_';
  const KEY_DB = PREFIX + 'db';

  let DB = null;
  let saveTimer = null;

  function writeToDisk() {
    try {
      localStorage.setItem(KEY_DB, JSON.stringify(DB));
    } catch (e) {
      console.error('[store] 保存失败', e);
      alert('保存失败，可能是存储空间已满');
    }
  }

  function save() {
    writeToDisk();
    // 合并多次保存只广播一次
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => Bus.emit('store:change', DB), 0);
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY_DB);
      DB = raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error('[store] 解析失败，已重置', e);
      DB = {};
    }
    if (!DB || typeof DB !== 'object') DB = {};
  }

  const Store = {
    init() { load(); return DB; },
    raw() { return DB; },

    get(key) {
      return DB[key] !== undefined ? DB[key] : null;
    },
    set(key, value) {
      DB[key] = value;
      save();
    },
    update(key, fn) {
      const cur = DB[key];
      const next = fn(cur);
      DB[key] = next === undefined ? cur : next;
      save();
      return DB[key];
    },
        // 只写磁盘，不触发 store:change 广播（用于局部更新）
    updateSilent(key, fn) {
      const cur = DB[key];
      const next = fn(cur);
      DB[key] = next === undefined ? cur : next;
      writeToDisk();
      return DB[key];
    },

    // 首次访问某模块时初始化默认数据（静默，不触发广播）
    ensure(key, defaults) {
      if (DB[key] === undefined || DB[key] === null) {
        DB[key] = typeof defaults === 'function' ? defaults() : defaults;
        writeToDisk();
      }
      return DB[key];
    },

    exportAll() { return JSON.stringify(DB, null, 2); },
    importAll(json) {
      const obj = JSON.parse(json);
      if (!obj || typeof obj !== 'object') throw new Error('数据格式不正确');
      DB = obj;
      writeToDisk();
      Bus.emit('store:change', DB);
    },
    clearAll() {
      DB = {};
      writeToDisk();
      Bus.emit('store:change', DB);
    }
  };

  global.Store = Store;
})(window);