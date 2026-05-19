"""Czech QR Platba (SPAYD) helpers for RSVP payment instructions.

Generates a SPAYD string per spec at https://qr-platba.cz/pro-vyvojare/
and renders it as a QR-code PNG via the `qrcode` library.

Public API:
    build_spayd_string(iban, amount, currency, variable_symbol, message) -> str
    build_qr_png(spayd) -> bytes
    next_variable_symbol(rsvp_id, event_id) -> str
"""
from __future__ import annotations

import io
from decimal import Decimal

import qrcode


def _format_amount(amount: Decimal) -> str:
    """SPAYD requires "%.2f" formatting (e.g. 2500.00, not 2500)."""
    return f"{Decimal(amount):.2f}"


def _sanitize_msg(msg: str) -> str:
    """SPAYD MSG field — strip characters that break the format. Limit
    to 60 chars; SPAYD spec recommends ≤ 60."""
    cleaned = "".join(c for c in (msg or "") if c not in {"*", "\n", "\r"})
    return cleaned.strip()[:60]


def build_spayd_string(
    *,
    iban: str,
    amount: Decimal | str,
    currency: str = "CZK",
    variable_symbol: str = "",
    message: str = "",
) -> str:
    """Build the SPAYD string that goes inside the QR.

    Example output:
        SPD*1.0*ACC:CZ6508000000192000145399*AM:2500.00*CC:CZK*X-VS:123456*MSG:Letni kemp

    The 'ACC' field must contain a valid IBAN. We don't validate format
    here; the workspace owner enters it once in settings and is
    responsible for its correctness.
    """
    parts = ["SPD", "1.0", f"ACC:{iban.replace(' ', '')}"]
    parts.append(f"AM:{_format_amount(Decimal(amount))}")
    parts.append(f"CC:{currency.upper()}")
    if variable_symbol:
        parts.append(f"X-VS:{variable_symbol}")
    msg = _sanitize_msg(message)
    if msg:
        parts.append(f"MSG:{msg}")
    return "*".join(parts)


def build_qr_png(spayd: str, *, box_size: int = 8, border: int = 2) -> bytes:
    """Render a SPAYD string as a PNG (default ~280px square for box_size=8)."""
    img = qrcode.make(
        spayd,
        box_size=box_size,
        border=border,
    )
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def next_variable_symbol(rsvp_id: int, event_id: int) -> str:
    """Generate a stable, unique-per-RSVP variable symbol.

    Max 10 digits per the Czech banking convention. Pack event_id into
    the high digits and rsvp_id into the low so the same RSVP always
    yields the same VS — handy for idempotent regeneration.

    Format: EEEERRRRRR  (4-digit event id + 6-digit rsvp id)
    Falls back to just rsvp_id zero-padded if event_id won't fit.
    """
    if event_id < 10_000 and rsvp_id < 1_000_000:
        return f"{event_id:04d}{rsvp_id:06d}"
    return f"{rsvp_id:010d}"
