# spw-connect

Front-end SDK for dApps that want to authenticate users against an [SPW Wallet](https://github.com/otisaipro/spw-wallet). Single file, zero dependencies, framework-agnostic.

## Install

**Via CDN:**
```html
<script src="https://spw.network/connect.js"></script>
```

**Via npm:**
```bash
npm install spw-connect
```
```js
import SPWConnect from 'spw-connect';
```

## Quick start

```html
<button id="connect">Connect Wallet</button>
<script>
  document.getElementById('connect').onclick = async () => {
    // 1. Ask your backend for a one-time nonce.
    const { nonce } = await fetch('/api/wallet/nonce', { method: 'POST' })
      .then(r => r.json());

    // 2. Let SPW Connect handle the rest. Picks extension if installed,
    //    falls back to a popup to the wallet's PWA.
    const result = await SPWConnect.signIn({ nonce });
    //   result = { address, pubkey, nonce, sig }

    // 3. Send the proof to your backend for verification.
    await fetch('/api/wallet/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    });

    location.reload();
  };
</script>
```

Your backend verifies with one of the `spw-verify-*` libraries (Python, Node, etc.).

## API

### `SPWConnect.signIn(opts) → Promise<SignInResult>`

| opt | required | default | description |
|---|---|---|---|
| `nonce` | yes | — | One-time challenge from your backend. `[A-Za-z0-9_-]{8,128}`. |
| `app` | no | `location.host` | Label shown to the user during approval. Max 64 chars. |
| `walletUrl` | no | `https://wallet.spw.network` | Override the wallet origin (self-hosted / staging). |
| `timeoutMs` | no | `300_000` | Reject after this many ms if user doesn't approve. |
| `preferExtension` | no | `true` | If false, always use web popup. |

Returns `{ address, pubkey, nonce, sig }`.

Rejects with `Error` whose `.code` is one of `BAD_PARAMS`, `POPUP_BLOCKED`, `TIMEOUT`, `USER_CANCELLED`, `WALLET_LOCKED`, `INTERNAL`.

**Popup blockers:** `signIn` opens a window. You must call it inside a user-gesture handler (a click, a keypress). Don't call it from inside an `async` flow that has already awaited something; the browser will block the popup.

### `SPWConnect.requestPayment(opts) → Promise<PaymentResult>`

One-click payment confirmation. Different flow from sign-in.

| opt | required | description |
|---|---|---|
| `to` | yes | Destination SPW address. |
| `amount` | yes | Integer, in feathers (1 SPW = 1e8 feathers). |
| `label` | no | Human-readable label (e.g. `"Order #1234"`). |

Returns `{ txid }` on success.

### `SPWConnect.isAvailable() → boolean`

True iff the SPW extension is installed. Use this to show "Install Wallet" UI when appropriate.

## Security notes

- **Never skip the server-side nonce.** Generating the nonce in the browser defeats the whole protocol — an attacker can pre-sign.
- **Verify `app` on the server** against the label you issued the nonce for. The client can lie about `app`; only your records are authoritative.
- **Nonce TTL: 5 minutes.** Don't accept stale proofs.
- See the full [SPEC.md](../SPEC.md) for the threat model.

## License

MIT
