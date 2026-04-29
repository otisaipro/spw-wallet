// Shared in-memory cache for chain reads, used by Home and Activity.
// Each cached entry is keyed by the user's address; switching screens (Home ↔
// Activity) reuses the same data instead of re-fetching.
//
// Each call returns the cached value if fresh, otherwise kicks off a fetch.
// Multiple concurrent callers share the same in-flight promise (no thundering
// herd).

import { getBalance, getExplorer, getUtxos } from './rpc.js';

const TTL_MS = 30_000;          // hard freshness — younger than this = fresh

const _balance = new Map();      // addr → { v, t }
const _explorer = new Map();     // addr → { v, t, txsReversed }
const _inflight = new Map();     // key → Promise

function _now() { return Date.now(); }

function _share(key, factory) {
  const existing = _inflight.get(key);
  if (existing) return existing;
  const p = factory().finally(() => _inflight.delete(key));
  _inflight.set(key, p);
  return p;
}

// ── Balance ─────────────────────────────────────────────────────────
export function getCachedBalance(addr) {
  const e = _balance.get(addr);
  if (!e) return null;
  if (_now() - e.t > TTL_MS) return null;
  return e.v;
}

export function fetchBalance(addr, { force = false } = {}) {
  if (!force) {
    const cached = _balance.get(addr);
    if (cached && _now() - cached.t < TTL_MS) return Promise.resolve(cached.v);
  }
  return _share('bal:' + addr, async () => {
    const v = await getBalance(addr);
    _balance.set(addr, { v, t: _now() });
    return v;
  });
}

// ── Explorer (transaction history) ──────────────────────────────────
export function getCachedExplorer(addr) {
  const e = _explorer.get(addr);
  if (!e) return null;
  if (_now() - e.t > TTL_MS) return null;
  return e;
}

export function fetchExplorer(addr, { force = false } = {}) {
  if (!force) {
    const cached = _explorer.get(addr);
    if (cached && _now() - cached.t < TTL_MS) return Promise.resolve(cached);
  }
  return _share('exp:' + addr, async () => {
    const data = await getExplorer(addr);
    const txs = (data && data.transactions) || [];
    const txsReversed = txs.slice().reverse();
    const entry = { v: data, txsReversed, t: _now() };
    _explorer.set(addr, entry);
    return entry;
  });
}

// Prefetch both balance and explorer in parallel, ignoring errors.
// Called from boot/unlock so the data is already in the cache by the time
// the user actually looks at Home.
export function prefetchAll(addr) {
  if (!addr) return;
  fetchBalance(addr).catch(() => {});
  fetchExplorer(addr).catch(() => {});
}

export function invalidate(addr) {
  if (addr) {
    _balance.delete(addr);
    _explorer.delete(addr);
  } else {
    _balance.clear();
    _explorer.clear();
  }
}

// ── Pending-spent UTXO tracker (anti-double-spend in-wallet) ────────
// /utxos/<addr> only knows about CONFIRMED state. If the user broadcasts a
// tx and immediately tries to send another, both selections will see the
// same UTXOs as available — the second tx will conflict with the first
// once a block lands. We compensate by remembering UTXOs we already spent
// in flight, so subsequent sends skip them. Entries are dropped when the
// confirmed UTXO set no longer reports them (the tx confirmed) or after
// a TTL (we gave up on this tx).
const PENDING_TTL_MS = 10 * 60 * 1000; // 10 min — much longer than typical block time
const _pendingSpent = new Map(); // "txid:vout" → expiry timestamp

function _gcPending() {
  const now = _now();
  for (const [k, exp] of _pendingSpent) if (exp < now) _pendingSpent.delete(k);
}

export function markUtxosPendingSpent(utxos) {
  const exp = _now() + PENDING_TTL_MS;
  for (const u of utxos) _pendingSpent.set(`${u.txid}:${u.vout}`, exp);
}

// Fetch /utxos and filter out anything we have a pending-spent record for.
// Also self-heals: if a UTXO is no longer in the confirmed list we remove
// it from the pending tracker (it confirmed and was consumed).
export async function fetchAvailableUtxos(addr) {
  _gcPending();
  const resp = await getUtxos(addr);
  const all = (resp && resp.utxos) ? resp.utxos
            : (Array.isArray(resp) ? resp : []);
  const seen = new Set(all.map(u => `${u.txid}:${u.vout}`));
  for (const k of _pendingSpent.keys()) {
    if (!seen.has(k)) _pendingSpent.delete(k); // confirmed/cleared
  }
  return all.filter(u => !_pendingSpent.has(`${u.txid}:${u.vout}`));
}
