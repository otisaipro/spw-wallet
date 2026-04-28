// Activity tab: paginated transaction history from /explorer.
// Page size is small (10) so DOM stays light — switching to/from Activity
// must not be expensive.

import { getSessionSync } from '../lib/vault.js';
import { fetchExplorer, getCachedExplorer, invalidate } from '../lib/chainCache.js';
import { classifyTx } from '../lib/txClassify.js';
import { el, clear, shortAddr, fmtSpw, copy } from '../lib/ui.js';

const PAGE_SIZE = 10;

export async function renderActivity(container, router) {
  clear(container);
  const sess = getSessionSync();
  if (!sess) return;

  let page = 0;
  const listBox = el('div');
  const pager = el('div', {
    style: 'display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-top:1px solid var(--border);font-size:.78rem;color:var(--muted)',
  });

  const refreshBtn = el('button', {
    style: 'font-size:.75rem;color:var(--cyan);padding:6px 10px;border-radius:8px;background:var(--bg3)',
    onclick: () => { invalidate(sess.address); renderActivity(container, router); },
  }, ['Refresh']);

  container.appendChild(el('div', {}, [
    el('div', {
      style: 'padding:14px 14px 8px;display:flex;justify-content:space-between;align-items:center'
    }, [
      el('h2', { style: 'font-size:1rem' }, ['Activity']),
      refreshBtn,
    ]),
    listBox,
    pager,
  ]));

  // Use the shared chainCache. If we already have data (e.g. Home prefetched it
  // or user just visited), paint immediately and don't show a spinner.
  let txs;
  const cached = getCachedExplorer(sess.address);
  if (cached) {
    txs = cached.txsReversed;
  } else {
    listBox.appendChild(el('div', { class: 'empty' }, [el('span', { class: 'spinner' }), ' Loading…']));
    pager.style.display = 'none';
    let entry;
    try {
      entry = await fetchExplorer(sess.address);
    } catch (e) {
      clear(listBox);
      listBox.appendChild(el('div', { class: 'empty' }, ['Could not reach node: ' + e.message]));
      return;
    }
    txs = entry.txsReversed;
  }

  if (!txs.length) {
    clear(listBox);
    listBox.appendChild(el('div', { class: 'empty' }, ['No transactions yet']));
    return;
  }

  const totalPages = Math.max(1, Math.ceil(txs.length / PAGE_SIZE));

  function renderPage() {
    clear(listBox);
    const start = page * PAGE_SIZE;
    const slice = txs.slice(start, start + PAGE_SIZE);
    for (const tx of slice) listBox.appendChild(renderRow(tx, sess.address));
    renderPager();
  }

  function renderPager() {
    clear(pager);
    if (totalPages <= 1) { pager.style.display = 'none'; return; }
    pager.style.display = 'flex';
    pager.appendChild(el('button', {
      class: 'btn btn-secondary',
      style: 'flex:0 0 auto;padding:6px 14px;font-size:.78rem;width:auto',
      disabled: page === 0 ? 'true' : false,
      onclick: () => { if (page > 0) { page--; renderPage(); } },
    }, ['‹ Prev']));
    pager.appendChild(el('span', {}, [`Page ${page + 1} / ${totalPages}  ·  ${txs.length} txs`]));
    pager.appendChild(el('button', {
      class: 'btn btn-secondary',
      style: 'flex:0 0 auto;padding:6px 14px;font-size:.78rem;width:auto',
      disabled: page >= totalPages - 1 ? 'true' : false,
      onclick: () => { if (page < totalPages - 1) { page++; renderPage(); } },
    }, ['Next ›']));
  }

  renderPage();
}

function renderRow(tx, myAddress) {
  const { kind, amount, sign } = classifyTx(tx, myAddress);
  const ts = tx.timestamp ? new Date(tx.timestamp * 1000).toLocaleString()
                          : (tx.block_height != null ? `Block ${tx.block_height}` : '');
  const incoming = kind !== 'sent';
  const label = kind === 'mined' ? 'Mined' : kind === 'sent' ? 'Sent' : 'Received';

  return el('div', {
    class: 'tx-row',
    onclick: () => copy(tx.txid || ''),
    title: 'Click to copy txid',
  }, [
    el('div', { class: 'tx-icon ' + (incoming ? 'in' : 'out') }, [
      el('svg', {
        viewBox: '0 0 24 24',
        html: incoming
          ? '<path d="m5 12 7 7 7-7"/><path d="M12 19V5"/>'
          : '<path d="m19 12-7-7-7 7"/><path d="M12 5v14"/>',
      }),
    ]),
    el('div', { class: 'tx-meta' }, [
      el('div', { class: 'tx-title' }, [label]),
      el('div', { class: 'tx-sub' }, [ts || shortAddr(tx.txid || '', 8)]),
    ]),
    el('div', { class: 'tx-amt ' + (incoming ? 'in' : 'out') }, [
      sign + fmtSpw(amount) + ' SPW',
    ]),
  ]);
}
