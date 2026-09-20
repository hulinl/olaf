"""ICS + add-to-calendar helpers pro potvrzovací mail.

Když organizátor schválí RSVP, chceme účastníkovi rovnou strčit event
do kalendáře — Apple Mail / Gmail app / Outlook detekují text/calendar
přílohu a nabídnou „Add to calendar" jedním klikem. Do HTML mailu navíc
přidáváme tři linky (Google / Outlook / Apple .ics), protože web-mail
klienti .ics prílohu obvykle jenom zobrazí jako download, ne jako
inline pozvánku.

Slotly řeší tenhle flow přes Google Calendar API + OAuth hostitele.
Tady to nemá smysl — OLAF nemá persistent Google account účastníka
a nechceme řešit OAuth. .ics attachment funguje univerzálně.

UID je stabilní přes lifetime user↔event dvojice (event.public_id
+ user.pk). Pokud user zruší a znovu se přihlásí, druhý .ics s vyšším
SEQUENCE přepíše původní event v kalendáři místo aby přidal duplicit.
"""
from __future__ import annotations

from datetime import UTC, datetime
from urllib.parse import quote_plus

from django.conf import settings
from django.utils import timezone

from .models import RSVP, Event


def _ics_escape(value: str) -> str:
    """Escape special chars per RFC 5545 §3.3.11.

    Newlines uvnitř TEXT hodnoty se escapují jako `\\n`, backslash / semicolon
    / comma dostanou předřazený backslash. Pořadí důležité — backslash první.
    """
    if not value:
        return ""
    return (
        value.replace("\\", "\\\\")
        .replace("\n", "\\n")
        .replace("\r", "")
        .replace(",", "\\,")
        .replace(";", "\\;")
    )


def _fmt_utc(dt: datetime) -> str:
    """DTSTART/DTEND ve formátu YYYYMMDDTHHMMSSZ (UTC).

    Naivní datetime (bez tzinfo) je nesmysl pro kalendář — přepočet
    do UTC vyžaduje aware dt. Django timezone-aware save() garantuje
    aware hodnotu, ale defenzivně to ještě uděláme.
    """
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, UTC)
    return dt.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def _event_uid(event: Event, user_id: int | None) -> str:
    """Stable UID per (event, user). Kalendárový klient používá UID
    jako klíč pro upsert — druhý .ics s vyšším SEQUENCE přepíše první."""
    ev_key = event.public_id or f"pk{event.pk}"
    user_key = user_id if user_id is not None else "anon"
    return f"event-{ev_key}-user-{user_key}@olaf.events"


def _event_public_url(event: Event) -> str:
    base = getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")
    if event.public_id:
        return f"{base}/e/{event.public_id}"
    return f"{base}/{event.workspace.slug}/e/{event.slug}"


def build_ics(event: Event, rsvp: RSVP | None = None, *, sequence: int = 0) -> bytes:
    """Poskládá VCALENDAR se single VEVENT pro daný event/RSVP.

    RSVP je optional — pokud None (např. pro generic „přidej si do
    kalendáře" link), UID se odvodí jen z event.public_id + „anon".
    Ale pro re-send s update-em kalendárního záznamu vždycky předej
    RSVP, ať UID zůstane stejný.
    """
    user_id = rsvp.user_id if rsvp is not None else None
    uid = _event_uid(event, user_id)
    now_stamp = _fmt_utc(timezone.now())
    dtstart = _fmt_utc(event.starts_at)
    dtend = _fmt_utc(event.ends_at)

    summary = _ics_escape(event.title)
    description_parts: list[str] = []
    if event.description:
        description_parts.append(event.description)
    description_parts.append(_event_public_url(event))
    description = _ics_escape("\n\n".join(description_parts))

    location_bits: list[str] = []
    if event.location_text:
        location_bits.append(event.location_text)
    if event.meeting_point_text and event.meeting_point_text not in location_bits:
        location_bits.append(event.meeting_point_text)
    location = _ics_escape(" · ".join(location_bits))

    url = _event_public_url(event)
    organizer_email = getattr(settings, "DEFAULT_FROM_EMAIL", "no-reply@olaf.events")

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//olaf.events//RSVP confirmation//CS",
        "CALSCALE:GREGORIAN",
        "METHOD:REQUEST",
        "BEGIN:VEVENT",
        f"UID:{uid}",
        f"DTSTAMP:{now_stamp}",
        f"DTSTART:{dtstart}",
        f"DTEND:{dtend}",
        f"SEQUENCE:{sequence}",
        "STATUS:CONFIRMED",
        "TRANSP:OPAQUE",
        f"SUMMARY:{summary}",
        f"DESCRIPTION:{description}",
        f"URL:{url}",
        f"ORGANIZER;CN={_ics_escape(event.workspace.name)}:mailto:{organizer_email}",
    ]
    if location:
        lines.append(f"LOCATION:{location}")
    if rsvp is not None and rsvp.user is not None and rsvp.user.email:
        attendee_name = _ics_escape(
            rsvp.user.get_full_name() or rsvp.user.email
        )
        lines.append(
            f"ATTENDEE;CN={attendee_name};ROLE=REQ-PARTICIPANT;"
            f"PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:{rsvp.user.email}"
        )
    lines.extend(["END:VEVENT", "END:VCALENDAR"])

    # RFC 5545 vyžaduje CRLF line endings.
    return ("\r\n".join(lines) + "\r\n").encode("utf-8")


def calendar_links(event: Event) -> dict[str, str]:
    """URL-y pro tlačítka „Přidat do kalendáře" v HTML mailu.

    - `google` / `outlook` — web deep-linky s pre-fill, jeden tap pro
      uživatele Gmailu / Outlook.com.
    - `download` — veřejný .ics endpoint. Nutný pro Outlook mobile, kde
      attachment umí přidat jen do MS účtu; z download linku browser
      stáhne soubor a share sheet nabídne libovolný kalendár (Google
      Kalendář app, Apple Calendar).
    """
    api_base = getattr(
        settings, "API_PUBLIC_URL", "http://localhost:8000"
    ).rstrip("/")
    dt_utc_google = f"{_fmt_utc(event.starts_at)}/{_fmt_utc(event.ends_at)}"

    # URL uvádíme s prefixem a odstavcem před description. Kdyby URL
    # visela na konci textu, Google Calendar description auto-linker
    # v mobilu ořízne poslední znak — public_id končící číslicí (např.
    # „A7K2M9P3") pak vede na 404. `\n\n` za URL ji spolehlivě
    # ukončí, prefix „Odkaz: " ji drží mimo pozici posledního znaku.
    public_url = _event_public_url(event)
    details_parts: list[str] = [f"Odkaz na akci: {public_url}"]
    if event.description:
        details_parts.append(event.description)
    details = "\n\n".join(details_parts)

    location_bits: list[str] = []
    if event.location_text:
        location_bits.append(event.location_text)
    if event.meeting_point_text and event.meeting_point_text not in location_bits:
        location_bits.append(event.meeting_point_text)
    location = " · ".join(location_bits)

    google = (
        "https://calendar.google.com/calendar/render?action=TEMPLATE"
        f"&text={quote_plus(event.title)}"
        f"&dates={dt_utc_google}"
        f"&details={quote_plus(details)}"
    )
    if location:
        google += f"&location={quote_plus(location)}"

    outlook = (
        "https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose"
        "&rru=addevent"
        f"&subject={quote_plus(event.title)}"
        f"&startdt={quote_plus(event.starts_at.isoformat())}"
        f"&enddt={quote_plus(event.ends_at.isoformat())}"
        f"&body={quote_plus(details)}"
    )
    if location:
        outlook += f"&location={quote_plus(location)}"

    download = ""
    if event.public_id:
        download = f"{api_base}/api/events/e/{event.public_id}.ics"

    return {"google": google, "outlook": outlook, "download": download}
