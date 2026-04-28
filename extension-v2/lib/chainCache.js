// Shared in-memory cache for chain reads, used by Home and Activity.
// Each cached entry is keyed by the user's address; switching screens (Home ↔
// Activity) reuses the same data instead of re-fetching.
//
// Each call returns the cached value if fresh, otherwise kicks off a fetch.
// Multiple concurrent callers share the same in-flight promise (no thundering
// herd). Stale-while-revalidate semantics: a soft-stale cache resolves
// immediately and a background refresh runs.

import { getBalance, getExplorer } from './rpc.js';

const TTL_MS = 30_000;          // hard freshness — younger than this = fresh
const SOFT_TTL_MS = 5_000;       // serve stale + revalidate when older than this

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

// Stale-while-revalidate: returns the cached entry instantly if present,
// kicks off a background refresh if older than SOFT_TTL_MS.
// Caller may pass an onUpdate callback to be notified when fresh data arrives.
export function readBalanceSWR(addr, onUpdate) {
  const cached = _balance.get(addr);
  if (cached && _now() - cached.t < SOFT_TTL_MS) return Promise.resolve(cached.v);
  const fresh = fetchBalance(addr);
  if (cached) {
    fresh.then(v => onUpdate && onUpdate(v)).catch(() => {});
    return Promise.resolve(cached.v);
  }
  return fresh;
}

export function readExplorerSWR(addr, onUpdate) {
  const cached = _explorer.get(addr);
  if (cached && _now() - cached.t < SOFT_TTL_MS) return Promise.resolve(cached);
  const fresh = fetchExplorer(addr);
  if (cached) {
    fresh.then(e => onUpdate && onUpdate(e)).catch(() => {});
    return Promise.resolve(cached);
  }
  return fresh;
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
