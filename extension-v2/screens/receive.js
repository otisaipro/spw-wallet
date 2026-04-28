// Receive tab: address + QR + copy. QR is generated synchronously (≈30 ms)
// off the cached vendor module — no perceptible delay.

import { QRCode } from '../vendor/spw-vendor.bundle.mjs';
import { getSessionSync } from '../lib/vault.js';
import { el, clear, copy } from '../lib/ui.js';

export function renderReceive(container, _router) {
  clear(container);
  const sess = getSessionSync();
  if (!sess) return;

  // Render skeleton synchronously, fill in the QR right after — even though
  // QRCode.toString returns a promise, in practice it resolves on the same
  // microtask in our bundle, so the first paint already has the QR.
  const qrWrap = el('div', { class: 'qr-wrap' });

  container.appendChild(el('div', { class: 'screen', style: 'padding-top:12px' }, [
    el('h2', { style: 'margin-bottom:6px;text-align:center' }, ['Your address']),
    el('p', { style: 'text-align:center;margin-bottom:12px' }, ['Share this address or QR to receive SPW.']),
    qrWrap,
    el('div', {
      style:
        'background:var(--bg3);border:1px solid var(--border);border-radius:10px;' +
        'padding:12px;margin-bottom:12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;' +
        'font-size:.78rem;word-break:break-all;text-align:center;line-height:1.5;color:var(--text)',
    }, [sess.address]),
    el('button', { class: 'btn', onclick: () => copy(sess.address) }, ['Copy address']),
    el('div', { class: 'warn-card', style: 'margin-top:12px' },
      ['Only send SPW to this address. Other assets will be permanently lost.']),
  ]));

  QRCode.toString(sess.address, {
    type: 'svg', errorCorrectionLevel: 'M', margin: 1, width: 200,
    color: { dark: '#0a0e1a', light: '#ffffff' },
  }).then(svg => { qrWrap.innerHTML = svg; });
}
