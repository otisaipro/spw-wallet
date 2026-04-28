// Send tab: build → password-confirm → sign → broadcast.
// v1.0 supports plain (non-stealth) sends only.

import { secp, hex, isValidSpwAddress, signingDigest, computeTxid } from '../lib/spw.js';
import { getSessionSync, touchSession, verifyPassword } from '../lib/vault.js';
import { getUtxos, broadcastTx } from '../lib/rpc.js';
import { fetchBalance, invalidate } from '../lib/chainCache.js';
import { el, clear, toast, fmtSpw, passwordPrompt } from '../lib/ui.js';

const FEATHERS = 100_000_000;            // 1 SPW = 1e8 feathers
const MIN_FEE_FEATHERS = 10_000;         // 0.0001 SPW floor — must match node policy
const DUST_THRESHOLD_FEATHERS = 1_000;   // change below this is rolled into fee

// Parse a decimal string like "1.23456789" into integer feathers without
// going through Number (which loses precision past 2^53).
// Throws on malformed input or amounts that overflow the safe integer range
// (the chain itself uses unbounded ints, but our wire format / Number cast
// downstream needs to fit).
export function parseAmountToFeathers(str) {
  const s = String(str || '').trim();
  if (!s) throw new Error('Amount is required');
  if (!/^\d+(\.\d{1,8})?$/.test(s)) {
    throw new Error('Amount must be a positive number with up to 8 decimal places');
  }
  const [whole, frac = ''] = s.split('.');
  const padded = (frac + '00000000').slice(0, 8);
  const total = BigInt(whole) * 100_000_000n + BigInt(padded);
  if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Amount is too large');
  }
  if (total <= 0n) throw new Error('Amount must be greater than zero');
  return Number(total);
}

export function renderSend(container, router) {
  clear(container);
  const sess = getSessionSync();
  if (!sess) return;

  const toInp     = el('input', { placeholder: 'D… (SPW address)', autocomplete: 'off' });
  const amtInp    = el('input', { type: 'text', inputmode: 'decimal', placeholder: '0.00000000', autocomplete: 'off' });
  const maxBtn    = el('button', {
    style: 'flex:0 0 auto;padding:8px 12px;font-size:.74rem;font-weight:700;color:var(--cyan);' +
           'background:var(--bg3);border:1px solid var(--border);border-radius:8px;letter-spacing:.04em',
  }, ['MAX']);
  const feeInp    = el('input', { type: 'text', inputmode: 'decimal', value: '0.0001', autocomplete: 'off' });
  const memoInp   = el('input', { placeholder: 'Optional memo (max 80 bytes)', maxlength: '120' });
  const summary   = el('div', { class: 'card hidden' });
  const msgEl     = el('div', { style: 'min-height:18px;font-size:.78rem;margin:8px 0' });
  const reviewBtn = el('button', { class: 'btn' }, ['Review']);
  const sendBtn   = el('button', { class: 'btn hidden' }, ['Confirm & broadcast']);

  let pending = null;

  function setMsg(text, kind = 'muted') {
    msgEl.textContent = text || '';
    msgEl.style.color = kind === 'err' ? 'var(--red)' :
                        kind === 'ok'  ? 'var(--green)' :
                        kind === 'info' ? 'var(--cyan)' : 'var(--muted)';
  }

  // MAX button — fills amount with (balance - fee) so user doesn't manually subtract.
  maxBtn.addEventListener('click', async () => {
    setMsg('Loading balance…', 'info');
    let bal;
    try { bal = await fetchBalance(sess.address); }
    catch (e) { setMsg('Could not load your balance: ' + e.message, 'err'); return; }
    const balFeat = Number(bal.balance_feathers ?? 0);
    let feeFeat;
    try { feeFeat = parseAmountToFeathers(feeInp.value); }
    catch { feeFeat = MIN_FEE_FEATHERS; }
    if (feeFeat < MIN_FEE_FEATHERS) feeFeat = MIN_FEE_FEATHERS;
    const maxFeat = balFeat - feeFeat;
    if (maxFeat <= 0) {
      setMsg('Insufficient balance for any send (balance must exceed fee)', 'err');
      return;
    }
    amtInp.value = (maxFeat / FEATHERS).toFixed(8).replace(/\.?0+$/, '');
    setMsg('Filled with maximum sendable amount (balance − fee).', 'info');
  });

  reviewBtn.addEventListener('click', async () => {
    setMsg('');
    pending = null;
    sendBtn.classList.add('hidden');
    summary.classList.add('hidden');
    summary.replaceChildren();

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
    if (memo) {
      const memoBytes = new TextEncoder().encode(memo).length;
      if (memoBytes > 80) { setMsg('Memo exceeds 80 bytes.', 'err'); return; }
    }

    const need = amt + fee;

    // ── Load UTXOs ──
    reviewBtn.disabled = true;
    reviewBtn.textContent = 'Loading…';
    let utxosResp;
    try {
      utxosResp = await getUtxos(sess.address);
    } catch (e) {
      setMsg('Could not load your unspent outputs: ' + e.message, 'err');
      reviewBtn.disabled = false;
      reviewBtn.textContent = 'Review';
      return;
    }
    reviewBtn.disabled = false;
    reviewBtn.textContent = 'Review';

    const allRaw = (utxosResp && utxosResp.utxos) ? utxosResp.utxos
                 : (Array.isArray(utxosResp) ? utxosResp : []);
    if (!allRaw.length) { setMsg('No unspent outputs available.', 'err'); return; }

    // Sort ascending so the greedy loop picks the smallest set of UTXOs that
    // covers `need`. Avoids accidentally consuming a 100-SPW UTXO to send 0.01,
    // which would create a privacy-leaking large change output.
    const all = allRaw.slice().sort((a, b) => a.amount - b.amount);
    const avail = all.reduce((s, u) => s + u.amount, 0);
    if (avail < need) {
      setMsg(`Insufficient balance: have ${fmtSpw(avail)} SPW, need ${fmtSpw(need)} SPW.`, 'err');
      return;
    }

    let sum = 0;
    const selected = [];
    for (const u of all) {
      selected.push(u);
      sum += u.amount;
      if (sum >= need) break;
    }
    let change = sum - need;

    // Dust handling: if the leftover change is below dust threshold, fold it
    // into the fee instead of producing a dust output (which some nodes reject
    // and which leaks an extra UTXO with tiny value).
    let foldedDust = 0;
    if (change > 0 && change < DUST_THRESHOLD_FEATHERS) {
      foldedDust = change;
      fee += change;
      change = 0;
    }

    const ts = Math.floor(Date.now() / 1000);
    pending = { to, amt, fee, change, ts, selected, memo };

    // ── Render review card ──
    summary.classList.remove('hidden');
    summary.appendChild(el('h3', {}, ['Review']));
    summary.appendChild(row('To',
      el('span', { class: 'v', style: 'font-family:ui-monospace,monospace;font-size:.74rem' },
        [to.slice(0, 12) + '…' + to.slice(-6)])));
    summary.appendChild(row('Amount', `${fmtSpw(amt)} SPW`));
    summary.appendChild(row('Network fee', `${fmtSpw(fee)} SPW`));
    if (foldedDust > 0) {
      summary.appendChild(row('Dust (rolled into fee)', `${fmtSpw(foldedDust)} SPW`));
    }
    summary.appendChild(row('Total', `${fmtSpw(amt + fee)} SPW`));
    if (change > 0) summary.appendChild(row('Change back to you', `${fmtSpw(change)} SPW`));
    if (memo) {
      summary.appendChild(row('Memo',
        el('span', {
          class: 'v',
          style: 'max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap',
        }, [memo])));
    }
    sendBtn.classList.remove('hidden');
    setMsg('Review the details, then confirm to broadcast.', 'info');
    touchSession();
  });

  sendBtn.addEventListener('click', async () => {
    if (!pending) return;

    // Re-prompt for password before signing. Prevents drive-by drains from
    // an unlocked-but-unattended popup, and gives the user one last chance
    // to abort.
    const password = await passwordPrompt({
      title: 'Confirm transaction',
      body: `You are about to send ${fmtSpw(pending.amt)} SPW. Enter your password to authorize.`,
      confirmText: 'Sign & broadcast',
    });
    if (password == null) return;
    const ok = await verifyPassword(password);
    if (!ok) { setMsg('Wrong password. Transaction not sent.', 'err'); return; }

    sendBtn.disabled = true;
    sendBtn.textContent = 'Signing…';
    setMsg('');

    try {
      const sess2 = getSessionSync();
      if (!sess2) throw new Error('Wallet locked');
      const privKey = secp.utils.hexToBytes(sess2.spendHex);
      const pubKey = secp.getPublicKey(privKey, true);
      const pubHex = hex(pubKey);

      const { to, amt, fee, change, ts, selected, memo } = pending;
      const inputs = selected.map(u => ({
        prev_txid: u.txid, prev_vout: u.vout, script_sig: '', pubkey: pubHex,
      }));
      const outputs = [{ amount: amt, address: to }];
      if (memo) outputs[0].data = memo;
      if (change > 0) outputs.push({ amount: change, address: sess2.address });

      const digest = signingDigest(inputs, outputs, ts, '');
      const sigBytes = secp.signSync(digest, privKey, { canonical: true, der: true });
      const sigHex = hex(sigBytes);
      const signedInputs = inputs.map(i => ({ ...i, script_sig: sigHex }));
      const txid = computeTxid(signedInputs, outputs, ts, '', '');

      sendBtn.textContent = 'Broadcasting…';
      let res;
      try {
        res = await broadcastTx({
          txid, inputs: signedInputs, outputs,
          timestamp: ts, coinbase_data: '', tx_pubkey: '',
        });
      } catch (netErr) {
        // Critical wording: distinguish from "couldn't load balance".
        setMsg('Broadcast failed — your transaction was NOT sent: ' + netErr.message, 'err');
        sendBtn.disabled = false;
        sendBtn.textContent = 'Confirm & broadcast';
        return;
      }
      if (res && res.error) {
        setMsg('Broadcast rejected by node: ' + res.error, 'err');
        sendBtn.disabled = false;
        sendBtn.textContent = 'Confirm & broadcast';
        return;
      }

      pending = null;
      toInp.value = '';
      amtInp.value = '';
      memoInp.value = '';
      summary.classList.add('hidden');
      sendBtn.classList.add('hidden');
      setMsg(`Broadcast! TXID ${(res.txid || txid).slice(0, 16)}…`, 'ok');
      toast('Transaction sent');
      invalidate(sess2.address);
      setTimeout(() => router.go('activity'), 1500);
    } catch (e) {
      setMsg('Failed: ' + e.message, 'err');
      sendBtn.disabled = false;
      sendBtn.textContent = 'Confirm & broadcast';
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
    summary,
    el('div', { style: 'height:8px' }),
    sendBtn,
  ]));
}

function row(k, v) {
  const right = typeof v === 'string' ? el('span', { class: 'v' }, [v]) : v;
  return el('div', { class: 'row' }, [el('span', { class: 'k' }, [k]), right]);
}
