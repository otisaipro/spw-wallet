export const VERSION: string;
export const PROTOCOL_VERSION: string;

export class InvalidSignature extends Error {
  readonly reason: string;
}

export interface VerifyInput {
  address: string;
  pubkey: string;
  nonce: string;
  sig: string;
  /** The app label this nonce was issued for, from YOUR server's records. */
  app?: string;
}

/** Throws InvalidSignature on any failure. */
export function verify(input: VerifyInput): void;

/** Non-throwing variant. */
export function verifyRaw(input: VerifyInput): boolean;

/** Derive SPW base58check address from a 33-byte compressed pubkey (hex). */
export function pubkeyToAddress(pubkeyHex: string): string;

/** The exact UTF-8 bytes the wallet signed. */
export function canonicalMessage(app: string, address: string, nonce: string): Buffer;
