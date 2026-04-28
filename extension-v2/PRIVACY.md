# SPW Wallet — Privacy Policy

_Last updated: 2026-04-27_

## Summary

**SPW Wallet collects nothing.** No analytics. No telemetry. No accounts. No
sign-up. The extension stores your encrypted recovery phrase on this device only.

## What is stored locally

The extension uses the browser's storage APIs:

- **`chrome.storage.local`** (persists across browser restarts):
  - The encrypted vault (your mnemonic + private keys, after PBKDF2-SHA256 600,000-
    iteration key derivation and AES-256-GCM encryption with your password).
- **`chrome.storage.session`** (cleared when the browser closes):
  - The decrypted address and signing key material — only while you are unlocked.
    The mnemonic is **never** placed in session storage; it is only decrypted on
    demand when you explicitly choose "Show recovery phrase" and re-enter your
    password.

Your password is never stored anywhere. It only exists transiently in memory while
you type it. If you forget your password, you must restore from your 12-word
recovery phrase.

## What is sent over the network

The extension makes HTTPS requests to one host: the SPW node REST API at
`https://spw.network/api`. The requests are:

- `GET /balance/{your_address}` — read your balance
- `GET /utxos/{your_address}` — read your unspent outputs (for send)
- `GET /explorer/{your_address}` — read your transaction history
- `POST /tx/broadcast` — submit a transaction you have signed

These requests contain only your public address and signed transactions. They do
not contain your password, private key, or recovery phrase, and they never will.

The extension makes no other outbound requests. It does not contact analytics
services, ad networks, error reporters, or any third party.

## What is sent to your computer's clipboard

When you press "Copy address", "Copy phrase", or "Copy txid", the relevant text is
written to your operating system clipboard via the standard browser clipboard API.
The extension itself does not read your clipboard.

## Permissions

- `storage` — required to persist the encrypted vault and your settings.
- `host_permissions: https://spw.network/*` — required to query balance and
  broadcast transactions. This is the only host the extension is permitted to
  contact.

The extension does **not** request `tabs`, `activeTab`, `scripting`, `<all_urls>`,
notifications, or any other broad permission. It has no content scripts.

## Source code

The full source is published at https://github.com/otisaipro/spw-wallet — every
line of JavaScript that runs in the extension can be audited there.

## Contact

For privacy questions or issues: https://github.com/otisaipro/spw-wallet/issues
