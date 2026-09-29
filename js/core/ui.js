(function (global) {
  let toastTimer = null;

  const UI = {
    toast(msg, ms) {
      let el = document.getElementById('__toast');
      if (!el) {
        el = document.createElement('div');
        el.id = '__toast';
        el.className = 'toast';
        document.body.appendChild(el);
      }
      el.textContent = msg;
      requestAnimationFrame(() => el.classList.add('show'));
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => el.classList.remove('show'), ms || 1800);
    },

    confirm(msg, title) {
      return new Promise(resolve => {
        const mask = document.createElement('div');
        mask.className = 'modal-mask';
        mask.innerHTML = `
          <div class="modal-box">
            <div class="modal-title">${U.escape(title || '确认')}</div>
            <div class="modal-body">${U.escape(msg)}</div>
            <div class="modal-foot">
              <button class="btn btn-ghost" data-r="0">取消</button>
              <button class="btn btn-primary" data-r="1">确定</button>
            </div>
          </div>`;
        document.body.appendChild(mask);
        requestAnimationFrame(() => mask.classList.add('show'));
        mask.addEventListener('click', e => {
          const btn = e.target.closest('[data-r]');
          if (!btn) return;
          mask.classList.remove('show');
          setTimeout(() => document.body.removeChild(mask), 180);
          resolve(btn.dataset.r === '1');
        });
      });
    },

    // fields: [{name,label,type,value,options,required,placeholder}]
    form(title, fields) {
      return new Promise(resolve => {
        const mask = document.createElement('div');
        mask.className = 'modal-mask';

        const body = fields.map(f => {
          const val = f.value == null ? '' : f.value;
          let input;
          if (f.type === 'select') {
            input = `<select name="${f.name}">` +
              (f.options || []).map(o =>
                `<option value="${U.escape(o.value)}" ${o.value == val ? 'selected' : ''}>${U.escape(o.label)}</option>`
              ).join('') + `</select>`;
          } else if (f.type === 'textarea') {
            input = `<textarea name="${f.name}" rows="3" placeholder="${U.escape(f.placeholder || '')}">${U.escape(val)}</textarea>`;
          } else {
            input = `<input type="${f.type || 'text'}" name="${f.name}" value="${U.escape(val)}" placeholder="${U.escape(f.placeholder || '')}">`;
          }
          return `<label class="field"><span class="field-label">${U.escape(f.label)}</span>${input}</label>`;
        }).join('');

        mask.innerHTML = `
          <div class="modal-box">
            <div class="modal-title">${U.escape(title)}</div>
            <div class="modal-body">${body}</div>
            <div class="modal-foot">
              <button class="btn btn-ghost" data-r="0">取消</button>
              <button class="btn btn-primary" data-r="1">保存</button>
            </div>
          </div>`;
        document.body.appendChild(mask);
        requestAnimationFrame(() => mask.classList.add('show'));

        mask.addEventListener('click', e => {
          const btn = e.target.closest('[data-r]');
          if (!btn) return;
          if (btn.dataset.r === '0') {
            mask.classList.remove('show');
            setTimeout(() => document.body.removeChild(mask), 180);
            resolve(null);
            return;
          }
          const result = {};
          let ok = true;
          fields.forEach(f => {
            const el = mask.querySelector(`[name="${f.name}"]`);
            let v = el.value;
            if (f.type === 'number') v = v === '' ? '' : Number(v);
            if (f.required && (v === '' || v == null)) ok = false;
            result[f.name] = v;
          });
          if (!ok) { UI.toast('请填写必填项'); return; }
          mask.classList.remove('show');
          setTimeout(() => document.body.removeChild(mask), 180);
          resolve(result);
        });
      });
    }
  };

  global.UI = UI;
})(window);