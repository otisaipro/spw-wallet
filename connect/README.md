# SPW Connect

**Let any dApp authenticate users against an SPW Wallet.** Open protocol, small SDK, battle-tested crypto primitives (secp256k1, sha256). One-time nonce + ECDSA signature — no passwords, no accounts to manage.

Think of this as the "Sign in with SPW" layer.

```
┌─────────────────────────────────────────────────────────┐
│  dApp (any stack)                                       │
│     ┌────────────────────┐   ┌──────────────────────┐   │
│     │ Frontend           │   │ Backend              │   │
│     │ spw-connect.js     │   │ spw-verify-{py,js}   │   │
│     └──────────┬─────────┘   └──────────▲───────────┘   │
│                │                        │               │
│                │  SignInResult          │  verify()     │
│                ▼                        │               │
│     ┌────────────────────────────────────────────────┐  │
│     │ SPW Wallet (extension OR PWA popup)            │  │
│     │ wallet.spw.network                             │  │
│     └────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## What's in this folder

| Path | What it is | Status |
|---|---|---|
| [`SPEC.md`](SPEC.md) | The protocol. Canonical message, signing algorithm, callback shape. | Stable v1 |
| [`sdk-js/`](sdk-js/) | `spw-connect` — drop-in JS SDK for dApp frontends | 1.0.0 |
| [`verify-py/`](verify-py/) | `spw-verify` on PyPI — Python backend verifier | 1.0.0, 9/9 tests pass |
| [`verify-js/`](verify-js/) | `spw-verify` on npm — Node backend verifier | 1.0.0, 9/9 tests pass |
| [`demo-flask/`](demo-flask/) | Full working reference dApp (Flask + SQLite) | End-to-end verified |
| [`extension/`](extension/) | Chrome MV3 extension — injects `window.spw` | Ready for submission |

Cross-language consistency is confirmed: the same signature produced by Python (coincurve) is accepted by the Node verifier (@noble/secp256k1) and vice versa.

## Integrate a dApp in 3 steps

### 1. Frontend — add the SDK

```html
<script src="https://spw.network/connect.js"></script>
<button id="connect">Connect Wallet</button>
<script>
  document.getElementById('connect').onclick = async () => {
    const { nonce } = await fetch('/api/wallet/nonce', { method: 'POST' }).then(r => r.json());
    const result = await SPWConnect.signIn({ nonce });
    await fetch('/api/wallet/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    });
    location.reload();
  };
</script>
```

### 2. Backend — issue nonces, verify proofs

**Python:**
```python
from spw_verify import verify, InvalidSignature
try:
    verify(address=..., pubkey=..., nonce=..., sig=..., app=stored_app_label)
except InvalidSignature as e:
    return {"error": e.reason}, 400
```

**Node:**
```js
const { verify, InvalidSignature } = require('spw-verify');
try { verify({ address, pubkey, nonce, sig, app: storedAppLabel }); }
catch (e) { return res.status(400).json({ error: e.reason }); }
```

### 3. Do these checks around verify()

1. Nonce exists, is fresh (≤ 5 min), and has not been consumed.
2. `app` label passed to `verify()` comes from *your* records (keyed by nonce), not the request body.
3. Consume the nonce atomically before binding address → session.

The `demo-flask/` folder is a 150-line reference implementation you can copy.

## Protocol summary

A dApp shows the user a "Connect Wallet" button. User approves in the SPW wallet. The wallet signs the canonical message

```
SPW Wallet Sign-In v1
app: <label>
address: <user's SPW address>
nonce: <one-time challenge>
```

with `sha256` → `secp256k1` (DER-encoded, low-S). The dApp backend verifies the signature and that the pubkey derives back to the claimed address. Done.

Full details in [SPEC.md](SPEC.md).

## Why not [existing standard]?

- **SIWE / EIP-4361:** Ethereum-address shaped. SPW uses its own address format (secp256k1 → ripemd160 → base58check, version byte 0x1e), so EIP-4361 messages would mislead wallets and verifiers. We adopt EIP-4361's spirit (versioned canonical message, server-bound nonce) but not its wire format.
- **WalletConnect:** Overkill for a single-chain sign-in flow. Targets multi-chain, multi-session, mobile-first scenarios. Adds a relay server dependency. We may add WalletConnect support later if demand appears.

## Status

- [x] Protocol spec v1 frozen
- [x] JS SDK
- [x] Python + Node verifiers
- [x] Demo dApp
- [x] Chrome extension v1 (PWA-trampoline)
- [ ] Firefox manifest variant
- [ ] Extension v2 (in-extension key storage + signing)
- [ ] Rust, Go, PHP verifiers (on demand)
- [ ] Published to PyPI / npm / Chrome Web Store

## License

MIT, except SPEC.md which is CC0 so anyone can implement it.
