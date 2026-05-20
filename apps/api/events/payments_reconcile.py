"""Parse Fio bank CSV exports and reconcile credits against RSVPs.

V1 of bank reconciliation: owner downloads "Stažení v CSV" from Fio
internetbanking, uploads here, we match each incoming credit's
variable symbol to a pending RSVP in the same workspace and mark it
paid. V1.5 will trade the manual upload for a Fio webhook.

The Fio CSV starts with a few key:value preamble lines, then a blank
line, then the standard header. Fields use Czech labels, semicolon
delim, comma decimal separator, dates as DD.MM.YYYY. Encoding is
either UTF-8 with BOM or windows-1250 depending on the user's Fio
account locale.
"""
from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation


@dataclass
class FioTx:
    """One inbound credit from a Fio CSV row."""
    when: date | None
    amount: Decimal
    variable_symbol: str
    message: str = ""
    counterparty: str = ""


@dataclass
class MatchedRow:
    tx: FioTx
    rsvp_id: int
    event_title: str
    user_full_name: str
    user_email: str
    amount_mismatch: bool


@dataclass
class ReconcileResult:
    total_rows: int
    credits: int
    matched: list[MatchedRow] = field(default_factory=list)
    unmatched: list[FioTx] = field(default_factory=list)
    already_paid: list[FioTx] = field(default_factory=list)


def _decode(content: bytes | str) -> str:
    if isinstance(content, str):
        return content
    # Order matters — UTF-8 first because that's what new Fio exports use.
    for enc in ("utf-8-sig", "utf-8", "cp1250", "windows-1250"):
        try:
            return content.decode(enc)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="replace")


def _parse_decimal(value: str) -> Decimal | None:
    if not value:
        return None
    # Strip thousands separators + normalize comma → dot for the Czech
    # locale's amount format.
    cleaned = (
        value.replace("\xa0", "").replace(" ", "").replace(",", ".")
    )
    try:
        return Decimal(cleaned)
    except (InvalidOperation, ValueError):
        return None


def _parse_date(value: str) -> date | None:
    if not value:
        return None
    for fmt in ("%d.%m.%Y", "%Y-%m-%d", "%d/%m/%Y"):
        try:
            return datetime.strptime(value.strip(), fmt).date()
        except ValueError:
            continue
    return None


# Header columns we tolerate. Map normalized lowercase keys to a stable
# internal name. Fio's column names have shifted over the years; both
# old + new wording covered.
_AMOUNT_KEYS = ("objem", "částka", "castka", "amount")
_VS_KEYS = ("vs", "variabilní symbol", "variabilni symbol")
_DATE_KEYS = ("datum",)
_MESSAGE_KEYS = ("zpráva pro příjemce", "zprava pro prijemce", "message")
_COUNTERPARTY_KEYS = ("protiúčet", "protiucet", "název protiúčtu")


def _pick(row: dict[str, str], keys: tuple[str, ...]) -> str:
    for k in keys:
        if row.get(k):
            return row[k]
    return ""


def parse_fio_csv(content: bytes | str) -> list[FioTx]:
    """Parse Fio "Stažení v CSV" export into a flat list of credits.

    Returns only inbound (positive) credits — debits and zero-amount
    rows are filtered out since reconciliation only cares about money
    that arrived. Empty `variable_symbol` is preserved (UI shows these
    in the unmatched bucket).
    """
    text = _decode(content)
    lines = text.splitlines()

    # Find the column header by looking for a row that has both Datum +
    # VS (Fio's distinctive combo) and contains the delimiter. Preamble
    # rows like `"Účet";"123"` have only one field per line.
    header_idx = None
    for i, line in enumerate(lines):
        low = line.lower()
        if (
            ("datum" in low)
            and ("vs" in low or "variabilní" in low or "variabilni" in low)
        ):
            header_idx = i
            break
    if header_idx is None:
        return []

    csv_text = "\n".join(lines[header_idx:])

    # Detect delimiter — Fio uses ; in CZ locale, but some exports
    # come comma-separated.
    sample = csv_text[:1024]
    delim = ";" if sample.count(";") > sample.count(",") else ","

    reader = csv.DictReader(io.StringIO(csv_text), delimiter=delim)
    txns: list[FioTx] = []
    for row in reader:
        norm: dict[str, str] = {}
        for k, v in row.items():
            if k is None:
                continue
            norm[k.strip().lower()] = (v or "").strip()
        amount = _parse_decimal(_pick(norm, _AMOUNT_KEYS))
        if amount is None or amount <= 0:
            continue
        vs_raw = _pick(norm, _VS_KEYS)
        # Strip leading zeros (Fio sometimes left-pads VS to a fixed
        # width) but keep an empty VS as empty.
        vs = re.sub(r"^0+", "", vs_raw) if vs_raw else ""
        txns.append(
            FioTx(
                when=_parse_date(_pick(norm, _DATE_KEYS)),
                amount=amount,
                variable_symbol=vs,
                message=_pick(norm, _MESSAGE_KEYS),
                counterparty=_pick(norm, _COUNTERPARTY_KEYS),
            )
        )
    return txns


def reconcile_workspace(*, workspace, csv_content: bytes | str) -> ReconcileResult:
    """Run a Fio CSV through reconciliation against this workspace's RSVPs.

    Marks every match as paid + auto-generates its invoice (same path as
    the manual "Označit zaplaceno" button). Rows that don't find a
    matching pending RSVP are returned in the `unmatched` bucket so the
    UI can show the owner what still needs manual handling.
    """
    from django.db.models import Q as DQ
    from django.utils import timezone

    from .models import RSVP, Event, generate_invoice_for_rsvp

    txns = parse_fio_csv(csv_content)
    result = ReconcileResult(total_rows=0, credits=len(txns))

    # Pre-fetch the workspace's event ids so each match query is bounded.
    event_ids = list(
        Event.objects.filter(
            DQ(workspace=workspace) | DQ(shared_workspaces=workspace)
        ).values_list("id", flat=True).distinct()
    )

    for tx in txns:
        if not tx.variable_symbol:
            result.unmatched.append(tx)
            continue
        # Match VS, scoped to this workspace's events. We allow VS with
        # or without leading zeros to absorb Fio's padding quirk.
        rsvp = (
            RSVP.objects.select_related("event", "user")
            .filter(
                event_id__in=event_ids,
                variable_symbol=tx.variable_symbol,
            )
            .first()
        )
        if rsvp is None:
            result.unmatched.append(tx)
            continue

        amount_mismatch = False
        due = getattr(rsvp, "payment_due_amount", None)
        if due and abs(Decimal(str(due)) - tx.amount) > Decimal("0.01"):
            amount_mismatch = True

        if rsvp.payment_status == RSVP.PAYMENT_PAID:
            result.already_paid.append(tx)
            continue

        rsvp.payment_status = RSVP.PAYMENT_PAID
        rsvp.paid_at = timezone.now()
        rsvp.save(update_fields=["payment_status", "paid_at", "updated_at"])

        # Auto-generate the invoice, but never let a single failure
        # block the rest of the batch.
        import contextlib

        with contextlib.suppress(Exception):
            generate_invoice_for_rsvp(rsvp)

        result.matched.append(
            MatchedRow(
                tx=tx,
                rsvp_id=rsvp.id,
                event_title=rsvp.event.title,
                user_full_name=rsvp.user.get_full_name() or "",
                user_email=rsvp.user.email,
                amount_mismatch=amount_mismatch,
            )
        )

    result.total_rows = len(txns)
    return result
