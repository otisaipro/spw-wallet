/*!
 * spw-verify — server-side verifier for SPW Connect sign-in proofs (Node.js).
 * Spec: https://github.com/otisaipro/spw-wallet/blob/main/connect/SPEC.md
 */
'use strict';

const crypto = require('crypto');
const secp = require('@noble/secp256k1');

const VERSION = '1.0.0';
const PROTOCOL_VERSION = 'v1';
const ADDRESS_VERSION_BYTE = 0x1e;
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

class InvalidSignature extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'InvalidSignature';
    this.reason = reason;
  }
}

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest();
}

function ripemd160(buf) {
  // Modern Node (>=14) exposes ripemd160 via OpenSSL.
  return crypto.createHash('ripemd160').update(buf).digest();
}

function b58encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = '';
  while (n > 0n) {
    const r = Number(n % 58n);
    n /= 58n;
    out = B58[r] + out;
  }
  let leading = 0;
  for (const b of bytes) {
    if (b !== 0) break;
    leading++;
  }
  return '1'.repeat(leading) + out;
}

function pubkeyToAddress(pubkeyHex) {
  if (typeof pubkeyHex !== 'string' || !/^0[23][0-9a-fA-F]{64}$/.test(pubkeyHex)) {
    throw new InvalidSignature(
      'pubkey must be a 33-byte compressed secp256k1 key starting 0x02/0x03'
    );
  }
  const pub = Buffer.from(pubkeyHex, 'hex');
  const h = ripemd160(sha256(pub));
  const payload = Buffer.concat([Buffer.from([ADDRESS_VERSION_BYTE]), h]);
  const checksum = sha256(sha256(payload)).slice(0, 4);
  return b58encode(Buffer.concat([payload, checksum]));
}

function canonicalMessage(app, address, nonce) {
  const s =
    `SPW Wallet Sign-In ${PROTOCOL_VERSION}\n` +
    `app: ${app}\n` +
    `address: ${address}\n` +
    `nonce: ${nonce}`;
  return Buffer.from(s, 'utf8');
}

function _secpVerify(sigDer, digest, pubkey) {
  try {
    // @noble/secp256k1 v1: verify(sig, msg, pub, {strict?}) — sig can be Signature, hex or raw(64)
    // It does NOT accept DER by default. We parse DER → Signature first.
    const SigCtor = secp.Signature || (secp.signatureImport && secp.signatureImport);
    let sig;
    if (typeof secp.Signature?.fromDER === 'function') {
      sig = secp.Signature.fromDER(sigDer);
    } else if (typeof secp.signatureImport === 'function') {
      sig = secp.signatureImport(sigDer); // returns 64-byte compact
    } else {
      // v1 API: Signature.fromDER exists
      sig = secp.Signature.fromDER(sigDer);
    }
    return secp.verify(sig, digest, pubkey);
  } catch (_) {
    return false;
  }
}

/**
 * Verify without throwing. Returns true iff pubkey→address matches AND the DER
 * signature verifies against sha256(canonicalMessage) under pubkey.
 * Callers must still check nonce freshness and consumption elsewhere.
 */
function verifyRaw({ address, pubkey, nonce, sig, app = '' }) {
  let derived;
  try {
    derived = pubkeyToAddress(pubkey);
  } catch (_) {
    return false;
  }
  if (derived !== address) return false;
  let sigBytes;
  let pubBytes;
  try {
    sigBytes = Buffer.from(sig, 'hex');
    pubBytes = Buffer.from(pubkey, 'hex');
  } catch (_) {
    return false;
  }
  if (sigBytes.length === 0 || pubBytes.length !== 33) return false;
  const digest = sha256(canonicalMessage(app, address, nonce));
  return _secpVerify(sigBytes, digest, pubBytes);
}

/**
 * Throws InvalidSignature (with .reason) on any failure. Returns undefined on success.
 */
function verify({ address, pubkey, nonce, sig, app = '' } = {}) {
  if (typeof address !== 'string' || !address) throw new InvalidSignature('address missing');
  if (typeof pubkey !== 'string' || pubkey.length !== 66)
    throw new InvalidSignature('pubkey must be 66 hex chars (compressed secp256k1)');
  if (typeof nonce !== 'string' || !nonce) throw new InvalidSignature('nonce missing');
  if (typeof sig !== 'string' || sig.length < 140 || sig.length > 144 || sig.length % 2)
    throw new InvalidSignature('sig must be DER hex, 140-144 chars, even length');

  const derived = pubkeyToAddress(pubkey); // throws on bad pubkey
  if (derived !== address) {
    throw new InvalidSignature('pubkey does not derive to claimed address');
  }
  const sigBytes = Buffer.from(sig, 'hex');
  const pubBytes = Buffer.from(pubkey, 'hex');
  const digest = sha256(canonicalMessage(app, address, nonce));
  if (!_secpVerify(sigBytes, digest, pubBytes)) {
    throw new InvalidSignature('bad signature');
  }
}

module.exports = {
  VERSION,
  PROTOCOL_VERSION,
  InvalidSignature,
  verify,
  verifyRaw,
  pubkeyToAddress,
  canonicalMessage,
};
