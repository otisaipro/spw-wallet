// Home tab: address, balance, primary actions, recent activity preview.
//
// Balance and recent are fetched independently — neither blocks the other.
// Both use the shared chainCache so switching to/from Activity is instant.

import { el, clear, copy, shortAddr, fmtSpw } from '../lib/ui.js';
import { getSessionSync } from '../lib/vault.js';
import { fetchBalance, fetchExplorer, getCachedBalance, getCachedExplorer } from '../lib/chainCache.js';
import { classifyTx } from '../lib/txClassify.js';

export function renderHome(container, router) {
  clear(container);
  const sess = getSessionSync();
  if (!sess) return;

  const balanceEl  = el('span', { class: 'balance-main' }, ['—']);
  const feathersEl = el('div', { class: 'balance-feathers' }, ['']);
  const recentList = el('div');

  container.appendChild(el('div', {}, [
    el('div', { class: 'balance-block' }, [
      el('div', { class: 'balance-label' }, ['Total Balance']),
      el('div', {}, [balanceEl, el('span', { class: 'balance-ticker' }, ['SPW'])]),
      feathersEl,
      el('div', { style: 'margin-top:14px;display:flex;justify-content:center' }, [
        el('button', {
          class: 'addr-pill',
          onclick: () => copy(sess.address),
          title: sess.address,
        }, [
          document.createTextNode(shortAddr(sess.address, 8)),
          el('svg', { viewBox: '0 0 24 24', html: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>' }),
        ]),
      ]),
    ]),
    el('div', { class: 'action-grid' }, [
      el('button', { class: 'action-btn', onclick: () => router.go('send') }, [
        el('svg', { viewBox: '0 0 24 24', html: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>' }),
        document.createTextNode('Send'),
      ]),
      el('button', { class: 'action-btn', onclick: () => router.go('receive') }, [
        el('svg', { viewBox: '0 0 24 24', html: '<path d="m12 5v14"/><path d="m5 12 7 7 7-7"/>' }),
        document.createTextNode('Receive'),
      ]),
      el('button', { class: 'action-btn', onclick: () => router.go('activity') }, [
        el('svg', { viewBox: '0 0 24 24', html: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>' }),
        document.createTextNode('Activity'),
      ]),
    ]),
    el('div', { style: 'padding:6px 14px 14px' }, [
      el('div', { style: 'font-size:.78rem;font-weight:700;color:var(--muted);letter-spacing:.06em;margin-bottom:8px' }, ['RECENT']),
      recentList,
    ]),
  ]));

  // ── Paint cached values immediately if any ──
  const cachedBal = getCachedBalance(sess.address);
  if (cachedBal) paintBalance(balanceEl, feathersEl, cachedBal);

  const cachedExp = getCachedExplorer(sess.address);
  if (cachedExp) paintRecent(recentList, cachedExp.txsReversed, sess.address, router);
  else recentList.appendChild(el('div', { class: 'empty' }, [el('span', { class: 'spinner' }), ' Loading…']));

  // ── Independently kick off both fetches ──
  fetchBalance(sess.address).then(
    v => paintBalance(balanceEl, feathersEl, v),
    () => { balanceEl.textContent = '—'; feathersEl.textContent = 'Could not reach node'; }
  );

  fetchExplorer(sess.address).then(
    e => paintRecent(recentList, e.txsReversed, sess.address, router),
    () => {
      clear(recentList);
      recentList.appendChild(el('div', { class: 'empty' }, ['Could not load recent transactions']));
    }
  );
}

function paintBalance(balanceEl, feathersEl, v) {
  const spw = v.balance_spw ?? 0;
  const feat = v.balance_feathers ?? 0;
  balanceEl.textContent = Number(spw).toFixed(8).replace(/\.?0+$/, '') || '0';
  feathersEl.textContent = `${feat.toLocaleString()} feathers`;
}

function paintRecent(recentList, txsReversed, myAddress, router) {
  clear(recentList);
  if (!txsReversed.length) {
    // Empty wallet — give the user something to do besides stare at zeros.
    recentList.appendChild(el('div', {
      style: 'background:var(--bg3);border:1px solid var(--border);border-radius:12px;' +
             'padding:18px 14px;text-align:center;display:flex;flex-direction:column;gap:10px',
    }, [
      el('div', { style: 'font-size:.92rem;font-weight:700' }, ['No SPW yet']),
      el('div', { style: 'font-size:.78rem;color:var(--muted);line-height:1.5' },
        ['Share your address to receive your first SPW.']),
      el('button', {
        class: 'btn',
        style: 'margin-top:6px',
        onclick: () => router.go('receive'),
      }, ['Open Receive']),
    ]));
    return;
  }
  const slice = txsReversed.slice(0, 5);
  for (const tx of slice) {
    const { kind, amount, sign } = classifyTx(tx, myAddress);
    const incoming = kind !== 'sent';
    const label = kind === 'mined' ? 'Mined' : kind === 'sent' ? 'Sent' : 'Received';
    recentList.appendChild(el('div', { class: 'tx-row', onclick: () => router.go('activity') }, [
      el('div', { class: 'tx-icon ' + (incoming ? 'in' : 'out') }, [
        el('svg', { viewBox: '0 0 24 24', html: incoming ? '<path d="m5 12 7 7 7-7"/><path d="M12 19V5"/>' : '<path d="m19 12-7-7-7 7"/><path d="M12 5v14"/>' }),
      ]),
      el('div', { class: 'tx-meta' }, [
        el('div', { class: 'tx-title' }, [label]),
        el('div', { class: 'tx-sub' }, [shortAddr(tx.txid || '', 8)]),
      ]),
      el('div', { class: 'tx-amt ' + (incoming ? 'in' : 'out') }, [
        sign + fmtSpw(amount) + ' SPW',
      ]),
    ]));
  }
}
