// Single bundle entry. esbuild produces one self-contained ES module.
// All crypto deps used by the extension popup come through here.

export * as secp from '@noble/secp256k1';
export { sha256 } from '@noble/hashes/sha256';
export { sha512 } from '@noble/hashes/sha512';
export { ripemd160 } from '@noble/hashes/ripemd160';
export { hmac } from '@noble/hashes/hmac';
export {
  generateMnemonic,
  validateMnemonic,
  mnemonicToSeed,
} from '@scure/bip39';
export { wordlist as bip39Wordlist } from '@scure/bip39/wordlists/english';

import QRCode from 'qrcode';
export { QRCode };
