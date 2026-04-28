// Password-based encryption for the keystore vault.
// Uses SubtleCrypto (built in to Chrome) — no external dependencies.
//
// Format on disk (JSON, stored in chrome.storage.local under key "vault"):
//   { v: 1, kdf: "pbkdf2-sha256", iter: 600000, salt: <hex>, iv: <hex>, ct: <hex> }
// The plaintext inside `ct` is a UTF-8 JSON string holding {mnemonic, spendHex, viewHex, address}.

const PBKDF2_ITERATIONS = 600_000; // current OWASP-recommended floor for SHA-256
const SALT_BYTES = 16;
const IV_BYTES = 12;

function bytesToHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function rand(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

async function deriveKey(password, salt, iterations) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptVault(plaintextObj, password) {
  const salt = rand(SALT_BYTES);
  const iv = rand(IV_BYTES);
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(plaintextObj))
  );
  return {
    v: 1,
    kdf: 'pbkdf2-sha256',
    iter: PBKDF2_ITERATIONS,
    salt: bytesToHex(salt),
    iv: bytesToHex(iv),
    ct: bytesToHex(new Uint8Array(ct)),
  };
}

export async function decryptVault(blob, password) {
  if (!blob || blob.v !== 1) throw new Error('Unsupported vault version');
  const salt = hexToBytes(blob.salt);
  const iv = hexToBytes(blob.iv);
  const ct = hexToBytes(blob.ct);
  const key = await deriveKey(password, salt, blob.iter || PBKDF2_ITERATIONS);
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  } catch {
    throw new Error('Wrong password');
  }
  return JSON.parse(new TextDecoder().decode(plain));
}
