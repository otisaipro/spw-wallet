// Storage layer.
//   chrome.storage.local   — encrypted vault, persisted across browser restarts
//   chrome.storage.session — decrypted *signing material* (spendHex, viewHex,
//                            address) only — never the mnemonic. Cleared on
//                            browser close.
//
// Locked state  = no decrypted material in session.
// Unlock        = decrypt vault, place {address, spendHex, viewHex, expiry} in session.
// Reveal phrase = re-prompt password and decrypt vault on demand. The mnemonic
//                 never lives outside that synchronous call's stack.
// Auto-lock     = expiry timestamp; popup checks on open and on each action.

import { encryptVault, decryptVault } from './crypto.js';

const VAULT_KEY = 'vault';
const SETTINGS_KEY = 'settings';
const SESSION_KEY = 'sess';
const IDLE_MS = 15 * 60 * 1000; // 15 minutes — common browser-wallet default

const DEFAULT_SETTINGS = {
  rpcUrl: 'https://spw.network/api',
  idleMs: IDLE_MS,
};

// ── chrome.storage helpers ──────────────────────────────────────────
function localGet(key) {
  return new Promise(r => chrome.storage.local.get(key, o => r(o[key])));
}
function localSet(obj) {
  return new Promise(r => chrome.storage.local.set(obj, r));
}
function localRemove(keys) {
  return new Promise(r => chrome.storage.local.remove(keys, r));
}
function sessGet(key) {
  return new Promise(r => chrome.storage.session.get(key, o => r(o[key])));
}
function sessSet(obj) {
  return new Promise(r => chrome.storage.session.set(obj, r));
}
function sessClear() {
  return new Promise(r => chrome.storage.session.clear(r));
}

// ── In-memory caches (popup-lifetime only) ──────────────────────────
// The Chrome popup is a single JS context; module-level state dies on close,
// so caching here cannot leak across popup instances. We re-validate
// against chrome.storage on the operations that need durability.
let _sessionCache = null;       // null | { ...payload, expiry }
let _sessionChecked = false;    // have we read from storage at least once?
let _settingsCache = null;      // null | settings object

// ── Vault (locked, on disk) ─────────────────────────────────────────
export async function hasVault() {
  return !!(await localGet(VAULT_KEY));
}

export async function createVault(payload, password) {
  const blob = await encryptVault(payload, password);
  await localSet({ [VAULT_KEY]: blob });
}

export async function destroyVault() {
  await localRemove([VAULT_KEY]);
  _sessionCache = null;
  _sessionChecked = true;
  await sessClear();
}

// ── Session (unlocked, in memory) ───────────────────────────────────
// Strip the mnemonic before placing material in the session. Signing only
// needs spendHex/viewHex/address; the mnemonic is decrypted again from the
// vault when the user explicitly asks to reveal it (and re-enters password).
function _stripMnemonic(payload) {
  const { mnemonic, ...rest } = payload;
  return rest;
}

export async function unlock(password) {
  const blob = await localGet(VAULT_KEY);
  if (!blob) throw new Error('No wallet found');
  const payload = await decryptVault(blob, password);
  const settings = await getSettings();
  const safe = _stripMnemonic(payload);
  const sess = { ...safe, expiry: Date.now() + settings.idleMs };
  _sessionCache = sess;
  _sessionChecked = true;
  sessSet({ [SESSION_KEY]: sess });
  return safe;
}

// Decrypt the vault on demand to retrieve the mnemonic. The caller must verify
// the user typed the correct password (the wrong password throws here too).
// Resolves to the mnemonic string. Caller is expected to display it briefly
// then drop the reference.
export async function revealMnemonic(password) {
  const blob = await localGet(VAULT_KEY);
  if (!blob) throw new Error('No wallet found');
  const payload = await decryptVault(blob, password);
  if (!payload.mnemonic) throw new Error('This wallet has no recoverable mnemonic');
  return payload.mnemonic;
}

// Synchronous: returns the cached session if present and not expired.
// Use when calling code already runs after a getSession() / boot() that primed the cache.
export function getSessionSync() {
  if (!_sessionCache) return null;
  if (Date.now() > _sessionCache.expiry) {
    _sessionCache = null;
    sessClear();
    return null;
  }
  return _sessionCache;
}

export async function getSession() {
  if (_sessionChecked) return getSessionSync();
  const s = await sessGet(SESSION_KEY);
  _sessionChecked = true;
  if (!s) { _sessionCache = null; return null; }
  if (Date.now() > s.expiry) {
    _sessionCache = null;
    await sessClear();
    return null;
  }
  _sessionCache = s;
  return s;
}

// Fire-and-forget: caller does not need to await. Extends expiry on the cached
// session and writes through asynchronously. Safe to call frequently.
export function touchSession() {
  if (!_sessionCache) return;
  const idle = (_settingsCache && _settingsCache.idleMs) || IDLE_MS;
  _sessionCache.expiry = Date.now() + idle;
  // No await — chrome.storage.session.set is just a backup for the timeout
  // detector; the cached value is the source of truth within this popup.
  sessSet({ [SESSION_KEY]: _sessionCache });
}

export async function lock() {
  _sessionCache = null;
  _sessionChecked = true;
  await sessClear();
}

// ── Settings (plaintext, on disk) ───────────────────────────────────
export function getSettingsSync() {
  return _settingsCache || DEFAULT_SETTINGS;
}

export async function getSettings() {
  if (_settingsCache) return _settingsCache;
  const s = await localGet(SETTINGS_KEY);
  _settingsCache = { ...DEFAULT_SETTINGS, ...(s || {}) };
  return _settingsCache;
}

export async function setSettings(patch) {
  const cur = await getSettings();
  const next = { ...cur, ...patch };
  _settingsCache = next;
  await localSet({ [SETTINGS_KEY]: next });
  return next;
}

// ── Password verification (used by sensitive ops like reveal mnemonic) ──
export async function verifyPassword(password) {
  const blob = await localGet(VAULT_KEY);
  if (!blob) throw new Error('No wallet found');
  try {
    await decryptVault(blob, password);
    return true;
  } catch {
    return false;
  }
}

// ── Re-encrypt with new password ────────────────────────────────────
export async function changePassword(oldPwd, newPwd) {
  const blob = await localGet(VAULT_KEY);
  const payload = await decryptVault(blob, oldPwd);
  const next = await encryptVault(payload, newPwd);
  await localSet({ [VAULT_KEY]: next });
}
