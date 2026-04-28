'use strict';

const assert = require('assert');
const crypto = require('crypto');
const secp = require('@noble/secp256k1');

// @noble/secp256k1 v1 needs an sync HMAC-SHA256 primitive for signSync.
// Use Node's built-in crypto instead of @noble/hashes to avoid a test-only dep.
secp.utils.hmacSha256Sync = (k, ...m) => {
  const h = crypto.createHmac('sha256', Buffer.from(k));
  for (const part of m) h.update(Buffer.from(part));
  return h.digest();
};

const {
  verify,
  verifyRaw,
  canonicalMessage,
  pubkeyToAddress,
  InvalidSignature,
} = require('./index');

function sha256(b) { return crypto.createHash('sha256').update(b).digest(); }

function signDER(privHex, msgBytes) {
  const digest = sha256(msgBytes);
  const sig = secp.signSync(digest, privHex, { canonical: true, der: true });
  return Buffer.from(sig).toString('hex');
}

function newKeypair() {
  const priv = secp.utils.randomPrivateKey();
  const pub = secp.getPublicKey(priv, true);
  return { privHex: Buffer.from(priv).toString('hex'), pubHex: Buffer.from(pub).toString('hex') };
}

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.stack || e.message}`); failed++; }
}

console.log('spw-verify tests');

test('canonical message bytes match spec', () => {
  const m = canonicalMessage('example.com', 'DFabc', 'xyz');
  assert.strictEqual(
    m.toString('utf8'),
    'SPW Wallet Sign-In v1\napp: example.com\naddress: DFabc\nnonce: xyz'
  );
  assert.ok(!m.toString('utf8').endsWith('\n'));
});

test('empty app still has space after colon', () => {
  const m = canonicalMessage('', 'DF', 'n');
  assert.strictEqual(m.toString('utf8'), 'SPW Wallet Sign-In v1\napp: \naddress: DF\nnonce: n');
});

test('pubkeyToAddress produces sane SPW address', () => {
  const { pubHex } = newKeypair();
  const addr = pubkeyToAddress(pubHex);
  assert.ok(addr.length >= 25 && addr.length <= 35, `address len=${addr.length}`);
});

test('round-trip sign & verify', () => {
  const { privHex, pubHex } = newKeypair();
  const address = pubkeyToAddress(pubHex);
  const nonce = 'abcdef0123456789';
  const app = 'test-app.local';
  const sig = signDER(privHex, canonicalMessage(app, address, nonce));
  verify({ address, pubkey: pubHex, nonce, sig, app });
  assert.strictEqual(verifyRaw({ address, pubkey: pubHex, nonce, sig, app }), true);
});

test('rejects wrong app label', () => {
  const { privHex, pubHex } = newKeypair();
  const address = pubkeyToAddress(pubHex);
  const nonce = 'abcdef0123456789';
  const sig = signDER(privHex, canonicalMessage('real-app', address, nonce));
  assert.throws(
    () => verify({ address, pubkey: pubHex, nonce, sig, app: 'attacker-app' }),
    /bad signature/
  );
});

test('rejects wrong nonce', () => {
  const { privHex, pubHex } = newKeypair();
  const address = pubkeyToAddress(pubHex);
  const sig = signDER(privHex, canonicalMessage('a', address, 'nonce-a'));
  assert.throws(
    () => verify({ address, pubkey: pubHex, nonce: 'nonce-b', sig, app: 'a' }),
    InvalidSignature
  );
});

test('rejects pubkey/address mismatch (substitution attack)', () => {
  const atk = newKeypair();
  const victim = newKeypair();
  const victimAddr = pubkeyToAddress(victim.pubHex);
  const nonce = 'xyz123abc456';
  const sig = signDER(atk.privHex, canonicalMessage('app', victimAddr, nonce));
  assert.throws(
    () => verify({ address: victimAddr, pubkey: atk.pubHex, nonce, sig, app: 'app' }),
    /derive/
  );
});

test('golden vector from Python (coincurve) verifies', () => {
  // Produced by tools/gen_golden.py in this repo. Private key = 0x11 * 32.
  const pubHex = '034f355bdcb7cc0af728ef3cceb9615d90684bb5b2ca5f859ab0f0b704075871aa';
  const address = 'DU9umLs2Ze8eNRo69wbSj5HeufphJawFPh';
  const nonce = 'test_nonce_0123456789abcdef';
  const app = 'example.com';
  const sig =
    '304402201637117f4b14be4a0e4ad6d41f94e71dc63ce0068e4db9195cfc9f880128724902206aaaefa6898aea87b444051c4991abde5e8334d35a6a1c3875e1f7f9f4aa0f8e';
  verify({ address, pubkey: pubHex, nonce, sig, app });
});

test('rejects malformed pubkey', () => {
  assert.throws(
    () => verify({ address: 'x', pubkey: 'nothex!!', nonce: 'nnnnnnnn', sig: 'aa'.repeat(71), app: '' }),
    InvalidSignature
  );
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
