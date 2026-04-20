"""
BIP39 + BIP32 pure-Python implementation (no external deps beyond stdlib + ecdsa).

BIP39  — mnemonic generation, validation, seed derivation
BIP32  — HD key derivation (hardened + normal child keys)
BIP44  — coin-specific path  m/44'/COIN_TYPE'/0'/0/index

SPW derivation path:  m/44'/1926'/0'/0/0   (spend key)
                      m/44'/1926'/0'/1/0   (view  key)
"""
import hashlib
import hmac as _hmac
import struct
import secrets
from ecdsa import SigningKey, SECP256k1

from .bip39_words import WORDS
from config import COIN_TYPE


# ── BIP39 ─────────────────────────────────────────────────────────────────────

def generate_mnemonic(strength: int = 128) -> str:
    """
    Generate a BIP39 mnemonic.
    strength=128 → 12 words  |  strength=256 → 24 words
    """
    if strength not in (128, 160, 192, 224, 256):
        raise ValueError("strength must be one of: 128, 160, 192, 224, 256")
    entropy = secrets.token_bytes(strength // 8)
    return _entropy_to_mnemonic(entropy)


def _entropy_to_mnemonic(entropy: bytes) -> str:
    cs_bits   = len(entropy) * 8 // 32          # checksum bit count = ENT/32
    h         = hashlib.sha256(entropy).digest()
    ent_int   = int.from_bytes(entropy, 'big')
    cs_val    = int.from_bytes(h, 'big') >> (256 - cs_bits)
    combined  = (ent_int << cs_bits) | cs_val
    total_bits = len(entropy) * 8 + cs_bits
    num_words  = total_bits // 11
    words = []
    for i in range(num_words - 1, -1, -1):
        words.append(WORDS[(combined >> (i * 11)) & 0x7FF])
    return ' '.join(words)


def validate_mnemonic(phrase: str) -> bool:
    """Return True if mnemonic is valid BIP39."""
    words = phrase.strip().lower().split()
    if len(words) not in (12, 15, 18, 21, 24):
        return False
    try:
        indices = [WORDS.index(w) for w in words]
    except ValueError:
        return False
    combined  = 0
    for idx in indices:
        combined = (combined << 11) | idx
    cs_bits   = len(words) * 11 // 33   # = ENT/32
    ent_bits  = len(words) * 11 - cs_bits
    cs_given  = combined & ((1 << cs_bits) - 1)
    ent_int   = combined >> cs_bits
    entropy   = ent_int.to_bytes(ent_bits // 8, 'big')
    h         = hashlib.sha256(entropy).digest()
    cs_expect = int.from_bytes(h, 'big') >> (256 - cs_bits)
    return cs_given == cs_expect


def mnemonic_to_seed(phrase: str, passphrase: str = '') -> bytes:
    """BIP39: derive 64-byte seed from mnemonic phrase + optional passphrase."""
    pwd  = phrase.strip().encode('utf-8')
    salt = ('mnemonic' + passphrase).encode('utf-8')
    return hashlib.pbkdf2_hmac('sha512', pwd, salt, 2048, dklen=64)


# ── BIP32 ─────────────────────────────────────────────────────────────────────

_N = SECP256k1.order


def _master_key(seed: bytes) -> tuple:
    """Returns (private_key_bytes 32, chain_code_bytes 32)."""
    I = _hmac.new(b'Bitcoin seed', seed, hashlib.sha512).digest()
    return I[:32], I[32:]


def _child_hardened(parent_key: bytes, chain_code: bytes, index: int) -> tuple:
    """Derive hardened child key (index | 0x80000000)."""
    data = b'\x00' + parent_key + struct.pack('>I', 0x80000000 + index)
    I    = _hmac.new(chain_code, data, hashlib.sha512).digest()
    IL, IR = I[:32], I[32:]
    child = (int.from_bytes(IL, 'big') + int.from_bytes(parent_key, 'big')) % _N
    return child.to_bytes(32, 'big'), IR


def _child_normal(parent_key: bytes, chain_code: bytes, index: int) -> tuple:
    """Derive normal (non-hardened) child key."""
    sk  = SigningKey.from_string(parent_key, curve=SECP256k1)
    pub = sk.get_verifying_key().to_string('compressed')   # 33 bytes
    data = pub + struct.pack('>I', index)
    I    = _hmac.new(chain_code, data, hashlib.sha512).digest()
    IL, IR = I[:32], I[32:]
    child = (int.from_bytes(IL, 'big') + int.from_bytes(parent_key, 'big')) % _N
    return child.to_bytes(32, 'big'), IR


def _derive_path(seed: bytes, path: str) -> tuple:
    """
    Derive private key from seed following a BIP32 path string.
    Example: "m/44'/1926'/0'/0/0"
    Returns (private_key_bytes, chain_code).
    """
    key, chain = _master_key(seed)
    for part in path.strip().split('/')[1:]:   # skip 'm'
        hardened = part.endswith("'")
        idx = int(part.rstrip("'"))
        if hardened:
            key, chain = _child_hardened(key, chain, idx)
        else:
            key, chain = _child_normal(key, chain, idx)
    return key, chain


# ── BIP44 SPW paths ───────────────────────────────────────────────────────────

def _spend_path(account: int = 0, index: int = 0) -> str:
    return f"m/44'/{COIN_TYPE}'/{account}'/0/{index}"


def _view_path(account: int = 0, index: int = 0) -> str:
    return f"m/44'/{COIN_TYPE}'/{account}'/1/{index}"


def mnemonic_to_spend_key(phrase: str, passphrase: str = '',
                           account: int = 0, index: int = 0) -> bytes:
    """Derive the SPW spend private key (32 bytes) from a mnemonic."""
    seed     = mnemonic_to_seed(phrase, passphrase)
    key, _   = _derive_path(seed, _spend_path(account, index))
    return key


def mnemonic_to_view_key(phrase: str, passphrase: str = '',
                          account: int = 0, index: int = 0) -> bytes:
    """Derive the SPW view private key (32 bytes) from a mnemonic."""
    seed     = mnemonic_to_seed(phrase, passphrase)
    key, _   = _derive_path(seed, _view_path(account, index))
    return key
