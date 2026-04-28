# SPW Wallet Connect — Chrome Extension (MV3)

Injects `window.spw` on every page. Lets dApps detect that an SPW wallet is installed and route sign-in / payment requests without redirecting the user.

## Install locally (dev)

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top-right)
3. Click **Load unpacked**
4. Select this `extension/` folder
5. Pin the extension via the puzzle icon

Test on any page:
```js
window.spw            // object with { requestSignIn, requestPayment, isSPWWallet, version }
await window.spw.requestSignIn({ nonce: 'abcdef0123456789', app: 'test' })
```

Edge and Brave accept the same bundle (they're Chromium under the hood). Firefox needs a slightly different `manifest.json` (`browser_specific_settings`) — that's a v1.1 task.

## How it works (v1)

```
dApp page (MAIN world) ── window.spw.requestSignIn(opts) ──┐
                                                           │
                             window.open(                  │
                               "https://wallet.spw.network │
                                /#sign?nonce=…&app=…",     │
                               "spw_wallet", features)     ▼
                                                     ┌─────────────────┐
                                                     │ wallet popup    │
                                                     │ (the PWA)       │
                                                     │ user approves   │
                                                     └──────┬──────────┘
                                                            │ postMessage
                                                            ▼
dApp page  ◄── Promise resolve({address,pubkey,nonce,sig}) ──┘
```

Everything lives in `inject.js` (~90 lines). No background service worker, no `chrome.storage`, no key material held by the extension itself in v1. That keeps the attack surface small and the audit trivial.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | MV3 declaration |
| `content.js` | Relay script (ISOLATED world) — only injects `inject.js` |
| `inject.js` | Page-world; defines `window.spw` |
| `popup.html`, `popup.js` | Toolbar icon popup — status + "Open Full Wallet" |
| `icons/` | 16/32/48/128 PNG set |

## Publishing to Chrome Web Store

Steps you'll need to do yourself (I can't do these for you):

1. **Pay $5 developer registration fee** at <https://chrome.google.com/webstore/devconsole>. One-time, any Google account.
2. **Create a new item**, upload a ZIP of this folder (not the folder itself).
3. Fill in:
   - Privacy policy URL (you'll need to host one — I can draft it, but it needs to live on a domain you control).
   - Store listing: name, summary, long description, 1 small tile (440×280) + at least 1 screenshot (1280×800).
   - Permissions justification: explain why you need `<all_urls>` content script (answer: to inject `window.spw` so any dApp can detect the wallet).
4. **Submit for review.** Crypto-wallet extensions get extra scrutiny — expect 1–4 weeks.
5. Once approved, it appears in the store and is searchable.

**Important:** Google requires all extension code to be shipped locally — no remote imports. This bundle has no remote deps, so we're good.

## Roadmap

- **v1.1** — Firefox manifest variant, polish icons with SPW branding
- **v2** — In-extension key storage (chrome.storage.local + password-encrypted). Signing happens inside the extension, no popup required. Bigger audit lift; worth doing after the protocol is proven in the field.
