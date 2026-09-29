(function (global) {
  const map = {};
  const Bus = {
    on(evt, fn) {
      (map[evt] = map[evt] || []).push(fn);
      return () => Bus.off(evt, fn);
    },
    off(evt, fn) {
      if (!map[evt]) return;
      map[evt] = map[evt].filter(f => f !== fn);
    },
    emit(evt, payload) {
      (map[evt] || []).forEach(fn => {
        try { fn(payload); } catch (e) { console.error('[bus]', evt, e); }
      });
    }
  };
  global.Bus = Bus;
})(window);