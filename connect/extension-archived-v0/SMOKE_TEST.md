# SPW Wallet Connect — pre-submission smoke test

Run **every box** green before zipping and uploading. Any failure means the store reviewer will hit the same issue and reject.

## 0. Prep

```bash
cd /opt/sparrow/spw_wallet/connect/extension
python3 -c "import json; json.load(open('manifest.json')); print('manifest parses')"
./pack.sh            # should exit 0 and print "Built ... ready to upload"
```

Expected: ZIP created, manifest parses, no errors.

---

## 1. Load unpacked (native Chrome)

- [ ] Open `chrome://extensions` in Chrome or Edge.
- [ ] Toggle **Developer mode** on (top-right).
- [ ] Click **Load unpacked** → pick `/opt/sparrow/spw_wallet/connect/extension`.
- [ ] Extension appears, icon is the gradient 'S', no red "Errors" button.
- [ ] Click **Details** → Permissions shows only `Read and change all your data on all websites` (from the content script). No surprise entries.

If you see a manifest parse error here, STOP and fix before continuing.

---

## 2. Popup works

- [ ] Click the extension icon in the toolbar.
- [ ] Popup opens (320 px wide), shows "SPW Wallet" gradient title + green dot "Active on this page".
- [ ] Click **Open Full Wallet** → a new tab opens at `https://wallet.spw.network/`.

---

## 3. `window.spw` is injected

- [ ] Open any regular page (e.g. `https://example.com`).
- [ ] Open DevTools console, type:
  ```js
  window.spw
  ```
  Expect an object with `{ version, isSPWWallet, requestSignIn, requestPayment }`.
- [ ] Try a second page (e.g. `https://news.ycombinator.com`) — `window.spw` also present.

If `window.spw` is `undefined`, check `chrome://extensions` Details → Errors for a content-script failure.

---

## 4. End-to-end sign-in via the reference dApp

Start the demo in a second terminal:
```bash
cd /opt/sparrow/spw_wallet/connect/demo-flask
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python3 app.py
```

- [ ] Visit `http://127.0.0.1:5000/`.
- [ ] Click **Connect Wallet**.
- [ ] A popup opens pointed at `wallet.spw.network/#sign?nonce=…`.
- [ ] Approve inside the wallet.
- [ ] Popup closes, dApp shows dashboard with your SPW address.
- [ ] Refresh dashboard → credit counter increments. (Proves server accepted the signature.)

---

## 5. Fallback path (extension disabled)

- [ ] `chrome://extensions` → toggle SPW Wallet Connect **off**.
- [ ] Reopen `test-fallback.html` in Chrome (drag-and-drop the file into a tab).
- [ ] Environment panel should show:
  - SDK loaded: **loaded**
  - window.spw: **not installed**
  - Expected flow: **fallback popup → wallet.spw.network**
- [ ] Click **Sign in with SPW Wallet** → same wallet popup opens; approve; result box shows the signed payload.

Then re-enable the extension and repeat step 5 — this time the Expected flow should say "extension path" and the signing should go through `window.spw.requestSignIn`. Both paths must succeed.

---

## 6. Verify a signature on the server side (correctness check)

From step 4 or 5, grab the result object. The verifier also needs the `app` label
that the server used when issuing the nonce — for demo-flask that is `demo.local`
by default. **Do not omit `app`**: the canonical message that got signed included
it, so the verifier must supply the same value to reproduce the digest.

```bash
cd /opt/sparrow/spw_wallet/connect/verify-js
node -e '
  const v = require(".");
  const proof = {
    address: "D...",       // result.address from the sign-in
    pubkey:  "02...",      // result.pubkey
    nonce:   "...",        // result.nonce
    sig:     "3045...",    // result.sig
    app:     "demo.local", // same label your /api/wallet/nonce endpoint used
  };
  console.log("valid:", v.verifyRaw(proof));
'
```
- [ ] Output prints `valid: true`.

This proves the signatures produced by the flow round-trip through a real verifier.

---

## 7. Uninstall path

- [ ] `chrome://extensions` → click **Remove** on the extension.
- [ ] Confirm in the native dialog.
- [ ] Open any page; `window.spw` is now `undefined`. No lingering effects.

---

## 8. Last eyes on the ZIP

```bash
./pack.sh
python3 -m zipfile -l spw-wallet-connect-v1.0.0.zip
```

- [ ] Listing shows exactly these entries at the ZIP root:
  ```
  content.js
  icons/icon-128.png
  icons/icon-16.png
  icons/icon-32.png
  icons/icon-48.png
  inject.js
  manifest.json
  popup.html
  popup.js
  ```
  No `README.md`, no `PRIVACY.md`, no `screenshots/`, no `.DS_Store`, no `test-fallback.html`, no `SMOKE_TEST.md`, no `.gitignore`, no `pack.sh`.

- [ ] Total size is small (< 100 KB).
- [ ] Unzipping the file into an empty directory and running **Load unpacked** on that directory reproduces every step above.

---

## 9. Store-side prep (not in the ZIP)

Before hitting Submit in the developer dashboard:

- [ ] `PRIVACY.md` is live at `https://spw.network/privacy` (HTTP 200).
- [ ] Screenshots PNG'd from `screenshots/*.html` via DevTools "Capture node screenshot". At least one 1280×800 screenshot is required.
- [ ] `STORE_LISTING.md` is open — copy/paste each section into the matching form field.

If all ten sections are green, you are ready to upload. Good luck with review.
