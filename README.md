# SPW Wallet

Sparrow Network (SPW) 官方钱包 —— 浏览器可安装 PWA + Python 钱包引擎。
单文件前端,零构建,零依赖,完全自托管。

官方部署: https://spw.network/wallet

## 功能特性

- **BIP39 助记词** —— 12 词生成/导入,支持 BIP39 passphrase
- **BIP32 HD 派生** —— 路径 `m/44'/1926'/0'/0/index`,多账户
- **SECP256k1 签名** —— 标准椭圆曲线密码学
- **隐身地址 (Stealth Address)** —— ECDH 双密钥 (spend key + view key),保护接收方隐私
- **单文件 PWA** —— 一个 `index.html` 包含全部逻辑,可审计,Service Worker 离线运行
- **多账户管理** —— 本地 localStorage 存储账户列表
- **二维码** —— 收款二维码展示 + 扫码发送
- **地址浏览器** —— 内置区块链查询
- **Base58Check 地址格式** —— 前缀 `S`(版本 `0x1e`)

## 目录结构

```
spw_wallet/
├── wallet_web/          # 浏览器钱包 PWA
│   ├── index.html       # 单文件应用(~130KB,含全部 JS/CSS)
│   ├── sw.js            # Service Worker (离线缓存)
│   ├── manifest.json    # PWA 清单
│   └── *.png, *.ico     # 图标与品牌资源
└── wallet/              # Python 钱包模块
    ├── wallet.py        # 钱包生成/签名/Base58Check
    ├── bip39.py         # BIP39 助记词 + BIP32 派生
    ├── bip39_words.py   # BIP39 英文单词表 (2048 词)
    └── __init__.py
```

## 快速使用

### 浏览器钱包 (wallet_web/)

1. 本地预览:
   ```bash
   cd wallet_web && python3 -m http.server 8000
   ```
   浏览器打开 `http://localhost:8000`
2. 或直接访问 https://spw.network/wallet
3. 在支持的浏览器中"添加到主屏幕"即可安装为 PWA
4. 安装后可离线运行,账户信息存于浏览器 localStorage

### Python 钱包模块 (wallet/)

需与 `spw_chain` 项目的 `config.py` 配合(依赖 `WALLET_DIR`, `SPW_VERSION`, `COIN_TYPE`)。

```python
from wallet.wallet import Wallet
from wallet.bip39 import generate_mnemonic, mnemonic_to_spend_key

mnemonic = generate_mnemonic(128)   # 12 词
privkey, chain_code = mnemonic_to_spend_key(mnemonic)
w = Wallet.from_private_key(privkey.hex())
print(w.address)          # S 开头的 Base58Check 地址
print(w.spend_key_hex)    # 主花费私钥
print(w.view_key_hex)     # 扫描私钥 (隐身地址)
```

## 密钥派生路径

| 路径 | 用途 |
|------|------|
| `m/44'/1926'/0'/0/0` | Spend key (主花费密钥) |
| `m/44'/1926'/0'/1/0` | View key (扫描密钥,用于隐身地址检测) |

BIP44 币种代码 **1926** 为 SPW 专属。

## 网络参数

| 参数 | 值 |
|------|-----|
| 代币 | Sparrow (SPW) |
| 最大供应 | 21,024,000 SPW |
| 最小单位 | 1 SPW = 100,000,000 feathers |
| 区块时间 | 60 秒 |
| 地址前缀 | `S` (版本字节 `0x1e`) |
| 默认 API | `http://localhost:8333/` |

## 安全提示

- 助记词/私钥仅存储在浏览器 `localStorage` 或本地 JSON 文件,**绝不离开本机**
- 建议启用 PWA 密码保护功能
- 本仓库**不包含任何实际钱包文件或私钥**,所有 `*.json` 钱包文件已通过 `.gitignore` 排除
- 所有加密原语为纯 JS/Python 实现,可独立审计

## 相关项目

- **spw_chain** —— 区块链节点 + REST API (Python/Flask)
- **spw_web** —— 官网与支付 SDK (`pay.js`)

## 开源协议

MIT License
