"""
Round-trip test: sign with coincurve, verify with spw_verify.
Proves the verifier matches what the wallet produces for arbitrary inputs.
"""
import hashlib
import os

import pytest

coincurve = pytest.importorskip("coincurve")

from spw_verify import (
    InvalidSignature,
    canonical_message,
    pubkey_to_address,
    verify,
    verify_raw,
)


def _sign(priv: bytes, msg: bytes) -> bytes:
    """Sign with deterministic ECDSA, DER + low-S (matches @noble/secp256k1 canonical:true)."""
    digest = hashlib.sha256(msg).digest()
    # coincurve.PrivateKey.sign_recoverable does DER by default when using sign().
    # sign() returns DER-encoded, low-S normalized.
    return coincurve.PrivateKey(priv).sign(digest, hasher=None)


def _new_keypair():
    priv = os.urandom(32)
    pk = coincurve.PrivateKey(priv).public_key.format(compressed=True)
    return priv, pk.hex()


def test_known_message_bytes():
    # Make sure we produce the exact bytes spec says.
    msg = canonical_message(app="example.com", address="DFabc", nonce="xyz")
    assert msg == b"SPW Wallet Sign-In v1\napp: example.com\naddress: DFabc\nnonce: xyz"
    assert not msg.endswith(b"\n")


def test_empty_app_still_has_space():
    msg = canonical_message(app="", address="DF", nonce="n")
    assert msg == b"SPW Wallet Sign-In v1\napp: \naddress: DF\nnonce: n"


def test_pubkey_to_address_shape():
    # 33-byte compressed pubkey → base58check string starting with a predictable prefix.
    _, pub_hex = _new_keypair()
    addr = pubkey_to_address(pub_hex)
    assert 25 <= len(addr) <= 35
    # version 0x1e → address tends to start with 'D' in base58
    # (not guaranteed for every payload, but overwhelmingly common).


def test_roundtrip_sign_verify():
    priv, pub_hex = _new_keypair()
    address = pubkey_to_address(pub_hex)
    nonce = "abcdef0123456789"
    app = "test-app.local"

    msg = canonical_message(app, address, nonce)
    sig = _sign(priv, msg).hex()

    # Should not raise.
    verify(address=address, pubkey=pub_hex, nonce=nonce, sig=sig, app=app)
    assert verify_raw(address=address, pubkey=pub_hex, nonce=nonce, sig=sig, app=app)


def test_rejects_wrong_app():
    priv, pub_hex = _new_keypair()
    address = pubkey_to_address(pub_hex)
    nonce = "abcdef0123456789"
    sig = _sign(priv, canonical_message("real-app", address, nonce)).hex()

    with pytest.raises(InvalidSignature) as e:
        verify(address=address, pubkey=pub_hex, nonce=nonce, sig=sig, app="attacker-app")
    assert "bad signature" in str(e.value)


def test_rejects_wrong_nonce():
    priv, pub_hex = _new_keypair()
    address = pubkey_to_address(pub_hex)
    sig = _sign(priv, canonical_message("app", address, "nonce-a")).hex()

    with pytest.raises(InvalidSignature):
        verify(address=address, pubkey=pub_hex, nonce="nonce-b", sig=sig, app="app")


def test_rejects_address_mismatch():
    # Attacker substitutes their pubkey for the victim's address.
    priv_attacker, pub_attacker = _new_keypair()
    _, pub_victim = _new_keypair()
    victim_addr = pubkey_to_address(pub_victim)
    nonce = "xyz123abc456"

    sig = _sign(priv_attacker, canonical_message("app", victim_addr, nonce)).hex()

    with pytest.raises(InvalidSignature) as e:
        verify(
            address=victim_addr,
            pubkey=pub_attacker,
            nonce=nonce,
            sig=sig,
            app="app",
        )
    assert "derive" in str(e.value)


def test_rejects_malformed_pubkey():
    with pytest.raises(InvalidSignature):
        verify(address="x", pubkey="nothex!" * 10, nonce="nn", sig="aa" * 71, app="")


def test_rejects_short_sig():
    _, pub_hex = _new_keypair()
    addr = pubkey_to_address(pub_hex)
    with pytest.raises(InvalidSignature):
        verify(address=addr, pubkey=pub_hex, nonce="nnnnnnnn", sig="00", app="")
