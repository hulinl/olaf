"""Generate PDF z ContractTemplate + per-RSVP data.

`body_html` z template projdeme Django template enginem s contextem
plný účastník/event/workspace dat. Pak ho zabalíme do WeasyPrint
stylovaného HTML a zrendrujeme do bytes.

Placeholdery podporované v body_html (V1):
- {{ucastnik_jmeno}}        — full_name
- {{ucastnik_email}}        — email
- {{ucastnik_telefon}}      — phone
- {{ucastnik_adresa}}       — formatted address (street, city, zip, country)
- {{ucastnik_datum_narozeni}} — dob (cs-CZ format)
- {{event_titul}}           — event.title
- {{event_datum}}           — formatted date range
- {{event_misto}}           — event.location_text
- {{event_cena}}            — price + currency, nebo "zdarma"
- {{workspace_jmeno}}       — workspace.name
- {{datum_dnes}}            — today, cs-CZ
"""
from __future__ import annotations

from django.template import Context, Template
from django.utils import timezone

from .models import RSVPContract


def _czech_date(d) -> str:
    if not d:
        return ""
    if isinstance(d, str):
        return d
    return d.strftime("%-d. %-m. %Y") if hasattr(d, "strftime") else str(d)


def build_context(rsvp_contract: RSVPContract) -> dict:
    """Sestaví context dictionary pro Django Template render
    z dat RSVP + události + workspace.
    """
    rsvp = rsvp_contract.rsvp
    user = rsvp.user
    event = rsvp.event
    workspace = event.workspace

    address_parts = []
    if user:
        for f in ("address_street", "address_city", "address_zip"):
            val = getattr(user, f, "").strip()
            if val:
                address_parts.append(val)
    address = ", ".join(address_parts)

    price = ""
    if event.price_amount:
        price = f"{event.price_amount} {event.price_currency or 'CZK'}"
    else:
        price = "zdarma"

    starts = event.starts_at
    ends = event.ends_at
    if starts and ends and starts.date() == ends.date():
        event_date = _czech_date(starts.date())
    elif starts and ends:
        event_date = f"{_czech_date(starts.date())} – {_czech_date(ends.date())}"  # noqa: RUF001
    else:
        event_date = ""

    return {
        "ucastnik_jmeno": user.get_full_name() if user else "",
        "ucastnik_email": user.email if user else "",
        "ucastnik_telefon": getattr(user, "phone", "") if user else "",
        "ucastnik_adresa": address,
        "ucastnik_datum_narozeni": _czech_date(
            getattr(user, "dob", None) if user else None
        ),
        "event_titul": event.title,
        "event_datum": event_date,
        "event_misto": event.location_text or "",
        "event_cena": price,
        "workspace_jmeno": workspace.name,
        "datum_dnes": _czech_date(timezone.localdate()),
    }


def render_contract_html(rsvp_contract: RSVPContract) -> str:
    """Vyrender body_html šablony s vyplněnými placeholdery."""
    template = rsvp_contract.event_contract.template
    ctx = build_context(rsvp_contract)
    body = Template(template.body_html or "").render(Context(ctx))
    # Wrap do print-friendly HTML stylingu — bezpečné A4 margins,
    # readable font, nadpis s názvem události.
    return f"""
<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="utf-8" />
<title>{template.name}</title>
<style>
  @page {{ size: A4; margin: 22mm 20mm; }}
  body {{ font-family: 'Helvetica', 'Arial', sans-serif; font-size: 11pt; line-height: 1.55; color: #1a1a1a; }}
  h1 {{ font-size: 18pt; margin: 0 0 6mm; }}
  h2 {{ font-size: 13pt; margin: 8mm 0 3mm; }}
  p {{ margin: 0 0 3mm; }}
  .meta {{ font-size: 9pt; color: #777; margin-bottom: 8mm; }}
  hr {{ border: none; border-top: 1px solid #e5e5e5; margin: 8mm 0; }}
  .sig {{ margin-top: 14mm; }}
  .sig-line {{ border-top: 1px solid #1a1a1a; width: 60mm; margin-top: 16mm; }}
</style>
</head>
<body>
  <h1>{template.name}</h1>
  <p class="meta">{ctx['workspace_jmeno']} · {ctx['event_titul']} · {ctx['datum_dnes']}</p>
  <hr />
  {body}
</body>
</html>
"""


def render_contract_pdf(rsvp_contract: RSVPContract) -> bytes:
    """Vyrender PDF bytes přes WeasyPrint.

    Importujeme WeasyPrint lazy — v test env-u může chybět native lib
    (libgobject), takže import pádu na top-level by způsobil chybu
    i u testů co PDF generování nevolají.
    """
    from weasyprint import HTML

    html_str = render_contract_html(rsvp_contract)
    return HTML(string=html_str).write_pdf()
