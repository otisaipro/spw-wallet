/*!
 * SPW Wallet — page-world injection. Defines window.spw.
 * v1 is a compatibility shim: calls forward to wallet.spw.network via a popup
 * window (same as the SDK web fallback). The difference is that dApps can
 * detect "wallet available" via `if (window.spw)`.
 * A future v2 will sign locally using keys stored in chrome.storage.
 */
(function () {
  'use strict';
  if (window.spw) return; // another wallet got there first — don't overwrite

  var WALLET_ORIGIN = 'https://wallet.spw.network';
  var POPUP_FEATURES = 'width=420,height=720,resizable=yes,scrollbars=yes';

  function err(code, message) {
    var e = new Error(message);
    e.code = code;
    return e;
  }

  function openAndAwait(url, handlers, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var popup = window.open(url, 'spw_wallet', POPUP_FEATURES);
      if (!popup) {
        return reject(err('POPUP_BLOCKED', 'Popup blocked — call from a user gesture'));
      }
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        try { popup.close(); } catch (_) {}
        cleanup();
        reject(err('TIMEOUT', 'No response from wallet'));
      }, timeoutMs);
      var closedPoll = setInterval(function () {
        if (settled) return;
        if (popup.closed) {
          settled = true;
          cleanup();
          reject(err('USER_CANCELLED', 'Wallet closed'));
        }
      }, 500);

      function onMessage(ev) {
        if (ev.source !== popup) return;
        if (ev.origin !== WALLET_ORIGIN) return;
        var d = ev.data || {};
        var outcome = handlers[d.type];
        if (!outcome) return;
        settled = true;
        cleanup();
        if (outcome === 'resolve') {
          var type = d.type;
          var copy = {};
          for (var k in d) if (k !== 'type') copy[k] = d[k];
          resolve(copy);
        } else {
          reject(err('USER_CANCELLED', 'User cancelled'));
        }
      }
      window.addEventListener('message', onMessage);

      function cleanup() {
        clearTimeout(timer);
        clearInterval(closedPoll);
        window.removeEventListener('message', onMessage);
      }
    });
  }

  function requestSignIn(opts) {
    opts = opts || {};
    if (!opts.nonce || !/^[A-Za-z0-9_\-]{8,128}$/.test(opts.nonce)) {
      return Promise.reject(err('BAD_PARAMS', 'nonce must match [A-Za-z0-9_-]{8,128}'));
    }
    var app = String(opts.app || location.host).slice(0, 64);
    var url =
      WALLET_ORIGIN + '/#sign?nonce=' + encodeURIComponent(opts.nonce) +
      '&app=' + encodeURIComponent(app);
    return openAndAwait(url, { spw_sign_ok: 'resolve', spw_sign_cancel: 'reject' }, 5 * 60 * 1000);
  }

  function requestPayment(opts) {
    opts = opts || {};
    if (!opts.to || !opts.amount) {
      return Promise.reject(err('BAD_PARAMS', 'to and amount required'));
    }
    var memo = opts.memo || '';
    if (memo) {
      var memoBytes = (typeof TextEncoder !== 'undefined')
        ? new TextEncoder().encode(memo).length
        : unescape(encodeURIComponent(memo)).length;
      if (memoBytes > 80) {
        return Promise.reject(err('BAD_PARAMS', 'memo exceeds 80 bytes'));
      }
    }
    var url =
      WALLET_ORIGIN + '/?pay=' + encodeURIComponent(opts.to) +
      '&amount=' + parseInt(opts.amount, 10) +
      '&label=' + encodeURIComponent(opts.label || '') +
      (memo ? '&memo=' + encodeURIComponent(memo) : '');
    return openAndAwait(
      url,
      { spw_payment_success: 'resolve', spw_payment_cancel: 'reject' },
      10 * 60 * 1000
    );
  }

  window.spw = {
    version: '1.0.0',
    isSPWWallet: true,
    requestSignIn: requestSignIn,
    requestPayment: requestPayment,
  };

  window.dispatchEvent(new Event('spw#initialized'));
})();
