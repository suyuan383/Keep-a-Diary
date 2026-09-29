(function (global) {
  const U = {};

  U.qs = (sel, root) => (root || document).querySelector(sel);
  U.qsa = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  U.escape = function (s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  };

  U.uid = function (prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) +
           Math.random().toString(36).slice(2, 6);
  };

  U.pad = n => (n < 10 ? '0' + n : '' + n);

  U.todayStr = function (d) {
    d = d || new Date();
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate());
  };

  U.formatDate = function (str) {
    if (!str) return '';
    const p = str.split('-');
    return p[0] + '年' + parseInt(p[1], 10) + '月' + parseInt(p[2], 10) + '日';
  };

  U.weekday = function (d) {
    d = d || new Date();
    return ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][d.getDay()];
  };

  U.clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  U.deepClone = obj => JSON.parse(JSON.stringify(obj));

  U.debounce = function (fn, wait) {
    let t;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), wait);
    };
  };

  global.U = U;
})(window);