# spw-verify (Node.js)

Server-side verifier for [SPW Connect](../SPEC.md) sign-in proofs.

## Install

```bash
npm install spw-verify
```

## Usage

```js
const { verify, InvalidSignature } = require('spw-verify');

// Your API receives {address, pubkey, nonce, sig} from the dApp frontend.
// The `app` label MUST come from YOUR records (keyed by nonce), not the request body.
try {
  verify({
    address: body.address,
    pubkey: body.pubkey,
    nonce: body.nonce,
    sig: body.sig,
    app: storedAppLabelForThisNonce,
  });
} catch (e) {
  if (e instanceof InvalidSignature) {
    return res.status(400).json({ error: e.reason });
  }
  throw e;
}

// Still check server-side:
// - nonce exists, unconsumed, fresh (<= 5 min)
// - consume the nonce atomically before binding address→session
```

Non-throwing variant: `verifyRaw({...}) → boolean`.

## Example: Express endpoint

```js
const express = require('express');
const crypto = require('crypto');
const { verify, InvalidSignature } = require('spw-verify');

const app = express();
app.use(express.json());
const NONCES = new Map(); // nonce -> {app, created, consumed, sid}

app.post('/api/wallet/nonce', (req, res) => {
  const sid = req.cookies?.sid || crypto.randomBytes(16).toString('hex');
  const nonce = crypto.randomBytes(24).toString('base64url');
  NONCES.set(nonce, { app: 'myapp.com', created: Date.now(), consumed: false, sid });
  res.cookie('sid', sid, { maxAge: 3600_000 }).json({ nonce });
});

app.post('/api/wallet/link', (req, res) => {
  const { address, pubkey, nonce, sig } = req.body;
  const rec = NONCES.get(nonce);
  if (!rec) return res.status(400).json({ error: 'unknown nonce' });
  if (rec.consumed) return res.status(400).json({ error: 'nonce reused' });
  if (Date.now() - rec.created > 300_000) return res.status(400).json({ error: 'nonce expired' });
  try {
    verify({ address, pubkey, nonce, sig, app: rec.app });
  } catch (e) {
    return res.status(400).json({ error: e.reason });
  }
  rec.consumed = true;
  // bind address to session rec.sid
  res.json({ ok: true, address });
});
```

## Test

```bash
npm test
```

## License

MIT
