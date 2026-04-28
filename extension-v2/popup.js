// Top-level router. Single popup; routes are inlined into #content.
// Three modes:
//   1. No vault       → onboarding
//   2. Vault, locked  → unlock screen
//   3. Vault, unlocked → main app (home/send/receive/activity), bottom nav visible
//
// All screens are statically imported so tab switches never wait on a network
// fetch / module parse. The cached session and settings (lib/vault.js) make
// each screen render synchronous up to the point of fetching chain data.

import { hasVault, getSession, getSessionSync, getSettings, lock, touchSession } from './lib/vault.js';
import { renderOnboarding } from './screens/onboarding.js';
import { renderUnlock } from './screens/unlock.js';
import { renderHome } from './screens/home.js';
import { renderSend } from './screens/send.js';
import { renderReceive } from './screens/receive.js';
import { renderActivity } from './screens/activity.js';
import { renderSettings } from './screens/settings.js';
import { prefetchAll, fetchBalance, invalidate } from './lib/chainCache.js';
import { $, $$, toast } from './lib/ui.js';

const content = document.getElementById('content');
const header = document.getElementById('app-header');
const nav = document.getElementById('bottom-nav');
const netStatus = document.getElementById('net-status');

const RENDERERS = {
  home: renderHome,
  send: renderSend,
  receive: renderReceive,
  activity: renderActivity,
  settings: renderSettings,
};

const router = {
  current: null,
  go(tab) {
    this.current = tab;
    setActiveNav(tab);
    touchSession(); // fire-and-forget: extend expiry without blocking render
    const fn = RENDERERS[tab] || RENDERERS.home;
    return fn(content, this);
  },
  reload() {
    boot();
  },
};

function setActiveNav(tab) {
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
}

function showChrome(show) {
  header.classList.toggle('hidden', !show);
  nav.classList.toggle('hidden', !show);
}

async function boot() {
  // Prime the settings + session caches before deciding the mode. The third
  // promise (getSettings) is awaited for its caching side effect — needed so
  // getSettingsSync() returns a real value during synchronous renders below.
  await getSettings();
  const [vaultExists, sess] = await Promise.all([hasVault(), getSession()]);
  if (!vaultExists) {
    showChrome(false);
    return renderOnboarding(content, () => boot());
  }
  if (!sess) {
    showChrome(false);
    return renderUnlock(
      content,
      () => boot(),
      () => boot()
    );
  }
  // Kick off chain reads in the background while we paint the UI; by the time
  // Home's render handlers attach, the fetches are likely already in flight or
  // resolved.
  prefetchAll(sess.address);
  showChrome(true);
  router.go(router.current || 'home');
}

// ── Wire chrome buttons ──
$('#hdr-lock').addEventListener('click', async () => {
  await lock();
  invalidate();
  toast('Locked');
  boot();
});
$('#hdr-settings').addEventListener('click', () => router.go('settings'));
$$('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => router.go(btn.dataset.tab));
});

// ── Idle check while popup open (uses cached session, no storage hits) ──
setInterval(() => {
  if (!router.current) return;
  if (!getSessionSync()) {
    toast('Locked due to inactivity');
    boot();
  }
}, 5_000);

// ── Network heartbeat ──
// Every 20s, try a cheap balance read to confirm the node is reachable.
// Updates the header MAINNET dot to red when offline. Re-uses the chainCache
// so this also keeps the cached balance fresh while the popup is open.
async function heartbeat() {
  const sess = getSessionSync();
  if (!sess) return;
  try {
    await fetchBalance(sess.address);
    netStatus.classList.remove('offline');
    netStatus.title = 'Connected to spw.network';
  } catch {
    netStatus.classList.add('offline');
    netStatus.title = 'Could not reach spw.network';
  }
}
setInterval(heartbeat, 20_000);
// Also kick a heartbeat right after boot so the dot reflects reality on open,
// not 20 s later.
setTimeout(heartbeat, 1500);

// Refresh expiry on user activity (cached only, fire-and-forget).
['click', 'keydown', 'input'].forEach(evt =>
  document.addEventListener(evt, () => { touchSession(); }, { passive: true })
);

boot();
