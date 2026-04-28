"""
SPW Connect reference dApp — a minimal Flask + SQLite app that authenticates
users via an SPW Wallet sign-in proof and tracks "credits" per wallet address.

Flow demonstrated:
  1. GET /                      — homepage, shows Connect Wallet button or dashboard
  2. POST /api/wallet/nonce     — issue a one-time nonce, bound to browser session
  3. POST /api/wallet/link      — verify the sign-in proof, bind address to session
  4. GET /dashboard             — authenticated view, bumps "credit" counter
"""

from __future__ import annotations

import os
import secrets
import sqlite3
import time
from contextlib import closing
from pathlib import Path

from flask import Flask, g, jsonify, render_template, request

from spw_verify import InvalidSignature, verify

APP_LABEL = os.environ.get("SPW_APP_LABEL", "demo.local")
NONCE_TTL_SEC = 300
DB_PATH = Path(os.environ.get("SPW_DB", "/tmp/spw_demo.sqlite3"))

app = Flask(__name__)
app.config["WALLET_URL"] = os.environ.get("SPW_WALLET_URL", "https://wallet.spw.network")
app.config["APP_LABEL"] = APP_LABEL


# ── DB ─────────────────────────────────────────────────────────────────────
SCHEMA = """
CREATE TABLE IF NOT EXISTS sessions (
    sid         TEXT PRIMARY KEY,
    address     TEXT,
    created_at  REAL NOT NULL,
    credits     INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS nonces (
    nonce       TEXT PRIMARY KEY,
    sid         TEXT NOT NULL,
    app_label   TEXT NOT NULL,
    created_at  REAL NOT NULL,
    consumed    INTEGER NOT NULL DEFAULT 0
);
"""


def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys=ON")
    return g.db


@app.teardown_appcontext
def _close_db(_exc):
    conn = g.pop("db", None)
    if conn is not None:
        conn.close()


def init_db():
    with closing(sqlite3.connect(DB_PATH)) as conn, conn:
        conn.executescript(SCHEMA)


# ── Session helpers ────────────────────────────────────────────────────────
def current_sid() -> str:
    sid = request.cookies.get("sid")
    if sid:
        return sid
    # generate a new sid; caller writes cookie on the response
    return secrets.token_hex(16)


def get_session(sid: str):
    conn = db()
    row = conn.execute("SELECT * FROM sessions WHERE sid=?", (sid,)).fetchone()
    if row:
        return row
    conn.execute(
        "INSERT INTO sessions (sid, created_at) VALUES (?, ?)", (sid, time.time())
    )
    conn.commit()
    return conn.execute("SELECT * FROM sessions WHERE sid=?", (sid,)).fetchone()


def _set_sid(resp, sid: str):
    resp.set_cookie("sid", sid, max_age=180 * 86400, httponly=True, samesite="Lax")
    return resp


# ── Routes ─────────────────────────────────────────────────────────────────
@app.get("/")
def home():
    sid = current_sid()
    sess = get_session(sid)
    resp = app.make_response(
        render_template(
            "index.html",
            address=sess["address"],
            credits=sess["credits"],
            wallet_url=app.config["WALLET_URL"],
        )
    )
    return _set_sid(resp, sid)


@app.post("/api/wallet/nonce")
def issue_nonce():
    sid = current_sid()
    get_session(sid)  # ensure session row exists
    nonce = secrets.token_urlsafe(24)  # ~32 chars, URL-safe
    db().execute(
        "INSERT INTO nonces (nonce, sid, app_label, created_at) VALUES (?, ?, ?, ?)",
        (nonce, sid, app.config["APP_LABEL"], time.time()),
    )
    db().commit()
    resp = jsonify({"nonce": nonce, "app": app.config["APP_LABEL"]})
    return _set_sid(resp, sid)


@app.post("/api/wallet/link")
def wallet_link():
    data = request.get_json(silent=True) or {}
    for k in ("address", "pubkey", "nonce", "sig"):
        if not isinstance(data.get(k), str) or not data[k]:
            return jsonify({"error": f"missing {k}"}), 400

    conn = db()
    rec = conn.execute(
        "SELECT sid, app_label, created_at, consumed FROM nonces WHERE nonce=?",
        (data["nonce"],),
    ).fetchone()
    if not rec:
        return jsonify({"error": "unknown nonce"}), 400
    if rec["consumed"]:
        return jsonify({"error": "nonce already used"}), 400
    if time.time() - rec["created_at"] > NONCE_TTL_SEC:
        return jsonify({"error": "nonce expired"}), 400

    try:
        verify(
            address=data["address"],
            pubkey=data["pubkey"],
            nonce=data["nonce"],
            sig=data["sig"],
            app=rec["app_label"],
        )
    except InvalidSignature as e:
        return jsonify({"error": e.reason}), 400

    # Atomic: consume nonce + bind address to the session that issued the nonce.
    with conn:
        conn.execute("UPDATE nonces SET consumed=1 WHERE nonce=?", (data["nonce"],))
        conn.execute(
            "UPDATE sessions SET address=? WHERE sid=?",
            (data["address"], rec["sid"]),
        )
        # Demo: hand out 100 credits on first link.
        conn.execute(
            "UPDATE sessions SET credits = credits + 100 "
            "WHERE sid=? AND address IS NOT NULL AND credits = 0",
            (rec["sid"],),
        )
    return jsonify({"ok": True, "address": data["address"]})


@app.post("/api/credits/earn")
def earn_credits():
    """Dummy authenticated endpoint — +10 credits if signed-in."""
    sid = current_sid()
    sess = get_session(sid)
    if not sess["address"]:
        return jsonify({"error": "not connected"}), 401
    db().execute(
        "UPDATE sessions SET credits = credits + 10 WHERE sid=?", (sid,)
    )
    db().commit()
    return jsonify({"credits": sess["credits"] + 10, "address": sess["address"]})


@app.post("/api/logout")
def logout():
    sid = current_sid()
    db().execute("UPDATE sessions SET address=NULL WHERE sid=?", (sid,))
    db().commit()
    return jsonify({"ok": True})


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=True)
