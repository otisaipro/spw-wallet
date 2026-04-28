// SPW chain primitives — address derivation, mnemonic→keys, signing.
// Logic ported verbatim from spw_web/wallet/index.html so on-chain output is identical.

import {
  secp,
  sha256,
  sha512,
  ripemd160,
  hmac,
  generateMnemonic,
  validateMnemonic,
  mnemonicToSeed,
  bip39Wordlist,
} from '../vendor/spw-vendor.bundle.mjs';

// Synchronous HMAC needed by secp256k1 1.7.x for signing.
secp.utils.hmacSha256Sync = (k, ...m) => hmac(sha256, k, ...m);

const ADDRESS_VERSION = 0x1e; // produces D-prefix base58check addresses
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const CURVE_N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');

export const hex = b => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
export const hexToBytes = h => secp.utils.hexToBytes(h);

export function b58encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let s = '';
  while (n > 0n) { const r = Number(n % 58n); n /= 58n; s = B58[r] + s; }
  let leadingZeros = 0;
  for (const b of bytes) { if (b !== 0) break; leadingZeros++; }
  return '1'.repeat(leadingZeros) + s;
}

export function b58decode(str) {
  let n = 0n;
  for (const c of str) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error('Invalid base58 character');
    n = n * 58n + BigInt(i);
  }
  const bytes = [];
  while (n > 0n) { bytes.push(Number(n & 0xffn)); n >>= 8n; }
  bytes.reverse();
  for (const c of str) { if (c !== '1') break; bytes.unshift(0); }
  return new Uint8Array(bytes);
}

export function spwAddress(pub33) {
  const h = ripemd160(sha256(pub33));
  const payload = new Uint8Array([ADDRESS_VERSION, ...h]);
  const checksum = sha256(sha256(payload)).slice(0, 4);
  return b58encode(new Uint8Array([...payload, ...checksum]));
}

export function isValidSpwAddress(addr) {
  try {
    const raw = b58decode(addr);
    if (raw.length !== 25) return false;
    if (raw[0] !== ADDRESS_VERSION) return false;
    const payload = raw.slice(0, 21);
    const checksum = raw.slice(21);
    const expected = sha256(sha256(payload)).slice(0, 4);
    for (let i = 0; i < 4; i++) if (checksum[i] !== expected[i]) return false;
    return true;
  } catch {
    return false;
  }
}

export function dsha256(b) { return sha256(sha256(b)); }

// Canonical Python-style JSON (matches what the chain expects for tx digests).
function pyjson(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(pyjson).join(', ') + ']';
  const ks = Object.keys(v).sort();
  return '{' + ks.map(k => JSON.stringify(k) + ': ' + pyjson(v[k])).join(', ') + '}';
}

export function signingDigest(inputs, outputs, ts, txPubkey = '', colorIssue = '') {
  const data = {
    color_issue: colorIssue,
    inputs: inputs.map(i => ({ prev_txid: i.prev_txid, prev_vout: i.prev_vout })),
    outputs: outputs.map(o => {
      const d = { address: o.address, amount: o.amount };
      if (o.data) d.data = o.data;
      return d;
    }),
    timestamp: ts,
    tx_pubkey: txPubkey,
  };
  return dsha256(new TextEncoder().encode(pyjson(data)));
}

export function computeTxid(inputs, outputs, ts, coinbase = '', txPubkey = '', colorIssue = '') {
  const data = {
    coinbase_data: coinbase,
    color_issue: colorIssue,
    inputs: inputs.map(i => ({
      prev_txid: i.prev_txid, prev_vout: i.prev_vout,
      pubkey: i.pubkey, script_sig: i.script_sig,
    })),
    outputs: outputs.map(o => {
      const d = { address: o.address, amount: o.amount };
      if (o.data) d.data = o.data;
      return d;
    }),
    timestamp: ts,
    tx_pubkey: txPubkey,
  };
  return hex(dsha256(new TextEncoder().encode(pyjson(data))));
}

// Stealth address output for private sends (one-time recipient via ECDH).
export function makeStealthOutput(recipientSpendPub, recipientViewPub) {
  const r = secp.utils.randomPrivateKey();
  const rInt = BigInt('0x' + hex(r));
  const R = secp.Point.BASE.multiply(rInt);
  const vP = secp.Point.fromHex(recipientViewPub);
  const sh = vP.multiply(rInt);
  const xc = sh.toRawBytes(false).slice(1, 33);
  const hInt = BigInt('0x' + hex(sha256(xc)));
  const sP = secp.Point.fromHex(recipientSpendPub);
  const otp = secp.Point.BASE.multiply(hInt).add(sP);
  return {
    oneTimeAddr: spwAddress(otp.toRawBytes(true)),
    txPubkeyHex: hex(R.toRawBytes(true)),
  };
}

// ── BIP32 derivation (hardened path m/44'/1926'/0'/0/0 for spend, .../1/0 for view)
function _h512(key, data) { return hmac(sha512, key, data); }
function _bip32Master(seed) {
  const I = _h512(new TextEncoder().encode('Bitcoin seed'), seed);
  return { key: I.slice(0, 32), chain: I.slice(32) };
}
function _bip32Combine(parentKey, I) {
  const il = BigInt('0x' + hex(I.slice(0, 32)));
  const childInt = ((il + BigInt('0x' + hex(parentKey))) % CURVE_N).toString(16).padStart(64, '0');
  const k = new Uint8Array(32);
  for (let i = 0; i < 32; i++) k[i] = parseInt(childInt.slice(i * 2, i * 2 + 2), 16);
  return { key: k, chain: I.slice(32) };
}
function _bip32H(parentKey, chain, idx) {
  const d = new Uint8Array(37);
  d[0] = 0;
  d.set(parentKey, 1);
  new DataView(d.buffer).setUint32(33, 0x80000000 + idx, false);
  return _bip32Combine(parentKey, _h512(chain, d));
}
function _bip32N(parentKey, chain, idx) {
  const pub = secp.getPublicKey(parentKey, true);
  const d = new Uint8Array(37);
  d.set(pub, 0);
  new DataView(d.buffer).setUint32(33, idx, false);
  return _bip32Combine(parentKey, _h512(chain, d));
}
function _bip32Path(seed, path) {
  let { key, chain } = _bip32Master(seed);
  for (const part of path.split('/').slice(1)) {
    const hardened = part.endsWith("'");
    const idx = parseInt(part);
    const r = hardened ? _bip32H(key, chain, idx) : _bip32N(key, chain, idx);
    key = r.key;
    chain = r.chain;
  }
  return key;
}

export async function mnemonicToKeys(phrase, passphrase = '') {
  const seed = await mnemonicToSeed(phrase, passphrase);
  return {
    spendKey: _bip32Path(seed, "m/44'/1926'/0'/0/0"),
    viewKey: _bip32Path(seed, "m/44'/1926'/0'/1/0"),
  };
}

export function keysToAccount(spendKeyBytes, viewKeyBytes, mnemonic = null) {
  const spendPub = secp.getPublicKey(spendKeyBytes, true);
  return {
    address: spwAddress(spendPub),
    spendHex: hex(spendKeyBytes),
    viewHex: hex(viewKeyBytes),
    spendPubHex: hex(spendPub),
    mnemonic,
  };
}

export {
  secp,
  generateMnemonic,
  validateMnemonic,
  mnemonicToSeed,
  bip39Wordlist,
  sha256,
  sha512,
  ripemd160,
  hmac,
};
