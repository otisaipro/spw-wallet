# Privacy Policy — SPW Wallet Connect

**Effective date:** 2026-04-22
**Contact:** otispromax@gmail.com

## In one line

SPW Wallet Connect does not collect, store, transmit, or share any personal information. It has no server component and no analytics.

## What the extension does

SPW Wallet Connect is a Manifest V3 Chrome extension that exposes a single JavaScript object, `window.spw`, to web pages. When a dApp calls `window.spw.requestSignIn(...)` or `window.spw.requestPayment(...)`, the extension opens a new browser window pointing at `https://wallet.spw.network` so the user can review and approve the request in their own wallet. The extension itself holds no keys and performs no cryptography.

## Data we collect

**None.** The extension:

- does not read, log, or transmit the contents of any web page;
- does not store anything in `chrome.storage`, cookies, `localStorage`, or `IndexedDB`;
- does not send analytics, telemetry, crash reports, or heartbeats to any server;
- does not load any remote script or resource — all code is bundled inside the extension.

## Data we transmit

**None initiated by the extension.** The only network activity attributable to the extension is the browser window it opens at `https://wallet.spw.network` when you ask a dApp to sign in. That is a normal page load in a separate window under your control, subject to the privacy policy of `wallet.spw.network`.

## Third parties

The extension does not communicate with any third party. We do not use Google Analytics, Sentry, Mixpanel, Firebase, or any similar service.

## Permissions we request

- **`content_scripts: ["<all_urls>"]`** — required to inject the `window.spw` object into any dApp page. The content script's only action is to append one `<script>` tag that loads `inject.js` from the extension bundle. It does not read page contents.
- **`web_accessible_resources`** — required so pages can load `inject.js` from the extension bundle.

The extension requests no other permissions.

## Your keys

Keys, mnemonics, and account data live in your SPW Wallet at `wallet.spw.network` (or a self-hosted copy). **They never enter the extension process.** The extension has no code path that could read them even if it tried, because the wallet runs in a separate browser window.

## Children

The extension is not directed at children under 13.

## Changes

If this policy changes, the new version will ship with the next extension release and the change will be noted in the release changelog on GitHub. Continued use after an update constitutes acceptance.

## Contact

Questions or concerns: otispromax@gmail.com
Source code and issue tracker: https://github.com/otisaipro/spw-wallet
