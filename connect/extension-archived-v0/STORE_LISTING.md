# Chrome Web Store — Listing Copy & Justifications

**Paste these into the Developer Dashboard when submitting.**
Do not improvise the text below at submission time — every field was written to avoid common rejection reasons (vague purpose, over-broad permissions, marketing hype, keyword stuffing).

---

## 1. Product identity

| Field | Value |
|---|---|
| **Name** (max 45) | `SPW Wallet Connect` |
| **Summary** (max 132) | `Connect websites to your SPW Wallet. Adds window.spw so dApps can request sign-in with a signature — no password.` |
| **Category** | Productivity |
| **Language** | English |

> Why not "SPW Wallet"? The extension does **not** manage keys. Naming it just "Wallet" would mislead users and invite rejection under the "misleading functionality" rule. "Connect" makes the role explicit.

---

## 2. Detailed description

Paste verbatim:

```
SPW Wallet Connect is a tiny, open-source bridge between websites and your SPW Wallet.

WHAT IT DOES
• Exposes a standard JavaScript object, window.spw, on every page.
• When a dApp calls window.spw.requestSignIn({nonce}), the extension opens your SPW Wallet at https://wallet.spw.network in a secure popup so you can review and approve the request.
• Your wallet signs the nonce with your SPW private key and returns the signature to the dApp.
• No password is ever sent. The dApp learns only your public address and a one-time signature.

WHAT IT DOES NOT DO
• It does not manage private keys. Your keys remain inside your SPW Wallet (wallet.spw.network or a self-hosted copy).
• It does not read the contents of any web page.
• It does not send analytics, telemetry, or any data to any server.
• It does not load any remote code — the entire extension is shipped inside this bundle.

WHO IT IS FOR
• Anyone who already uses an SPW Wallet and wants one-click sign-in on dApps.
• dApp developers who want to offer "Sign in with SPW" without redirecting users away from their site.

PRIVACY
• Zero data collection. Full policy: https://spw.network/privacy
• Source code: https://github.com/otisaipro/spw-wallet/tree/main/connect/extension

TECHNICAL
• Manifest V3, service-worker free (no background script needed).
• ~180 lines of JavaScript total, no dependencies.
• Compatible with Chrome, Edge, Brave, and other Chromium browsers.
```

---

## 3. Single-purpose statement

The single purpose field is mandatory. Paste:

```
Exposes the window.spw JavaScript API on web pages so websites can detect an SPW Wallet and route sign-in requests to the user's wallet at wallet.spw.network.
```

---

## 4. Permissions — justifications

Every permission gets an individual prompt. Keep answers short, factual, and focused on a single reason.

### `host_permissions` / `content_scripts.matches = <all_urls>`

```
Websites that integrate with SPW Wallet can be hosted on any domain (any dApp, any personal site). The extension must inject the window.spw API on any page a user visits so that integration works without requiring each site to be listed individually. The content script only adds one <script> tag that loads inject.js from the extension bundle; it does not read page contents, form data, URLs, or cookies.
```

### `web_accessible_resources`

```
inject.js runs in the page's MAIN world (so it can define window.spw where page scripts can reach it). Chrome requires that any file loaded from the extension into the page be listed here. The only file exposed is inject.js itself.
```

### Any other permission box on the form (storage, tabs, activeTab, scripting, etc.)

```
Not requested. The extension does not store any data, does not read tab contents, and does not programmatically inject scripts at runtime.
```

---

## 5. Remote code declaration

Answer **"No, I am not using remote code."**

If asked to elaborate:

```
All JavaScript executed by the extension ships inside the uploaded bundle. The only network activity is the browser opening https://wallet.spw.network in a separate popup window when the user initiates a sign-in — that is a normal page load under user control, not remote code execution inside the extension.
```

---

## 6. Privacy practices (checkboxes)

- [x] **I do not collect or use user data.** (This is the correct answer — the extension has zero data flows.)
- [x] I certify that my data usage complies with the Developer Program Policies.
- [x] I am not selling user data.
- [x] I am not using user data for credit-worthiness, lending, or unrelated purposes.

---

## 7. URLs

| Field | Value |
|---|---|
| **Website** | `https://spw.network` |
| **Privacy policy URL** | `https://spw.network/privacy` *(must be reachable before submission)* |
| **Support URL** | `https://github.com/otisaipro/spw-wallet/issues` |

**Action item before submission:** upload `PRIVACY.md` content to `https://spw.network/privacy` and confirm the URL returns HTTP 200.

---

## 8. Assets checklist

| Asset | Size | Status |
|---|---|---|
| Store icon | 128×128 PNG | ✓ `icons/icon-128.png` |
| Screenshot 1 | 1280×800 PNG | → generate from `screenshots/screenshot-1-hero.html` |
| Screenshot 2 | 1280×800 PNG | → generate from `screenshots/screenshot-2-popup.html` |
| Screenshot 3 | 1280×800 PNG | → generate from `screenshots/screenshot-3-code.html` |
| Small promo tile | 440×280 PNG | → generate from `screenshots/promo-small.html` |
| Marquee promo (optional) | 1400×560 PNG | → generate from `screenshots/promo-marquee.html` |

Minimum required: store icon + 1 screenshot. The rest improves discoverability.

---

## 9. Review notes box (optional but recommended)

Chrome reviewers can read a private note. Paste this to pre-empt common questions:

```
Hi reviewer,

This extension has a single narrow purpose: inject window.spw on web pages so dApps can detect that an SPW wallet is present. When a dApp calls requestSignIn(), the extension opens https://wallet.spw.network in a popup so the user can approve the sign-in inside their wallet. The extension itself holds no keys, has no background service worker, performs no network calls, and stores no data.

<all_urls> is needed because SPW-compatible dApps can be hosted on any domain. The content script only appends one script tag; it does not read the page.

Source code is public at https://github.com/otisaipro/spw-wallet/tree/main/connect/extension — the entire extension is ~180 LOC and auditable in a few minutes.

Thank you!
```

---

## 10. Pre-submission final check

Before clicking Submit:

- [ ] `manifest.json` version matches the ZIP name
- [ ] No `console.log` / debug prints in shipped JS
- [ ] `PRIVACY.md` is live at the URL you listed
- [ ] Screenshots are 1280×800 exactly (not scaled)
- [ ] Opened the ZIP locally and confirmed it has `manifest.json` at the root (not inside a folder)
- [ ] Installed the ZIP via `chrome://extensions → Load unpacked` and ran `SMOKE_TEST.md` to green
- [ ] Visited `test-fallback.html` without the extension and confirmed it falls through to `wallet.spw.network`
