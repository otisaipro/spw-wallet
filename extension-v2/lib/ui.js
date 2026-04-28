// Tiny UI helpers shared by all screens.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// SVG elements MUST be created in the SVG namespace; document.createElement('svg')
// produces an HTMLUnknownElement that the browser refuses to render. innerHTML on
// an SVG-namespaced element parses children as SVG too, so the {html: '<path …/>'}
// shorthand keeps working.
const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg','path','circle','rect','line','polyline','polygon',
  'g','use','symbol','defs','text','tspan','ellipse']);

export function el(tag, attrs = {}, children = []) {
  const node = SVG_TAGS.has(tag)
    ? document.createElementNS(SVG_NS, tag)
    : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.setAttribute('class', v);
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node) {
  // replaceChildren() is a single optimized call vs. looping removeChild —
  // matters when the previous tab rendered many rows.
  node.replaceChildren();
}

let toastTimer;
export function toast(msg, ms = 1800) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

export async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied');
  } catch {
    toast('Copy failed');
  }
}

// Copy something that should not linger in the system clipboard.
// After ttlMs the clipboard is overwritten with an empty string IF it still
// contains the value we wrote (we don't clobber whatever the user copied next).
export async function copySensitive(text, ttlMs = 60_000) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`Copied — clipboard will clear in ${Math.round(ttlMs / 1000)}s`, 2400);
  } catch {
    toast('Copy failed');
    return;
  }
  setTimeout(async () => {
    try {
      const cur = await navigator.clipboard.readText();
      if (cur === text) await navigator.clipboard.writeText('');
    } catch { /* permission may be denied; nothing we can do */ }
  }, ttlMs);
}

// Larger detail-review modal — used for transaction review where the body is
// a structured rows-table rather than a sentence. Returns true on confirm.
// opts: { title, rows: [[label, value], ...], confirmText, cancelText, warning }
//   - warning: optional yellow callout shown above the buttons
export function reviewModal(opts) {
  return new Promise(resolve => {
    const overlay = el('div', {
      style: 'position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:2000;' +
             'display:flex;align-items:center;justify-content:center;padding:14px',
    });
    const card = el('div', {
      style: 'background:var(--bg2);border:1px solid var(--border2);border-radius:14px;' +
             'padding:18px;width:100%;max-width:340px;animation:fadeUp .18s ease both;' +
             'box-shadow:0 10px 40px rgba(0,0,0,.7)',
    });
    card.appendChild(el('div', {
      style: 'font-size:1rem;font-weight:800;margin-bottom:12px',
    }, [opts.title || 'Review']));

    const table = el('div', {
      style: 'background:var(--bg3);border:1px solid var(--border);border-radius:10px;' +
             'padding:6px 12px;margin-bottom:12px',
    });
    for (const [k, v] of (opts.rows || [])) {
      const right = (typeof v === 'string') ? el('span', { style: 'color:var(--text);font-weight:600' }, [v]) : v;
      table.appendChild(el('div', {
        style: 'display:flex;justify-content:space-between;align-items:center;' +
               'padding:8px 0;font-size:.84rem;border-bottom:1px solid var(--border);gap:10px',
      }, [
        el('span', { style: 'color:var(--muted)' }, [k]),
        right,
      ]));
    }
    // Strip the trailing border-bottom so the last row sits flush.
    if (table.lastChild) table.lastChild.style.borderBottom = 'none';
    card.appendChild(table);

    if (opts.warning) {
      card.appendChild(el('div', { class: 'warn-card' }, [opts.warning]));
    }

    const cancelBtn = el('button', { class: 'btn btn-secondary' }, [opts.cancelText || 'Cancel']);
    const okBtn     = el('button', { class: 'btn' }, [opts.confirmText || 'Confirm']);

    function close(result) {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }
    function onKey(e) {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    }
    cancelBtn.addEventListener('click', () => close(false));
    okBtn.addEventListener('click', () => close(true));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', onKey);

    card.appendChild(el('div', { class: 'btn-row' }, [cancelBtn, okBtn]));
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    setTimeout(() => okBtn.focus(), 30);
  });
}

// In-popup confirmation modal. Returns true on confirm, false on cancel.
// opts: { title, body, confirmText, cancelText, danger, requireTyping }
//   - danger: paints the confirm button red
//   - requireTyping: string the user must type exactly to enable the confirm button
//                    (e.g. "RESET" — used for irreversible actions)
export function confirmModal(opts) {
  return new Promise(resolve => {
    const overlay = el('div', {
      style: 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2000;' +
             'display:flex;align-items:center;justify-content:center;padding:14px;',
    });
    const card = el('div', {
      style: 'background:var(--bg2);border:1px solid var(--border2);border-radius:14px;' +
             'padding:18px;width:100%;max-width:340px;animation:fadeUp .18s ease both;' +
             'box-shadow:0 10px 40px rgba(0,0,0,.6)',
    });
    const titleEl = el('div', {
      style: 'font-size:1rem;font-weight:800;margin-bottom:6px',
    }, [opts.title || 'Are you sure?']);
    const bodyEl = el('div', {
      style: 'font-size:.84rem;color:var(--muted);line-height:1.55;margin-bottom:14px',
    }, opts.body ? [opts.body] : []);
    card.appendChild(titleEl);
    card.appendChild(bodyEl);

    let typingInput;
    if (opts.requireTyping) {
      typingInput = el('input', {
        placeholder: `Type ${opts.requireTyping} to confirm`,
        autocomplete: 'off',
        style: 'margin-bottom:12px',
      });
      card.appendChild(typingInput);
    }

    const cancelBtn = el('button', { class: 'btn btn-secondary' }, [opts.cancelText || 'Cancel']);
    const confirmBtn = el('button', {
      class: 'btn' + (opts.danger ? ' btn-danger' : ''),
      disabled: opts.requireTyping ? 'true' : false,
    }, [opts.confirmText || 'Confirm']);

    if (typingInput) {
      typingInput.addEventListener('input', () => {
        if (typingInput.value === opts.requireTyping) confirmBtn.disabled = false;
        else confirmBtn.disabled = true;
      });
    }

    function close(result) {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }
    function onKey(e) {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter' && !confirmBtn.disabled) close(true);
    }
    cancelBtn.addEventListener('click', () => close(false));
    confirmBtn.addEventListener('click', () => close(true));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', onKey);

    card.appendChild(el('div', { class: 'btn-row' }, [cancelBtn, confirmBtn]));
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    setTimeout(() => (typingInput || confirmBtn).focus(), 30);
  });
}

// Password prompt modal. Resolves with the entered password string, or null
// if the user cancelled. Caller is responsible for verifying the password.
export function passwordPrompt(opts = {}) {
  return new Promise(resolve => {
    const overlay = el('div', {
      style: 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:2000;' +
             'display:flex;align-items:center;justify-content:center;padding:14px',
    });
    const card = el('div', {
      style: 'background:var(--bg2);border:1px solid var(--border2);border-radius:14px;' +
             'padding:18px;width:100%;max-width:340px;animation:fadeUp .18s ease both;' +
             'box-shadow:0 10px 40px rgba(0,0,0,.6)',
    });
    const titleEl = el('div', {
      style: 'font-size:1rem;font-weight:800;margin-bottom:6px',
    }, [opts.title || 'Confirm with password']);
    const bodyEl = el('div', {
      style: 'font-size:.84rem;color:var(--muted);line-height:1.55;margin-bottom:14px',
    }, opts.body ? [opts.body] : []);
    const inp = el('input', { type: 'password', placeholder: 'Password', style: 'margin-bottom:8px' });
    const errEl = el('div', { class: 'error hidden' });

    const cancelBtn = el('button', { class: 'btn btn-secondary' }, [opts.cancelText || 'Cancel']);
    const okBtn = el('button', { class: 'btn' }, [opts.confirmText || 'Confirm']);

    function close(value) {
      // Wipe the input value before tearing down the DOM so it's not pinned
      // by the closure for an arbitrary GC interval.
      inp.value = '';
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(value);
    }
    function submit() {
      const v = inp.value;
      if (!v) {
        errEl.textContent = 'Enter your password';
        errEl.classList.remove('hidden');
        return;
      }
      close(v);
    }
    function onKey(e) {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter') submit();
    }
    cancelBtn.addEventListener('click', () => close(null));
    okBtn.addEventListener('click', submit);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
    document.addEventListener('keydown', onKey);

    card.appendChild(titleEl);
    card.appendChild(bodyEl);
    card.appendChild(inp);
    card.appendChild(errEl);
    card.appendChild(el('div', { class: 'btn-row', style: 'margin-top:8px' }, [cancelBtn, okBtn]));
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    setTimeout(() => inp.focus(), 30);
  });
}

export function shortAddr(a, n = 6) {
  if (!a) return '';
  if (a.length <= n * 2 + 2) return a;
  return a.slice(0, n) + '…' + a.slice(-n);
}

export function fmtSpw(feathers) {
  // 1 SPW = 1e8 feathers (matches web wallet convention)
  const n = Number(feathers) / 1e8;
  return n.toFixed(8).replace(/\.?0+$/, '') || '0';
}
