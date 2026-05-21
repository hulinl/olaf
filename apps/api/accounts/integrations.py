"""Symmetric encryption + lightweight helpers for user-scoped
third-party integration tokens (Notion, future OAuth, etc.).

Tokens are stored encrypted at rest. The frontend can read a
boolean "is the integration connected?" via the GET endpoint but
never receives the raw token back — we don't even expose a
fingerprint. The only legitimate consumer of the plaintext is the
backend itself when calling the integration's API.
"""
from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings


def _fernet() -> Fernet:
    """Build the Fernet instance from DJANGO_SECRET_KEY.

    Deriving the key from SECRET_KEY means there's no separate env var
    for an admin to manage. Trade-off: rotating SECRET_KEY invalidates
    every stored integration token; affected users just see
    "Nepřipojeno" in /settings/integrace and paste their token again.
    Acceptable for V1.5 launch since SECRET_KEY rotation is rare.
    """
    digest = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_token(plaintext: str) -> str:
    """Returns base64-urlsafe ciphertext suitable for a TextField."""
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt_token(ciphertext: str) -> str:
    """Returns the original plaintext. Raises InvalidToken on tamper /
    wrong key — caller should catch and treat as 'not connected'."""
    return _fernet().decrypt(ciphertext.encode("ascii")).decode("utf-8")


def safe_decrypt_token(ciphertext: str) -> str | None:
    """As decrypt_token, but returns None instead of raising on any
    error. Use when the caller treats decryption failure the same as
    'no token stored' (e.g. when reading from DB and forwarding to an
    API client)."""
    if not ciphertext:
        return None
    try:
        return decrypt_token(ciphertext)
    except (InvalidToken, ValueError):
        return None
