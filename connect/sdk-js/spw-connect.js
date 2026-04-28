/*!
 * SPW Connect SDK — v1.0.0
 * Lets a dApp ask an SPW Wallet user to prove ownership of their address.
 * Spec: https://github.com/otisaipro/spw-wallet/blob/main/connect/SPEC.md
 *
 * Usage:
 *   <script src="https://spw.network/connect.js"></script>
 *   <script>
 *     const r = await SPWConnect.signIn({ nonce: "<from your backend>" });
 *     // r = { address, pubkey, nonce, sig }
 *     await fetch('/api/wallet/link', { method:'POST',
 *       headers:{'Content-Type':'application/json'},
 *       body: JSON.stringify(r) });
 *   </script>
 */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';
  var DEFAULT_WALLET_URL = 'https://wallet.spw.network';
  var POPUP_FEATURES = 'width=420,height=720,resizable=yes,scrollbars=yes';

  function err(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  function isExtensionAvailable() {
    return !!(global.spw && typeof global.spw.requestSignIn === 'function');
  }

  // Sign-in: extension preferred, web popup fallback.
  // opts = { nonce, app?, walletUrl?, timeoutMs?, preferExtension? }
  function signIn(opts) {
    opts = opts || {};
    if (!opts.nonce) {
      return Promise.reject(err('BAD_PARAMS', 'nonce is required'));
    }
    if (!/^[A-Za-z0-9_\-]{8,128}$/.test(opts.nonce)) {
      return Promise.reject(err('BAD_PARAMS', 'nonce must match [A-Za-z0-9_-]{8,128}'));
    }
    var app = opts.app != null ? String(opts.app) : (global.location && global.location.host) || '';
    if (app.length > 64) app = app.slice(0, 64);

    var preferExt = opts.preferExtension !== false;
    if (preferExt && isExtensionAvailable()) {
      return global.spw.requestSignIn({ nonce: opts.nonce, app: app });
    }
    return _popupSignIn({
      walletUrl: opts.walletUrl || DEFAULT_WALLET_URL,
      nonce: opts.nonce,
      app: app,
      timeoutMs: opts.timeoutMs || 5 * 60 * 1000,
    });
  }

  function _popupSignIn(cfg) {
    return new Promise(function (resolve, reject) {
      var qs =
        'nonce=' + encodeURIComponent(cfg.nonce) +
        '&app=' + encodeURIComponent(cfg.app);
      var url = cfg.walletUrl.replace(/\/+$/, '') + '/#sign?' + qs;
      var popup = global.open(url, 'spw_wallet_signin', POPUP_FEATURES);
      if (!popup) {
        return reject(err('POPUP_BLOCKED', 'Popup blocked. SDK must be called inside a user-gesture handler (e.g. click).'));
      }
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        try { popup.close(); } catch (_) {}
        cleanup();
        reject(err('TIMEOUT', 'User did not approve in time'));
      }, cfg.timeoutMs);
      var closedPoll = setInterval(function () {
        if (settled) return;
        if (popup.closed) {
          settled = true;
          cleanup();
          reject(err('USER_CANCELLED', 'Popup was closed before approval'));
        }
      }, 500);

      function onMessage(ev) {
        // Origin check: must match the wallet we opened.
        try {
          var walletOrigin = new URL(cfg.walletUrl).origin;
          if (ev.origin !== walletOrigin) return;
        } catch (_) {
          return;
        }
        var d = ev.data || {};
        if (!d || typeof d !== 'object') return;
        if (d.type === 'spw_sign_ok') {
          if (d.nonce !== cfg.nonce) return; // not ours
          settled = true;
          cleanup();
          resolve({ address: d.address, pubkey: d.pubkey, nonce: d.nonce, sig: d.sig });
        } else if (d.type === 'spw_sign_cancel') {
          if (d.nonce && d.nonce !== cfg.nonce) return;
          settled = true;
          cleanup();
          reject(err('USER_CANCELLED', 'User cancelled sign-in'));
        }
      }
      global.addEventListener('message', onMessage);

      function cleanup() {
        clearTimeout(timer);
        clearInterval(closedPoll);
        global.removeEventListener('message', onMessage);
      }
    });
  }

  // Payment request: opens the wallet's one-click confirm-and-send overlay.
  // opts = { to, amount, label?, memo?, walletUrl?, timeoutMs? }   amount is in feathers (integer)
  // memo: optional UTF-8 string (max 80 bytes) attached on-chain as OP_RETURN — use for order IDs
  function requestPayment(opts) {
    opts = opts || {};
    if (!opts.to || !opts.amount) {
      return Promise.reject(err('BAD_PARAMS', 'to and amount are required'));
    }
    var amount = parseInt(opts.amount, 10);
    if (!isFinite(amount) || amount <= 0) {
      return Promise.reject(err('BAD_PARAMS', 'amount must be a positive integer (feathers)'));
    }
    var memo = opts.memo || '';
    if (memo) {
      var memoBytes = (typeof TextEncoder !== 'undefined')
        ? new TextEncoder().encode(memo).length
        : unescape(encodeURIComponent(memo)).length;
      if (memoBytes > 80) {
        return Promise.reject(err('BAD_PARAMS', 'memo exceeds 80 bytes (got ' + memoBytes + ')'));
      }
    }
    var walletUrl = (opts.walletUrl || DEFAULT_WALLET_URL).replace(/\/+$/, '');
    var timeoutMs = opts.timeoutMs || 10 * 60 * 1000;

    // Extension hook (if/when implemented)
    if (global.spw && typeof global.spw.requestPayment === 'function') {
      return global.spw.requestPayment({ to: opts.to, amount: amount, label: opts.label || '', memo: memo });
    }

    return new Promise(function (resolve, reject) {
      var qs =
        'pay=' + encodeURIComponent(opts.to) +
        '&amount=' + amount +
        '&label=' + encodeURIComponent(opts.label || '') +
        (memo ? '&memo=' + encodeURIComponent(memo) : '');
      var url = walletUrl + '/?' + qs;
      var popup = global.open(url, 'spw_wallet_pay', POPUP_FEATURES);
      if (!popup) {
        return reject(err('POPUP_BLOCKED', 'Popup blocked. Call from user-gesture handler.'));
      }
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        try { popup.close(); } catch (_) {}
        cleanup();
        reject(err('TIMEOUT', 'User did not confirm in time'));
      }, timeoutMs);
      var closedPoll = setInterval(function () {
        if (settled) return;
        if (popup.closed) {
          settled = true;
          cleanup();
          reject(err('USER_CANCELLED', 'Popup closed before confirmation'));
        }
      }, 500);

      function onMessage(ev) {
        try {
          var walletOrigin = new URL(walletUrl).origin;
          if (ev.origin !== walletOrigin) return;
        } catch (_) {
          return;
        }
        var d = ev.data || {};
        if (!d || typeof d !== 'object') return;
        if (d.type === 'spw_payment_success') {
          settled = true;
          cleanup();
          resolve({ txid: d.txid });
        } else if (d.type === 'spw_payment_cancel') {
          settled = true;
          cleanup();
          reject(err('USER_CANCELLED', 'User cancelled payment'));
        }
      }
      global.addEventListener('message', onMessage);

      function cleanup() {
        clearTimeout(timer);
        clearInterval(closedPoll);
        global.removeEventListener('message', onMessage);
      }
    });
  }

  var SPWConnect = {
    VERSION: VERSION,
    signIn: signIn,
    requestPayment: requestPayment,
    isAvailable: isExtensionAvailable,
    isExtensionAvailable: isExtensionAvailable,
  };

  // UMD-ish export
  if (typeof module === 'object' && module.exports) {
    module.exports = SPWConnect;
  }
  global.SPWConnect = SPWConnect;
})(typeof window !== 'undefined' ? window : this);
