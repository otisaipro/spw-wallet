# Chrome Web Store — Listing Copy & Justifications

**Paste these into the Developer Dashboard when submitting.**
This v1.0 is a **complete, self-contained wallet** — every action (account creation,
balance display, send, receive, history) happens inside the extension. There is no
"open another website" button, no remote code execution, no dApp integration in this
release. This addresses the prior rejection (reference Yellow Nickel) which flagged
the previous build as a launcher because its popup only opened wallet.spw.network.

---

## 1. Product identity

| Field | Value |
|---|---|
| **Name** (max 45) | `SPW Wallet` |
| **Summary** (max 132) | `Self-custody wallet for the SPW network. Create or import an account, view balance, send and receive — all inside the browser.` |
| **Category** | Productivity |
| **Language** | English |

> Renamed from "SPW Wallet Connect" — the previous name reflected a thin SDK bridge
> design. This is now a full wallet that genuinely manages keys.

---

## 2. Detailed description

Paste verbatim:

```
SPW Wallet is a self-custody wallet for the SPW network, built as a Chrome extension.
Everything happens inside the extension popup — there is no website to redirect to,
no remote code, no dApp integration in this release.

WHAT IT DOES
• Create a new wallet — generates a 12-word BIP-39 recovery phrase locally, then
  encrypts your keys with a password using PBKDF2 (600,000 iterations) and AES-GCM.
  The encrypted vault is stored in chrome.storage.local; the password is never sent
  anywhere.
• Import an existing wallet from a 12 or 24-word BIP-39 phrase.
• Show your address with a QR code for receiving SPW.
• Show your current balance, queried from the SPW node REST API.
• Send SPW to any address, with optional 80-byte memo. The transaction is signed
  locally with secp256k1 and broadcast to the SPW node's /tx/broadcast endpoint.
• Browse your transaction history.
• Reveal your recovery phrase (password-gated, with auto-clearing clipboard).
• 15-minute idle auto-lock; locks immediately on browser close.

WHAT IT DOES NOT DO
• It does not collect, transmit, or analyze any user data.
• It does not load any remote code — all JavaScript executes from the bundle inside
  this extension.
• It does not inject scripts into web pages and does not interact with dApps in this
  release. (dApp integration may come in a future version, with explicit user
  approval flows.)
• It does not support tokens other than SPW.
• It does not require an account, sign-up, or any external service.

PRIVACY
• Zero data collection. The only network traffic is between this extension and the
  SPW node REST API at https://spw.network/api, used to fetch your balance, list
  transactions, and broadcast signed transactions.
• Full privacy policy: https://spw.network/privacy

TECHNICAL
• Manifest V3. Chromium-based browsers, Chrome 102+.
• All cryptography runs in-browser using @noble/secp256k1 (signing), @noble/hashes
  (sha-256, ripemd-160, hmac, sha-512), @scure/bip39 (mnemonic), and qrcode (the
  receive-screen QR code). These libraries are bundled into the extension; no
  remote loading.
• Encryption: PBKDF2-SHA256 (600k iterations) → AES-256-GCM, via the browser's
  built-in SubtleCrypto.
• Source code: https://github.com/otisaipro/spw-wallet
```

---

## 3. Single-purpose statement

```
A self-custody wallet for the SPW network. The extension lets a user create or
import an account, view balance, send and receive SPW — all locally, with keys
encrypted on this device.
```

---

## 4. Permissions — justifications

### `storage`

```
The wallet persists the encrypted keystore (PBKDF2 + AES-GCM ciphertext only —
plaintext keys never touch persistent storage) using chrome.storage.local.
Decrypted signing material (address + private key bytes; never the mnemonic) is
held only in chrome.storage.session, which is cleared automatically when the
browser closes. The mnemonic is decrypted on demand only when the user
explicitly requests "Show recovery phrase" and re-enters their password.
```

### `host_permissions: https://spw.network/*`

```
The wallet queries the user's balance, fetches UTXOs for transaction construction,
and broadcasts signed transactions through the SPW node's REST API at
https://spw.network/api. No other hosts are contacted from extension code.
```

### Other permissions

```
None requested. The extension has no content scripts, no service worker, no
tabs/scripting access, no <all_urls> grant, no clipboard permission, no identity
permission. It is a popup-only extension that makes outbound fetch() calls to
https://spw.network and nowhere else.
```

---

## 5. Remote code declaration

Answer **"No, I am not using remote code."**

If asked to elaborate:

```
All JavaScript and WebAssembly executed by the extension ships inside the uploaded
ZIP. The bundle was produced with esbuild from npm packages (versions pinned in
package.json) and committed verbatim to vendor/spw-vendor.bundle.mjs. The only
network activity is browser-initiated fetch() calls to the configured SPW node
REST API to read on-chain state and submit signed transactions.
```

---

## 6. Privacy practices (checkboxes)

- [x] **I do not collect or use user data.**
- [x] I certify that my data usage complies with the Developer Program Policies.
- [x] I am not selling user data.
- [x] I am not using user data for credit-worthiness, lending, or unrelated purposes.

---

## 7. URLs

| Field | Value |
|---|---|
| **Website** | `https://spw.network` |
| **Privacy policy URL** | `https://spw.network/privacy` |
| **Support URL** | `https://github.com/otisaipro/spw-wallet/issues` |

---

## 8. Assets checklist

| Asset | Size | Status |
|---|---|---|
| Store icon | 128×128 PNG | ✓ `icons/icon-128.png` |
| Screenshot 1 — Home (balance + actions) | 1280×800 PNG | TODO |
| Screenshot 2 — Send | 1280×800 PNG | TODO |
| Screenshot 3 — Receive (QR) | 1280×800 PNG | TODO |
| Screenshot 4 — Activity | 1280×800 PNG | TODO |
| Small promo tile | 440×280 PNG | optional |
| Marquee promo | 1400×560 PNG | optional |

To generate screenshots: load the unpacked extension in Chrome, set up a test wallet,
take screenshots of each tab, then composite them onto a 1280×800 background.

---

## 9. Review notes box (optional but recommended)

```
Hi reviewer,

This v1.0 is a complete self-custody wallet for the SPW network. All operations —
account creation, balance display, send, receive, transaction history — happen
inside the extension popup. There is no "open another website" action and no
dApp / window.spw injection.

The previous submission ("SPW Wallet Connect") was correctly flagged because its
popup only had an "Open Full Wallet" button that opened wallet.spw.network. That
build has been replaced entirely. This is a different product:

  • New name: SPW Wallet
  • New popup: full wallet UI (home, send, receive, activity, settings)
  • New manifest: no content scripts, no <all_urls>, no web_accessible_resources
  • Permissions reduced to "storage" + host_permissions for spw.network only
  • Keys encrypted with password (PBKDF2-SHA256 600k → AES-GCM 256)
  • Decrypted material lives only in chrome.storage.session (auto-cleared on
    browser close); 15-min idle lock enforced inside the popup

All cryptographic libraries (@noble/secp256k1, @noble/hashes, @scure/bip39, qrcode)
are bundled into vendor/spw-vendor.bundle.mjs via esbuild — no remote loading.

Source code is public at https://github.com/otisaipro/spw-wallet — the entire
extension is auditable. Specifically:
  • lib/crypto.js  — vault encryption
  • lib/spw.js     — secp256k1 + BIP-39 + BIP-32 + SPW address derivation
  • lib/rpc.js     — node REST API client
  • screens/*.js   — UI

Thank you!
```

---

## 10. Pre-submission final check

- [ ] `manifest.json` version matches the ZIP name (1.0.0 → spw-wallet-v1.0.0.zip)
- [ ] No `console.log` / debug prints in shipped JS
- [ ] `PRIVACY.md` content is live at https://spw.network/privacy
- [ ] Screenshots are 1280×800 exactly
- [ ] ZIP has `manifest.json` at root, not nested in a folder
- [ ] Loaded as unpacked in Chrome and:
  - [ ] Onboarding (create) works end-to-end
  - [ ] Onboarding (import) works with a known mnemonic
  - [ ] Lock / unlock with password works
  - [ ] Balance loads on home
  - [ ] Receive shows the correct QR
  - [ ] Send a tiny test transaction successfully
  - [ ] Activity lists the send
