# demo-flask — SPW Connect reference dApp

A minimal dApp showing the full sign-in round-trip. Python + Flask + SQLite, ~150 lines.

Hit the homepage, click **Connect Wallet**, approve in your SPW wallet, get 100 credits. Each connected address accumulates credits via a dummy `/api/credits/earn` endpoint — demonstrating an authenticated action.

## Run

```bash
cd connect/demo-flask
python3 -m venv .venv && source .venv/bin/activate

# Install the verifier from the local sibling checkout
pip install ../verify-py coincurve Flask

# Or from PyPI once published: pip install -r requirements.txt

python app.py
# → http://localhost:5050
```

Override the wallet URL for local PWA testing:
```bash
SPW_WALLET_URL=http://localhost:8333 python app.py
```

## What to read

All the integration code is in two places:

**Backend** — [`app.py`](app.py):
- `POST /api/wallet/nonce` issues a nonce, stores it in SQLite.
- `POST /api/wallet/link` calls `spw_verify.verify(...)`, consumes nonce, binds address.

**Frontend** — inline script in [`templates/index.html`](templates/index.html):
- Fetches `/api/wallet/nonce` → destructures **both** `{nonce, app}` from the response.
- Calls SDK: `const result = await SPWConnect.signIn({nonce, app});`
- POSTs the result to `/api/wallet/link`.

> ⚠️ **The `app` mismatch trap.** The server echoes `app` from `/api/wallet/nonce` for a reason: it is the exact label the server will use when verifying the signature. If the frontend omits the `app` field on the `signIn()` call, the SDK falls back to `location.host` (e.g. `localhost:5000`) — which will not match the server's configured `APP_LABEL` (default `demo.local`), and every sign-in will fail with `bad signature`. Always pass through what `/api/wallet/nonce` returned.

## SDK loading

This demo bundles `spw-connect.js` under `/static/` for offline dev. In production:
```html
<script src="https://spw.network/connect.js"></script>
```

## DB layout

```sql
sessions(sid, address, created_at, credits)
nonces(nonce, sid, app_label, created_at, consumed)
```

— `sid` is a browser cookie; `address` is bound on first successful sign-in.
— Same sid can re-bind a different address by signing again (deliberate: lets users swap wallets).

## License

MIT
