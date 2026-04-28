# SPW Connect — Protocol Specification

**Version:** 1
**Status:** Stable (frozen 2026-04-22). Any breaking change ships as v2.

SPW Connect lets a dApp prove that a user controls a given SPW wallet address. A dApp presents a one-time challenge (nonce); the wallet signs a canonical message containing that nonce with the user's private key; the dApp verifies the signature against the claimed address.

No private key, mnemonic, or view key ever leaves the wallet. The dApp learns only the wallet address and a one-shot proof.

---

## 1. Transport modes

A dApp has two ways to invoke the wallet. Both carry the **same protocol payload** and produce the **same callback shape**.

| Mode | When to use | Shape |
|---|---|---|
| **Extension** | `window.spw` exists (user has the SPW Wallet browser extension) | In-page JS call: `window.spw.requestSignIn({nonce, app}) → Promise<SignInResult>` |
| **Web popup** | Fallback — user only has the PWA | Open `https://wallet.spw.network/#sign?nonce=…&app=…&callback=…` in `window.open()`; wallet `postMessage`s back to `window.opener` |

The JS SDK (`spw-connect.js`) picks the best mode automatically. A dApp that writes to the SDK does not need to care which mode was used.

---

## 2. Sign-In flow

```
┌──────────┐      nonce request     ┌──────────┐
│  dApp FE │ ─────────────────────► │ dApp BE  │
│          │                        │          │ generates 32-byte nonce,
│          │ ◄───────────────────── │          │ stores (nonce, app_label, session_id, ts)
│          │   { nonce, app }       │          │
├──────────┤                        └──────────┘
│          │   requestSignIn({nonce, app})
│          │ ─────────────────────►  SPW Wallet
│          │                         (extension or popup)
│          │                              │
│          │                              │ user approves
│          │                              │ wallet signs canonical message
│          │                              ▼
│          │ ◄───────────────────── { address, pubkey, nonce, sig }
├──────────┤
│  dApp FE │ ─────────────────────► ┌──────────┐
│          │   POST /wallet/link    │ dApp BE  │ verifies sig with SAME
│          │   { address, pubkey,   │          │ `app` the nonce endpoint
│          │     nonce, sig }       │          │ returned; consumes nonce;
│          │ ◄───────────────────── │          │ binds address→session
└──────────┘                        └──────────┘
```

> **Critical invariant — the `app` mismatch trap.**
> The `app` string is part of the canonical message the wallet signs (§3). Verification only succeeds when the server recomputes the canonical message with the **exact same** `app` bytes. In practice:
>
> - The nonce endpoint **MUST** return both `{nonce, app}` — never just `{nonce}`.
> - The frontend **MUST** pass the server-returned `app` straight into `SPWConnect.signIn({nonce, app})`. Do not let the SDK default `app` to `location.host` by omitting the field — the server will almost certainly be using a different label, and every signature will fail with `bad signature`.
> - Corollary: the server **MUST NOT** derive `app` from the incoming `/wallet/link` request. The `app` used for verification is the one stored alongside the nonce at issue time.

---

## 3. The canonical message

The bytes that get signed are the UTF-8 encoding of this exact string:

```
SPW Wallet Sign-In v1
app: <app>
address: <addr>
nonce: <nonce>
```

- Line separator: single `\n` (LF, 0x0A). **No trailing newline.** No BOM.
- `<app>` is the `app` value from the request (may be empty → line reads `app: `).
- `<addr>` is the wallet's active SPW address (base58check, version byte `0x1e`).
- `<nonce>` is the request `nonce` echoed verbatim.

**Example** with `app="example.com"`, `address="DF89abcdef…"`, `nonce="abc123"`:

```
SPW Wallet Sign-In v1
app: example.com
address: DF89abcdef…
nonce: abc123
```

As Python bytes:
```python
b"SPW Wallet Sign-In v1\napp: example.com\naddress: DF89abcdef\xe2\x80\xa6\nnonce: abc123"
```

---

## 4. Signing algorithm

1. `digest = sha256(canonical_message_utf8)` — 32 bytes. **Single** sha256, not double.
2. `sig = secp256k1_sign(digest, private_key, {low_s: true, encoding: DER})` — 70–72 bytes.
3. Return `sig` as lowercase hex (140–144 chars).

**No Bitcoin-style `\x18Bitcoin Signed Message:\n` prefix.** **No recovery byte.** Pure DER-encoded ECDSA over raw sha256.

Deterministic nonce (RFC 6979) is recommended but not required — verifiers do not care whether `k` was deterministic.

---

## 5. Address derivation

Given a 33-byte compressed secp256k1 public key `P`:

```
h        = ripemd160(sha256(P))                      # 20 bytes
payload  = 0x1e || h                                  # 21 bytes
checksum = sha256(sha256(payload))[:4]                # 4 bytes
address  = base58(payload || checksum)                # ~25–34 chars
```

The verifier **must** recompute `address` from the submitted `pubkey` and reject if it does not match the claimed `address`. Otherwise an attacker could submit `(attacker_pubkey, victim_address, valid_sig_for_attacker_pubkey)` and bypass identity.

---

## 6. Request parameters

### Extension mode: `window.spw.requestSignIn(opts)`

| Field | Type | Required | Notes |
|---|---|---|---|
| `nonce` | string | yes | `[A-Za-z0-9_-]{8,128}` |
| `app` | string | no | Shown to user in the approval UI. Max 64 chars. |

Returns a Promise resolving to `SignInResult` (see §7) or rejecting with `{code, message}` from §8.

### Web popup mode: URL hash route

```
https://wallet.spw.network/#sign?nonce=<nonce>&app=<app>&callback=<url>
```

| Query param | Required | Notes |
|---|---|---|
| `nonce` | yes | Same rules as above. |
| `app` | no | Max 64 chars. URL-encoded. |
| `callback` | no | Must parse as absolute URL if given. If omitted, wallet relies on `window.opener.postMessage` and offers no fallback. |

---

## 7. Response

On approval:

### Extension mode
```js
{
  address: "DF89…",       // SPW address
  pubkey:  "02…",         // 33-byte compressed, 66 lowercase hex
  nonce:   "abc123",      // echoed from request
  sig:     "3045…"        // DER-encoded ECDSA, 140–144 lowercase hex
}
```

### Web popup mode — via `postMessage` to `window.opener`
```js
{ type: "spw_sign_ok", address, pubkey, nonce, sig }
```

### Web popup mode — via redirect to `callback` (when no opener)
```
<callback>?address=<addr>&pubkey=<hex>&nonce=<nonce>&sig=<hex>
```
All four values are URL-encoded with `encodeURIComponent`.

---

## 8. Cancellation / errors

### Extension mode
Promise rejects with:
```js
{ code: "USER_CANCELLED" | "WALLET_LOCKED" | "BAD_PARAMS" | "INTERNAL", message: "…" }
```

### Web popup — postMessage
```js
{ type: "spw_sign_cancel", nonce }
```

### Web popup — callback redirect
```
<callback>?cancelled=1&nonce=<nonce>
```

---

## 9. Backend verification (any language)

Pseudocode that every `spw-verify-*` library implements:

```
verify(address, pubkey, nonce, sig, app):
    if pubkey_to_address(pubkey) != address: return False
    msg    = "SPW Wallet Sign-In v1\napp: " + app + "\naddress: " + address + "\nnonce: " + nonce
    digest = sha256(utf8(msg))
    return secp256k1_verify(sig_der_bytes, digest, pubkey_bytes)
```

### Required server-side checks around verify()

1. Nonce existed, is not consumed, is fresh (recommended TTL: 5 minutes).
2. `app` passed to `verify()` must come from **your** server's nonce record, **not** from the client request. An attacker can replay a valid sig against a different app label otherwise.
3. On successful verify: mark nonce consumed atomically, bind address to session.
4. Use a rate limit / slow-sweep on nonce endpoints to prevent enumeration.

---

## 10. Payment request flow (optional, separate from sign-in)

A different route, `?pay=<addr>&amount=<feathers>&label=<text>&callback=<url>`, opens a one-click confirm-and-send overlay in the wallet. This is **not part of sign-in** and uses its own response shape (`spw_payment_success` / `spw_payment_cancel` postMessage). See `wallet_web/index.html` lines 2380–2499 for the reference implementation.

The JS SDK exposes this as `SPWConnect.requestPayment(opts)`.

---

## 11. Versioning

- The string `SPW Wallet Sign-In v1` in the canonical message anchors this protocol version.
- If field semantics change, bump to `v2`. Verifiers dispatch on the first-line prefix.
- Adding new optional request params (e.g. `chain_id`) does **not** require a version bump, provided the canonical signed bytes remain unchanged.

---

## 12. Security notes

- **Replay across domains:** Solved because the verifier binds `app` server-side; sig for app A is rejected by app B.
- **Replay within a domain:** Solved by nonce consumption.
- **Phishing (user signs on attacker site):** Partial mitigation — the approval UI shows the `app` label. The ultimate guard is nonce binding: an attacker's site cannot consume a nonce issued to a real site.
- **Stealing signatures from logs:** DER sigs are single-use because nonces are consumed; log leak is not catastrophic. Still, do not log unconsumed nonces.
- **Long-lived challenges:** Do not exceed a 5-minute nonce TTL.
