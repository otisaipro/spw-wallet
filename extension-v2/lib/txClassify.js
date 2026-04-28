// Classify a raw chain tx (as returned by /explorer) from a given address's perspective.
// Returns { kind: 'mined'|'sent'|'received', amount: feathers, sign: '+'|'-' }.
//
// Direction logic mirrors the conventions of the web wallet but fixes its bug
// where inputs were filtered on a non-existent .address field. We derive the
// input's address from its pubkey instead.

import { spwAddress, hexToBytes } from './spw.js';

// Memoize pubkey-hex → address. Same pubkey often appears across many inputs
// (when one address spends multiple UTXOs); avoid re-doing ripemd160(sha256(...))
// + base58 each time.
const _addrCache = new Map();
function addrFromPubkeyHex(hex) {
  if (!hex || hex.length !== 66) return '';
  const cached = _addrCache.get(hex);
  if (cached !== undefined) return cached;
  let a = '';
  try { a = spwAddress(hexToBytes(hex)); } catch {}
  _addrCache.set(hex, a);
  return a;
}

export function classifyTx(tx, myAddress) {
  const outs = tx.outputs || [];
  const ins = tx.inputs || [];

  const isMined = !!tx.coinbase_data;
  const myReceived = outs
    .filter(o => o.address === myAddress)
    .reduce((s, o) => s + (o.amount || 0), 0);

  if (isMined) {
    return { kind: 'mined', amount: myReceived, sign: '+' };
  }

  let spent = false;
  for (const i of ins) {
    if (addrFromPubkeyHex(i.pubkey) === myAddress) { spent = true; break; }
  }

  if (spent) {
    const toOthers = outs
      .filter(o => o.address && o.address !== myAddress)
      .reduce((s, o) => s + (o.amount || 0), 0);
    return { kind: 'sent', amount: toOthers, sign: '-' };
  }

  return { kind: 'received', amount: myReceived, sign: '+' };
}
