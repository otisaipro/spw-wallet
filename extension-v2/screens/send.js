// Send tab: build → review modal → password prompt → sign → broadcast.
// v1.0 supports plain (non-stealth) sends only.

import { secp, hex, isValidSpwAddress, signingDigest, computeTxid } from '../lib/spw.js';
import { getSessionSync, touchSession, verifyPassword } from '../lib/vault.js';
import { getUtxos, broadcastTx } from '../lib/rpc.js';
import { fetchBalance, invalidate } from '../lib/chainCache.js';
import { el, clear, toast, fmtSpw, reviewModal, passwordPrompt } from '../lib/ui.js';

const FEATHERS = 100_000_000;            // 1 SPW = 1e8 feathers
const MIN_FEE_FEATHERS = 10_000;         // 0.0001 SPW floor — must match node policy
const DUST_THRESHOLD_FEATHERS = 1_000;   // change below this is rolled into fee

// Parse a decimal string like "1.23456789" into integer feathers without
// going through Number (which loses precision past 2^53).
export function parseAmountToFeathers(str) {
  const s = String(str || '').trim();
  if (!s) throw new Error('Amount is required');
  if (!/^\d+(\.\d{1,8})?$/.test(s)) {
    throw new Error('Amount must be a positive number with up to 8 decimal places');
  }
  const [whole, frac = ''] = s.split('.');
  const padded = (frac + '00000000').slice(0, 8);
  const total = BigInt(whole) * 100_000_000n + BigInt(padded);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Amount is too large');
  if (total <= 0n) throw new Error('Amount must be greater than zero');
  return Number(total);
}

export function renderSend(container, router) {
  clear(container);
  const sess = getSessionSync();
  if (!sess) return;

  const toInp   = el('input', { placeholder: 'D… (SPW address)', autocomplete: 'off' });
  const amtInp  = el('input', { type: 'text', inputmode: 'decimal', placeholder: '0.00000000', autocomplete: 'off' });
  const maxBtn  = el('button', {
    style: 'flex:0 0 auto;padding:8px 12px;font-size:.74rem;font-weight:700;color:var(--cyan);' +
           'background:var(--bg3);border:1px solid var(--border);border-radius:8px;letter-spacing:.04em',
  }, ['MAX']);
  const feeInp  = el('input', { type: 'text', inputmode: 'decimal', value: '0.0001', autocomplete: 'off' });
  const memoInp = el('input', { placeholder: 'Optional memo (max 80 bytes)', maxlength: '120' });
  const msgEl   = el('div', { style: 'min-height:18px;font-size:.78rem;margin:8px 0' });
  const reviewBtn = el('button', { class: 'btn' }, ['Review']);

  function setMsg(text, kind = 'muted') {
    msgEl.textContent = text || '';
    msgEl.style.color = kind === 'err' ? 'var(--red)' :
                        kind === 'ok'  ? 'var(--green)' :
                        kind === 'info' ? 'var(--cyan)' : 'var(--muted)';
  }

  // ── MAX button — fills amount with (balance - fee) ──
  maxBtn.addEventListener('click', async () => {
    setMsg('Loading balance…', 'info');
    let bal;
    try { bal = await fetchBalance(sess.address); }
    catch (e) { setMsg('Could not load your balance: ' + e.message, 'err'); return; }
    const balFeat = Number(bal.balance_feathers ?? 0);
    let feeFeat;
    try { feeFeat = parseAmountToFeathers(feeInp.value); } catch { feeFeat = MIN_FEE_FEATHERS; }
    if (feeFeat < MIN_FEE_FEATHERS) feeFeat = MIN_FEE_FEATHERS;
    const maxFeat = balFeat - feeFeat;
    if (maxFeat <= 0) {
      setMsg('Insufficient balance for any send (balance must exceed fee)', 'err');
      return;
    }
    amtInp.value = (maxFeat / FEATHERS).toFixed(8).replace(/\.?0+$/, '');
    setMsg('Filled with maximum sendable amount (balance − fee).', 'info');
  });

  // ── Review → modal → password prompt → sign+broadcast ──
  reviewBtn.addEventListener('click', async () => {
    setMsg('');

    // ── Validate inputs ──
    const to = toInp.value.trim();
    if (!isValidSpwAddress(to)) { setMsg('Invalid SPW address.', 'err'); return; }

    let amt;
    try { amt = parseAmountToFeathers(amtInp.value); }
    catch (e) { setMsg(e.message, 'err'); return; }

    let fee;
    try { fee = parseAmountToFeathers(feeInp.value); }
    catch (e) { setMsg('Fee: ' + e.message, 'err'); return; }
    if (fee < MIN_FEE_FEATHERS) {
      setMsg(`Minimum fee is ${(MIN_FEE_FEATHERS / FEATHERS).toFixed(4)} SPW.`, 'err');
      return;
    }

    const memo = memoInp.value;
    if (memo && new TextEncoder().encode(memo).length > 80) {
      setMsg('Memo exceeds 80 bytes.', 'err'); return;
    }

    const need = amt + fee;

    // ── Load UTXOs ──
    reviewBtn.disabled = true;
    reviewBtn.textContent = 'Loading…';
    let utxosResp;
    try { utxosResp = await getUtxos(sess.address); }
    catch (e) {
      setMsg('Could not load your unspent outputs: ' + e.message, 'err');
      reviewBtn.disabled = false; reviewBtn.textContent = 'Review';
      return;
    }
    reviewBtn.disabled = false; reviewBtn.textContent = 'Review';

    const allRaw = (utxosResp && utxosResp.utxos) ? utxosResp.utxos
                 : (Array.isArray(utxosResp) ? utxosResp : []);
    if (!allRaw.length) { setMsg('No unspent outputs available.', 'err'); return; }

    // Sort ascending for smallest-first selection (privacy-preserving).
    const all = allRaw.slice().sort((a, b) => a.amount - b.amount);
    const avail = all.reduce((s, u) => s + u.amount, 0);
    if (avail < need) {
      setMsg(`Insufficient balance: have ${fmtSpw(avail)} SPW, need ${fmtSpw(need)} SPW.`, 'err');
      return;
    }

    let sum = 0;
    const selected = [];
    for (const u of all) {
      selected.push(u); sum += u.amount;
      if (sum >= need) break;
    }
    let change = sum - need;

    // Dust → fold into fee.
    let foldedDust = 0;
    if (change > 0 && change < DUST_THRESHOLD_FEATHERS) {
      foldedDust = change;
      fee += change;
      change = 0;
    }

    const ts = Math.floor(Date.now() / 1000);
    const pending = { to, amt, fee, change, ts, selected, memo };

    // ── Build review rows ──
    const rows = [
      ['To', el('span', {
        style: 'font-family:ui-monospace,monospace;font-size:.74rem;color:var(--text);text-align:right;word-break:break-all',
      }, [to.slice(0, 12) + '…' + to.slice(-6)])],
      ['Amount',      `${fmtSpw(amt)} SPW`],
      ['Network fee', `${fmtSpw(fee)} SPW`],
    ];
    if (foldedDust > 0) rows.push(['Dust (rolled into fee)', `${fmtSpw(foldedDust)} SPW`]);
    rows.push(['Total', `${fmtSpw(amt + fee)} SPW`]);
    if (change > 0) rows.push(['Change back to you', `${fmtSpw(change)} SPW`]);
    if (memo) {
      rows.push(['Memo', el('span', {
        style: 'color:var(--text);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap',
      }, [memo])]);
    }

    // ── Pop the review modal ──
    touchSession();
    const ok = await reviewModal({
      title: 'Review transaction',
      rows,
      confirmText: 'Confirm & sign',
      cancelText: 'Cancel',
      warning: 'You are about to send SPW. Once broadcast, this cannot be undone.',
    });
    if (!ok) { setMsg('Cancelled.', 'muted'); return; }

    // ── Password gate ──
    const password = await passwordPrompt({
      title: 'Authorize transaction',
      body: `Enter your password to sign and broadcast ${fmtSpw(pending.amt)} SPW.`,
      confirmText: 'Sign & broadcast',
    });
    if (password == null) { setMsg('Cancelled.', 'muted'); return; }
    const pwOk = await verifyPassword(password);
    if (!pwOk) { setMsg('Wrong password. Transaction NOT sent.', 'err'); return; }

    // ── Sign + broadcast ──
    setMsg('Signing…', 'info');
    try {
      const sess2 = getSessionSync();
      if (!sess2) throw new Error('Wallet locked');
      const privKey = secp.utils.hexToBytes(sess2.spendHex);
      const pubKey = secp.getPublicKey(privKey, true);
      const pubHex = hex(pubKey);

      const inputs = pending.selected.map(u => ({
        prev_txid: u.txid, prev_vout: u.vout, script_sig: '', pubkey: pubHex,
      }));
      const outputs = [{ amount: pending.amt, address: pending.to }];
      if (pending.memo) outputs[0].data = pending.memo;
      if (pending.change > 0) outputs.push({ amount: pending.change, address: sess2.address });

      const digest = signingDigest(inputs, outputs, pending.ts, '');
      const sigBytes = secp.signSync(digest, privKey, { canonical: true, der: true });
      const sigHex = hex(sigBytes);
      const signedInputs = inputs.map(i => ({ ...i, script_sig: sigHex }));
      const txid = computeTxid(signedInputs, outputs, pending.ts, '', '');

      setMsg('Broadcasting…', 'info');
      let res;
      try {
        res = await broadcastTx({
          txid, inputs: signedInputs, outputs,
          timestamp: pending.ts, coinbase_data: '', tx_pubkey: '',
        });
      } catch (netErr) {
        setMsg('Broadcast failed — your transaction was NOT sent: ' + netErr.message, 'err');
        return;
      }
      if (res && res.error) {
        setMsg('Broadcast rejected by node: ' + res.error, 'err');
        return;
      }

      // ── Success: clear form, invalidate cache, jump to Activity ──
      toInp.value = ''; amtInp.value = ''; memoInp.value = '';
      setMsg(`Broadcast! TXID ${(res.txid || txid).slice(0, 16)}…`, 'ok');
      toast('Transaction sent');
      invalidate(sess2.address);
      setTimeout(() => router.go('activity'), 1200);
    } catch (e) {
      setMsg('Failed: ' + e.message, 'err');
    }
  });

  // ── Layout ──
  const amountRow = el('div', { style: 'display:flex;gap:8px;align-items:stretch' }, [
    el('div', { style: 'flex:1' }, [amtInp]),
    maxBtn,
  ]);

  container.appendChild(el('div', { class: 'screen' }, [
    el('h2', {}, ['Send SPW']),
    el('div', { class: 'field' }, [el('label', {}, ['Recipient address']), toInp]),
    el('div', { class: 'field' }, [el('label', {}, ['Amount (SPW)']), amountRow]),
    el('div', { class: 'field' }, [el('label', {}, ['Network fee (SPW)']), feeInp,
      el('div', { class: 'help' }, [`Minimum ${(MIN_FEE_FEATHERS / FEATHERS).toFixed(4)} SPW. Higher fees confirm faster.`]),
    ]),
    el('div', { class: 'field' }, [el('label', {}, ['Memo (optional, ≤ 80 bytes)']), memoInp]),
    msgEl,
    reviewBtn,
  ]));
}
