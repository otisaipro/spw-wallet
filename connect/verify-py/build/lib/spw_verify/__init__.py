"""
spw-verify — server-side verifier for SPW Connect sign-in proofs.

Minimal API:

    from spw_verify import verify, InvalidSignature

    try:
        verify(
            address="DF89…",
            pubkey="02…",
            nonce="abc123…",
            sig="3045…",
            app="example.com",
        )
    except InvalidSignature as e:
        # reject the request
        ...

See SPEC.md for the full protocol.
"""

from __future__ import annotations

import hashlib

__all__ = [
    "verify",
    "verify_raw",
    "pubkey_to_address",
    "canonical_message",
    "InvalidSignature",
    "VERSION",
    "PROTOCOL_VERSION",
]

VERSION = "1.0.0"
PROTOCOL_VERSION = "v1"

ADDRESS_VERSION_BYTE = 0x1E
_B58_ALPHABET = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


class InvalidSignature(Exception):
    """Raised by verify() when any check fails. Carries a .reason string."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def _ripemd160(data: bytes) -> bytes:
    try:
        return hashlib.new("ripemd160", data).digest()
    except ValueError:
        # OpenSSL 3 disables legacy hashes by default on some distros.
        # Fall back to pycryptodome if present.
        try:
            from Crypto.Hash import RIPEMD160  # type: ignore
        except ImportError as e:
            raise RuntimeError(
                "ripemd160 unavailable — install pycryptodome or enable the "
                "OpenSSL legacy provider"
            ) from e
        return RIPEMD160.new(data).digest()


def _b58encode(b: bytes) -> str:
    n = int.from_bytes(b, "big")
    out = bytearray()
    while n > 0:
        n, r = divmod(n, 58)
        out.append(_B58_ALPHABET[r])
    # Preserve leading zero bytes as leading '1's.
    for byte in b:
        if byte != 0:
            break
        out.append(_B58_ALPHABET[0])
    out.reverse()
    return out.decode("ascii")


def pubkey_to_address(pubkey_hex: str) -> str:
    """Derive the SPW base58check address from a 33-byte compressed pubkey (hex)."""
    try:
        pub = bytes.fromhex(pubkey_hex)
    except ValueError as e:
        raise InvalidSignature(f"pubkey is not valid hex: {e}") from e
    if len(pub) != 33 or pub[0] not in (0x02, 0x03):
        raise InvalidSignature(
            "pubkey must be a 33-byte compressed secp256k1 key starting 0x02/0x03"
        )
    h = _ripemd160(hashlib.sha256(pub).digest())
    payload = bytes([ADDRESS_VERSION_BYTE]) + h
    checksum = hashlib.sha256(hashlib.sha256(payload).digest()).digest()[:4]
    return _b58encode(payload + checksum)


def canonical_message(app: str, address: str, nonce: str) -> bytes:
    """The exact bytes that the wallet signed. UTF-8, LF separators, no trailing newline."""
    msg = (
        f"SPW Wallet Sign-In {PROTOCOL_VERSION}\n"
        f"app: {app}\n"
        f"address: {address}\n"
        f"nonce: {nonce}"
    )
    return msg.encode("utf-8")


def _secp256k1_verify(sig_der: bytes, digest: bytes, pubkey: bytes) -> bool:
    """secp256k1 ECDSA verify over a pre-hashed 32-byte digest. Tries coincurve, then ecdsa."""
    try:
        from coincurve import PublicKey  # type: ignore
    except ImportError:
        pass
    else:
        try:
            return PublicKey(pubkey).verify(sig_der, digest, hasher=None)
        except Exception:
            return False

    try:
        from ecdsa import BadSignatureError, SECP256k1, VerifyingKey  # type: ignore
        from ecdsa.util import sigdecode_der
    except ImportError as e:
        raise RuntimeError(
            "No secp256k1 backend available. Install one of:\n"
            "  pip install coincurve            # recommended, native, fast\n"
            "  pip install ecdsa                # pure-Python fallback"
        ) from e
    try:
        vk = VerifyingKey.from_string(pubkey, curve=SECP256k1, hashfunc=None)
        return vk.verify_digest(sig_der, digest, sigdecode=sigdecode_der)
    except BadSignatureError:
        return False
    except Exception:
        return False


def verify_raw(
    *,
    address: str,
    pubkey: str,
    nonce: str,
    sig: str,
    app: str = "",
) -> bool:
    """
    Verify without raising. Returns True iff:
      1. pubkey → address matches (prevents pubkey substitution)
      2. DER signature verifies against sha256(canonical_message) under pubkey
    Callers must still check nonce freshness / consumption separately.
    """
    try:
        derived = pubkey_to_address(pubkey)
    except InvalidSignature:
        return False
    if derived != address:
        return False
    try:
        sig_bytes = bytes.fromhex(sig)
        pub_bytes = bytes.fromhex(pubkey)
    except ValueError:
        return False
    digest = hashlib.sha256(canonical_message(app, address, nonce)).digest()
    return _secp256k1_verify(sig_bytes, digest, pub_bytes)


def verify(
    *,
    address: str,
    pubkey: str,
    nonce: str,
    sig: str,
    app: str = "",
) -> None:
    """
    Raises InvalidSignature with a precise reason on any failure.
    Returns None on success.
    """
    if not isinstance(address, str) or not address:
        raise InvalidSignature("address missing")
    if not isinstance(pubkey, str) or len(pubkey) != 66:
        raise InvalidSignature("pubkey must be 66 hex chars (compressed secp256k1)")
    if not isinstance(nonce, str) or not nonce:
        raise InvalidSignature("nonce missing")
    if not isinstance(sig, str) or not (140 <= len(sig) <= 144) or len(sig) % 2:
        raise InvalidSignature("sig must be DER hex, 140-144 chars, even length")

    # pubkey → address
    derived = pubkey_to_address(pubkey)  # may raise
    if derived != address:
        raise InvalidSignature("pubkey does not derive to claimed address")

    # signature
    try:
        sig_bytes = bytes.fromhex(sig)
        pub_bytes = bytes.fromhex(pubkey)
    except ValueError as e:
        raise InvalidSignature(f"sig or pubkey is not valid hex: {e}") from e
    digest = hashlib.sha256(canonical_message(app, address, nonce)).digest()
    if not _secp256k1_verify(sig_bytes, digest, pub_bytes):
        raise InvalidSignature("bad signature")
