export interface SignInOptions {
  /** Required. One-time challenge from your backend. [A-Za-z0-9_-]{8,128} */
  nonce: string;
  /** App label shown to the user. Defaults to location.host. Max 64 chars. */
  app?: string;
  /** Override the wallet URL (default: https://wallet.spw.network). */
  walletUrl?: string;
  /** Approval timeout in ms. Default 5 min. */
  timeoutMs?: number;
  /** If false, skip extension and always use web popup. Default true. */
  preferExtension?: boolean;
}

export interface SignInResult {
  address: string;
  pubkey: string;
  nonce: string;
  sig: string;
}

export interface PaymentOptions {
  /** SPW address to pay. */
  to: string;
  /** Amount in feathers (integer). 1 SPW = 1e8 feathers. */
  amount: number;
  /** Optional label shown on the payment request. */
  label?: string;
  walletUrl?: string;
  timeoutMs?: number;
}

export interface PaymentResult {
  txid: string;
}

export interface SPWConnectError extends Error {
  code:
    | 'BAD_PARAMS'
    | 'POPUP_BLOCKED'
    | 'TIMEOUT'
    | 'USER_CANCELLED'
    | 'WALLET_LOCKED'
    | 'INTERNAL';
}

export function signIn(opts: SignInOptions): Promise<SignInResult>;
export function requestPayment(opts: PaymentOptions): Promise<PaymentResult>;
export function isAvailable(): boolean;
export function isExtensionAvailable(): boolean;
export const VERSION: string;

declare const SPWConnect: {
  signIn: typeof signIn;
  requestPayment: typeof requestPayment;
  isAvailable: typeof isAvailable;
  isExtensionAvailable: typeof isExtensionAvailable;
  VERSION: string;
};

export default SPWConnect;

declare global {
  interface Window {
    SPWConnect: typeof SPWConnect;
    /** Injected by the SPW browser extension when installed. */
    spw?: {
      requestSignIn(opts: { nonce: string; app?: string }): Promise<SignInResult>;
      requestPayment?(opts: { to: string; amount: number; label?: string }): Promise<PaymentResult>;
    };
  }
}
