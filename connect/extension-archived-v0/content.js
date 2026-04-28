/*!
 * SPW Wallet — content script (ISOLATED world).
 * Only job: inject inject.js into the page's MAIN world so window.spw becomes
 * visible to dApp code. No further responsibilities in v1 — the injected
 * script handles the window.open + postMessage round-trip itself.
 */
(function () {
  try {
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('inject.js');
    s.onload = function () { s.remove(); };
    (document.head || document.documentElement).appendChild(s);
  } catch (e) {
    console.error('[spw-wallet] inject failed', e);
  }
})();
