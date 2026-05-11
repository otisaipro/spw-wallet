// Thin wrapper over the SPW node REST API.
// Endpoint base read from the cached settings (primed at boot).

import { getSettingsSync } from './vault.js';

// Cap how long any single request can hang. Without this, Chrome's fetch()
// will sit on a stalled HTTP/2 socket for minutes — the user-visible symptom
// was the Send screen spinning indefinitely when the node was momentarily
// blocked (e.g. during block-add). The thrown error is tagged so the caller
// can show a clearer message than "network error".
const REQUEST_TIMEOUT_MS = 30000;

async function api(path, init) {
  const { rpcUrl } = getSettingsSync();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(rpcUrl.replace(/\/+$/, '') + path, { ...(init || {}), signal: ctrl.signal });
  } catch (e) {
    if (e.name === 'AbortError') {
      const err = new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
      err.code = 'TIMEOUT';
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

export function getBalance(address) {
  return api(`/balance/${encodeURIComponent(address)}`);
}

export function getUtxos(address) {
  return api(`/utxos/${encodeURIComponent(address)}`);
}

export function getExplorer(address) {
  return api(`/explorer/${encodeURIComponent(address)}`);
}

export function broadcastTx(txObject) {
  return api('/tx/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(txObject),
  });
}
