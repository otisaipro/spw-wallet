import hashlib
import json
import os
import secrets
from ecdsa import SigningKey, VerifyingKey, SECP256k1
from ecdsa.util import sigencode_der, sigdecode_der
from config import WALLET_DIR, SPW_VERSION
from wallet.bip39 import (
    generate_mnemonic, validate_mnemonic,
    mnemonic_to_spend_key, mnemonic_to_view_key,
)


# ── Base58Check ──────────────────────────────────────────────────────────────

BASE58_CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

def b58encode(data: bytes) -> str:
    n = int.from_bytes(data, 'big')
    result = []
    while n:
        n, r = divmod(n, 58)
        result.append(BASE58_CHARS[r])
    pad = len(data) - len(data.lstrip(b'\x00'))
    return '1' * pad + ''.join(reversed(result))

def b58decode(s: str) -> bytes:
    n = 0
    for c in s:
        n = n * 58 + BASE58_CHARS.index(c)
    length = (n.bit_length() + 7) // 8
    data = n.to_bytes(length, 'big')
    pad = len(s) - len(s.lstrip('1'))
    return b'\x00' * pad + data

def _checksum(data: bytes) -> bytes:
    return hashlib.sha256(hashlib.sha256(data).digest()).digest()[:4]

def base58check_encode(version: int, payload: bytes) -> str:
    data = bytes([version]) + payload
    return b58encode(data + _checksum(data))

def base58check_decode(s: str) -> tuple:
    raw  = b58decode(s)
    data, ck = raw[:-4], raw[-4:]
    if _checksum(data) != ck:
        raise ValueError("Invalid checksum")
    return data[0], data[1:]


# ── Address derivation ───────────────────────────────────────────────────────

def _pubkey_hash(pubkey_bytes: bytes) -> bytes:
    sha = hashlib.sha256(pubkey_bytes).digest()
    try:
        return hashlib.new('ripemd160', sha).digest()
    except ValueError:
        return sha[:20]

def pubkey_to_address(pubkey_bytes: bytes) -> str:
    return base58check_encode(SPW_VERSION, _pubkey_hash(pubkey_bytes))


# ── Stealth address helpers ──────────────────────────────────────────────────
# Implements basic stealth using ECDH:
#   sender:    R = r·G,  P_out = H(r·V)·G + S  (V=view_pubkey, S=spend_pubkey)
#   recipient: shared = view_key · R = r·V  →  derive same H → same P_out

_G   = SECP256k1.generator
_N   = SECP256k1.order

def _point_to_bytes(point) -> bytes:
    """Compress an EC point to 33 bytes."""
    prefix = b'\x02' if point.y() % 2 == 0 else b'\x03'
    return prefix + point.x().to_bytes(32, 'big')

def _bytes_to_point(data: bytes):
    """Decompress 33-byte compressed pubkey to EC point."""
    vk = VerifyingKey.from_string(data, curve=SECP256k1)
    return vk.pubkey.point

def _ecdh_hash(point) -> bytes:
    """H(point) = SHA256(x-coordinate)."""
    return hashlib.sha256(point.x().to_bytes(32, 'big')).digest()

def make_stealth_output(spend_pubkey_hex: str, view_pubkey_hex: str):
    """
    Called by the SENDER.
    Returns (one_time_address, tx_pubkey_hex).
      one_time_address  – where to send funds (goes into TxOutput.address)
      tx_pubkey_hex     – R = r·G, stored in transaction so recipient can scan
    """
    r   = int.from_bytes(secrets.token_bytes(32), 'big') % _N
    R   = r * _G                                           # tx public key

    spend_point = _bytes_to_point(bytes.fromhex(spend_pubkey_hex))
    view_point  = _bytes_to_point(bytes.fromhex(view_pubkey_hex))

    shared      = r * view_point                           # r·V
    h           = int.from_bytes(_ecdh_hash(shared), 'big')

    one_time_point  = h * _G + spend_point                 # H(r·V)·G + S
    one_time_pubkey = _point_to_bytes(one_time_point)
    one_time_addr   = pubkey_to_address(one_time_pubkey)
    tx_pubkey_hex   = _point_to_bytes(R).hex()

    return one_time_addr, tx_pubkey_hex

def scan_stealth_output(output_address: str,
                        tx_pubkey_hex: str,
                        view_key_hex: str,
                        spend_pubkey_hex: str) -> bool:
    """
    Called by the RECIPIENT to check if an output belongs to them.
    Returns True if the output was sent to this wallet using stealth.
    """
    try:
        R           = _bytes_to_point(bytes.fromhex(tx_pubkey_hex))
        view_key_int= int.from_bytes(bytes.fromhex(view_key_hex), 'big')
        shared      = view_key_int * R                     # view_key · R  =  r·V
        h           = int.from_bytes(_ecdh_hash(shared), 'big')

        spend_point = _bytes_to_point(bytes.fromhex(spend_pubkey_hex))
        expected    = _point_to_bytes(h * _G + spend_point)
        return pubkey_to_address(expected) == output_address
    except Exception:
        return False

def derive_stealth_privkey(tx_pubkey_hex: str,
                           view_key_hex: str,
                           spend_key_hex: str) -> str:
    """
    Returns the one-time private key (hex) needed to spend a stealth output.
    one_time_privkey = (spend_key + H(view_key · R)) mod n
    """
    R            = _bytes_to_point(bytes.fromhex(tx_pubkey_hex))
    view_key_int = int.from_bytes(bytes.fromhex(view_key_hex), 'big')
    shared       = view_key_int * R
    h            = int.from_bytes(_ecdh_hash(shared), 'big')

    spend_int    = int.from_bytes(bytes.fromhex(spend_key_hex), 'big')
    one_time_int = (spend_int + h) % _N
    return one_time_int.to_bytes(32, 'big').hex()


# ── Wallet ───────────────────────────────────────────────────────────────────

class Wallet:
    def __init__(self, spend_key_hex: str = None, view_key_hex: str = None,
                 mnemonic: str = None):
        # ── Key resolution priority: mnemonic > hex > random ──────────
        if mnemonic:
            if not validate_mnemonic(mnemonic):
                raise ValueError("Invalid BIP39 mnemonic")
            self._mnemonic = mnemonic
            spend_bytes = mnemonic_to_spend_key(mnemonic)
            view_bytes  = mnemonic_to_view_key(mnemonic)
            self.sk  = SigningKey.from_string(spend_bytes, curve=SECP256k1)
            self.vsk = SigningKey.from_string(view_bytes,  curve=SECP256k1)
        else:
            self._mnemonic = None
            if spend_key_hex:
                self.sk = SigningKey.from_string(
                    bytes.fromhex(spend_key_hex), curve=SECP256k1)
            else:
                self.sk = SigningKey.generate(curve=SECP256k1)
            if view_key_hex:
                self.vsk = SigningKey.from_string(
                    bytes.fromhex(view_key_hex), curve=SECP256k1)
            else:
                self.vsk = SigningKey.generate(curve=SECP256k1)

        self.vk   = self.sk.get_verifying_key()
        self.vvk  = self.vsk.get_verifying_key()

        self.pubkey     = self.vk.to_string("compressed")    # 33 bytes
        self.view_pubkey= self.vvk.to_string("compressed")   # 33 bytes
        self.address    = pubkey_to_address(self.pubkey)

    @property
    def spend_key_hex(self) -> str:
        return self.sk.to_string().hex()

    @property
    def view_key_hex(self) -> str:
        return self.vsk.to_string().hex()

    @property
    def pubkey_hex(self) -> str:
        return self.pubkey.hex()

    @property
    def view_pubkey_hex(self) -> str:
        return self.view_pubkey.hex()

    # ── private_key_hex alias (CLI compatibility) ──────────────
    @property
    def private_key_hex(self) -> str:
        return self.spend_key_hex

    def sign(self, data: bytes, spend_key_hex: str = None) -> str:
        """Sign 32-byte digest; optionally use a derived one-time key."""
        if spend_key_hex:
            sk = SigningKey.from_string(bytes.fromhex(spend_key_hex), curve=SECP256k1)
        else:
            sk = self.sk
        return sk.sign_digest(data, sigencode=sigencode_der).hex()

    def make_stealth_output(self, recipient_pubkey_hex: str,
                             recipient_view_pubkey_hex: str):
        """Convenience wrapper around module-level make_stealth_output."""
        return make_stealth_output(recipient_pubkey_hex, recipient_view_pubkey_hex)

    def scan_output(self, output_address: str, tx_pubkey_hex: str) -> bool:
        """Return True if this output was sent to this wallet (stealth scan)."""
        return scan_stealth_output(
            output_address, tx_pubkey_hex,
            self.view_key_hex, self.pubkey_hex)

    def derive_stealth_privkey(self, tx_pubkey_hex: str) -> str:
        """One-time private key to spend a stealth UTXO."""
        return derive_stealth_privkey(
            tx_pubkey_hex, self.view_key_hex, self.spend_key_hex)

    @property
    def mnemonic(self) -> str | None:
        """Return the BIP39 mnemonic if this wallet was created from one."""
        return self._mnemonic

    def save(self, name: str = None) -> str:
        os.makedirs(WALLET_DIR, exist_ok=True)
        name = name or self.address[:12]
        path = os.path.join(WALLET_DIR, f"{name}.json")
        d = {
            'address':     self.address,
            'pubkey':      self.pubkey_hex,
            'private_key': self.spend_key_hex,
            'view_key':    self.view_key_hex,
            'view_pubkey': self.view_pubkey_hex,
        }
        if self._mnemonic:
            d['mnemonic'] = self._mnemonic
        with open(path, 'w') as f:
            json.dump(d, f, indent=2)
        return path

    @staticmethod
    def load(path: str) -> 'Wallet':
        with open(path) as f:
            d = json.load(f)
        if d.get('mnemonic'):
            return Wallet(mnemonic=d['mnemonic'])
        return Wallet(
            spend_key_hex=d.get('private_key') or d.get('spend_key'),
            view_key_hex=d.get('view_key'),
        )

    @staticmethod
    def from_mnemonic(phrase: str) -> 'Wallet':
        """Create wallet from a BIP39 mnemonic phrase."""
        return Wallet(mnemonic=phrase)

    @staticmethod
    def new_mnemonic() -> 'Wallet':
        """Create a brand-new wallet with a freshly generated 12-word mnemonic."""
        phrase = generate_mnemonic(128)
        return Wallet(mnemonic=phrase)

    @staticmethod
    def list_wallets():
        os.makedirs(WALLET_DIR, exist_ok=True)
        return [f for f in os.listdir(WALLET_DIR) if f.endswith('.json')]


# ── Signature verification ───────────────────────────────────────────────────

def verify_signature(data: bytes, sig_hex: str, pubkey_hex: str) -> bool:
    try:
        vk  = VerifyingKey.from_string(bytes.fromhex(pubkey_hex), curve=SECP256k1)
        sig = bytes.fromhex(sig_hex)
        return vk.verify_digest(sig, data, sigdecode=sigdecode_der)
    except Exception:
        return False
