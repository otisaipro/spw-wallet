# SPW Wallet

Official wallet for the Sparrow Network (SPW) — an installable browser PWA plus a Python wallet engine.
Single-file frontend, zero build, zero dependencies, fully self-hostable.

Official deployment: https://wallet.spw.network

## Features

- **BIP39 mnemonics** — 12-word generation/import, optional BIP39 passphrase
- **BIP32 HD derivation** — path `m/44'/1926'/0'/0/index`, multi-account
- **SECP256k1 signing** — standard elliptic-curve cryptography
- **Stealth addresses** — ECDH dual-key scheme (spend key + view key) for recipient privacy
- **Single-file PWA** — one `index.html` contains all logic, fully auditable, Service Worker for offline use
- **Multi-account management** — account list stored in browser `localStorage`
- **QR codes** — receive QR display and scan-to-send
- **Address explorer** — built-in on-chain lookup
- **Base58Check addresses** — prefix `D` (version byte `0x1e`)

## Repository Layout

```
spw_wallet/
├── wallet_web/          # Browser wallet PWA
│   ├── index.html       # Single-file app (~130 KB, all JS/CSS inline)
│   ├── sw.js            # Service Worker (offline cache)
│   ├── manifest.json    # PWA manifest
│   └── *.png, *.ico     # Icons and brand assets
└── wallet/              # Python wallet module
    ├── wallet.py        # Keygen / signing / Base58Check
    ├── bip39.py         # BIP39 mnemonics + BIP32 derivation
    ├── bip39_words.py   # BIP39 English wordlist (2048 words)
    └── __init__.py
```

## Quick Start

### Browser wallet (`wallet_web/`)

1. Serve locally:
   ```bash
   cd wallet_web && python3 -m http.server 8000
   ```
   Open `http://localhost:8000` in a browser.
2. Or visit https://wallet.spw.network directly.
3. Use "Add to Home Screen" in a supported browser to install as a PWA.
4. Once installed, the app runs offline; account data lives in browser `localStorage`.

### Python wallet module (`wallet/`)

Depends on the `spw_chain` project's `config.py` (requires `WALLET_DIR`, `SPW_VERSION`, `COIN_TYPE`).

```python
from wallet.wallet import Wallet
from wallet.bip39 import generate_mnemonic, mnemonic_to_spend_key

mnemonic = generate_mnemonic(128)   # 12 words
privkey, chain_code = mnemonic_to_spend_key(mnemonic)
w = Wallet.from_private_key(privkey.hex())
print(w.address)          # Base58Check address starting with "D"
print(w.spend_key_hex)    # Primary spend private key
print(w.view_key_hex)     # View private key (stealth scanning)
```

## Key Derivation Paths

| Path | Purpose |
|------|---------|
| `m/44'/1926'/0'/0/0` | Spend key (primary spending key) |
| `m/44'/1926'/0'/1/0` | View key (scanning key for stealth addresses) |

BIP44 coin type **1926** is reserved for SPW.

## Network Parameters

| Parameter | Value |
|-----------|-------|
| Ticker | Sparrow (SPW) |
| Max supply | 21,024,000 SPW |
| Smallest unit | 1 SPW = 100,000,000 feathers |
| Block time | 60 seconds |
| Address prefix | `S` (version byte `0x1e`) |
| Default API | `http://localhost:8333/` |

## Security Notes

- Mnemonics and private keys live only in browser `localStorage` or local JSON files — **they never leave the machine**.
- Enable the PWA's password protection if you store real funds.
- This repository contains **no real wallet files or private keys**; any `*.json` wallet files are excluded via `.gitignore`.
- All cryptographic primitives are pure JavaScript/Python implementations, independently auditable.

## Related Projects

- **spw_chain** — Blockchain node + REST API (Python/Flask)
- **spw_web** — Public website and payment SDK (`pay.js`)

## License

MIT License
