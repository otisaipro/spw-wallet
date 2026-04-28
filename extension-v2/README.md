# SPW Wallet — Chrome extension

Self-custody wallet for the SPW network. Complete in-extension UI: create / import
account, view balance, send and receive, transaction history. No remote code, no
website redirects, no dApp injection.

## Build

```sh
npm install
npm run bundle    # produces vendor/spw-vendor.bundle.mjs
```

`vendor/spw-vendor.bundle.mjs` is the only artifact required at runtime — it is
checked into the repo so reviewers can audit it directly. To re-bundle from
source, run `npm run bundle`. esbuild output is reproducible across runs given
the same input, esbuild version (pinned in `package.json`), and Node version
(see `.nvmrc` / `engines`); minor build-tooling differences may produce
trivially different bytes that still match function-by-function.

## Layout

```
manifest.json           — MV3 manifest, popup-only
popup.html / popup.js   — single popup, top-level router
styles/main.css         — all styling
lib/
  crypto.js   — PBKDF2 + AES-GCM via SubtleCrypto
  vault.js    — chrome.storage abstraction (local for ciphertext, session for unlocked)
  spw.js      — secp256k1, BIP-39, BIP-32, SPW address (D-prefix), tx digest
  rpc.js      — REST client for the SPW node
  ui.js       — DOM helpers, toast, copy
screens/
  onboarding.js — welcome / create / import / set password
  unlock.js     — password prompt
  home.js       — balance + actions + recent
  send.js       — build + sign + broadcast
  receive.js    — address + QR
  activity.js   — transaction history
  settings.js   — node URL, reveal phrase, change password, lock, reset
vendor/
  spw-vendor.bundle.mjs — esbuild output of all crypto deps (170 KB, ESM)
icons/        — 16 / 32 / 48 / 128 PNGs
```

## Permissions

- `storage`
- `host_permissions: https://spw.network/*`

No content scripts. No service worker. No `<all_urls>`. No `tabs`.

## Security model

- Mnemonic generated locally via @scure/bip39 (CSPRNG entropy from
  `crypto.getRandomValues`).
- Vault = `AES-GCM(plaintext = JSON({mnemonic, spendHex, viewHex, address}),
  key = PBKDF2-SHA256(password, salt, 600_000 iters))`.
- Decrypted **signing material** (address + spendHex + viewHex) lives in
  `chrome.storage.session`. **The mnemonic is stripped before session storage**
  and is only re-decrypted on demand when the user confirms with their password
  (e.g. "Show recovery phrase" in Settings). Browser close ⇒ storage.session
  cleared automatically. Idle 15 min ⇒ popup checks on open and on a 5 s
  interval, clears session if expired.
- Signing uses synchronous secp256k1 (canonical, DER) inside the popup, gated
  by a password re-prompt before each broadcast.
- No background page, so no long-lived process holding keys after popup close.

## Testing

Manual smoke test: load `extension-v2/` as unpacked in `chrome://extensions`,
run through:
1. Create wallet → confirm phrase → set password → unlocked home appears.
2. Lock (header button) → unlock with password.
3. Wait 15 minutes → popup auto-locks.
4. Receive → QR shows your D-prefix address.
5. Send a tiny amount to yourself → activity tab shows the tx.
6. Settings → reveal phrase (password-gated).
