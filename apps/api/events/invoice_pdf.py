"""Invoice → PDF renderer (WeasyPrint).

Single-purpose helper: take an Invoice instance, return PDF bytes. Keeps
the rendering away from the model + view so view tests don't need
weasyprint installed.
"""
from __future__ import annotations

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
        },
    )
    return HTML(string=html).write_pdf()


def _as_decimal(v) -> Decimal:
    if isinstance(v, Decimal):
        return v
    try:
        return Decimal(str(v or 0))
    except Exception:
        return Decimal("0")
