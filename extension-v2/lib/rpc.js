// Thin wrapper over the SPW node REST API.
// Endpoint base read from the cached settings (primed at boot).

import { getSettingsSync } from './vault.js';

async function api(path, init) {
  const { rpcUrl } = getSettingsSync();
  const res = await fetch(rpcUrl.replace(/\/+$/, '') + path, init);
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
