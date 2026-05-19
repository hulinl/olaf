"""Invoice → PDF renderer (WeasyPrint).

Single-purpose helper: take an Invoice instance, return PDF bytes. Keeps
the rendering away from the model + view so view tests don't need
weasyprint installed.
"""
from __future__ import annotations

import base64
from decimal import Decimal

from django.template.loader import render_to_string

from .models import Invoice


def render_invoice_pdf(invoice: Invoice) -> bytes:
    """Render `invoice` as a PDF and return the bytes."""
    from weasyprint import HTML  # local import — heavy

    html = render_to_string(
        "invoices/invoice.html",
        {
            "invoice": invoice,
            "items": invoice.items or [],
            "subtotal": _as_decimal(invoice.subtotal),
            "vat_amount": _as_decimal(invoice.vat_amount),
            "total": _as_decimal(invoice.total),
            "qr_data_uri": _qr_data_uri_for_invoice(invoice),
        },
    )
    return HTML(string=html).write_pdf()


def _qr_data_uri_for_invoice(invoice: Invoice) -> str | None:
    """Build a SPAYD QR PNG and return it as a `data:image/png;base64,...`
    string suitable for inline embedding in the invoice template.
    Returns None when no IBAN is available (snapshot + workspace fallback)."""
    iban = invoice.supplier_iban or invoice.rsvp.event.workspace.payment_iban
    if not iban or not invoice.total:
        return None
    from .payments import build_qr_png, build_spayd_string

    spayd = build_spayd_string(
        iban=iban,
        amount=invoice.total,
        currency=invoice.currency or "CZK",
        variable_symbol=invoice.variable_symbol,
        message=f"{invoice.supplier_name} — {invoice.number}",
    )
    png = build_qr_png(spayd, box_size=6, border=1)
    return f"data:image/png;base64,{base64.b64encode(png).decode('ascii')}"


def _as_decimal(v) -> Decimal:
    if isinstance(v, Decimal):
        return v
    try:
        return Decimal(str(v or 0))
    except Exception:
        return Decimal("0")
