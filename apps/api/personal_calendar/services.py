"""iCal fetch + parse logic.

Fetch: HTTP GET s reasonable timeoutem, redirects OK.
Parse: icalendar library rozparsuje VEVENT-y, recurring-ical-events
expanduje RRULE do konkrétních instancí.

Uložíme jen start/end/all-day — žádný summary/location/description
(privacy).
"""
from __future__ import annotations

import contextlib
import datetime as dt
import urllib.request

import icalendar
import recurring_ical_events

# Fetch limit — chránit před obřími kalendáři (10 MB max).
MAX_FETCH_BYTES = 10 * 1024 * 1024
# Sync horizon — busy blocks od dneška do (dnes + N dní) se cachují.
# Delší horizon = větší cache; 365 dní pokrývá roční plánování race.
SYNC_HORIZON_DAYS = 365
# Fetch timeout — Google/Outlook obvykle odpoví do 2s, ale dáváme
# rezervu pro pomalejší cloudy (Fastmail).
FETCH_TIMEOUT_SECONDS = 15


class ICalFetchError(Exception):
    """Wrapper pro network + parse chyby, aby caller mohl uložit
    do source.last_error zpráv v CZ."""


def fetch_and_parse(ical_url: str) -> list[dict]:
    """Vrátí list busy blocků z iCal URL.

    Format: [{"starts": ISO, "ends": ISO, "all_day": bool}, ...]

    Raises ICalFetchError s user-friendly zprávou v CZ.
    """
    # Fetch
    try:
        req = urllib.request.Request(
            ical_url,
            headers={"User-Agent": "olaf-events/1.0 (personal-calendar-sync)"},
        )
        with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT_SECONDS) as resp:
            raw = resp.read(MAX_FETCH_BYTES + 1)
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        raise ICalFetchError(f"Nepodařilo se stáhnout kalendář: {exc}") from exc

    if len(raw) > MAX_FETCH_BYTES:
        raise ICalFetchError(
            f"Kalendář je moc velký (>{MAX_FETCH_BYTES // 1024 // 1024} MB)."
        )

    # Parse
    try:
        cal = icalendar.Calendar.from_ical(raw)
    except (ValueError, icalendar.parser.ParserError) as exc:
        raise ICalFetchError(f"Neplatný iCal formát: {exc}") from exc

    # Expand recurring events do horizontu
    today = dt.datetime.now(dt.timezone.utc)
    horizon_end = today + dt.timedelta(days=SYNC_HORIZON_DAYS)

    try:
        events = recurring_ical_events.of(cal).between(today, horizon_end)
    except Exception as exc:
        # recurring_ical_events občas fail na malformed RRULE, ale
        # jednotlivé VEVENTy jsou stále OK. Fallback: použij jen ne-recurring.
        events = [c for c in cal.walk("VEVENT") if not c.get("RRULE")]
        _ = exc  # noqa: F841

    blocks: list[dict] = []
    for ev in events:
        block = _event_to_block(ev)
        if block:
            blocks.append(block)
    return blocks


def _event_to_block(vevent) -> dict | None:
    """Převede VEVENT na anonymized busy block."""
    dtstart = vevent.get("DTSTART")
    dtend = vevent.get("DTEND")
    if not dtstart:
        return None

    start = dtstart.dt
    end = dtend.dt if dtend else start

    # Detect all-day (date bez time)
    all_day = isinstance(start, dt.date) and not isinstance(start, dt.datetime)

    if all_day:
        start_iso = start.isoformat()
        end_iso = end.isoformat() if end else start_iso
    else:
        # Timezone-aware datetime → ISO s Z suffixem
        if start.tzinfo is None:
            start = start.replace(tzinfo=dt.timezone.utc)
        if isinstance(end, dt.datetime):
            if end.tzinfo is None:
                end = end.replace(tzinfo=dt.timezone.utc)
        else:
            # end is date-only, přepočítej na start of day UTC
            end = dt.datetime.combine(end, dt.time.min, tzinfo=dt.timezone.utc)
        start_iso = start.astimezone(dt.timezone.utc).isoformat()
        end_iso = end.astimezone(dt.timezone.utc).isoformat()

    return {
        "starts": start_iso,
        "ends": end_iso,
        "all_day": all_day,
    }


def sync_source(source) -> tuple[bool, str]:
    """Fetche + přepíše `busy_blocks`. Vrátí (ok, message).

    Ok=True → aktualizuje last_synced_at a last_error=''.
    Ok=False → uloží last_error, ponechá stará data.
    """
    from django.utils import timezone

    try:
        blocks = fetch_and_parse(source.ical_url)
    except ICalFetchError as exc:
        source.last_error = str(exc)
        source.save(update_fields=["last_error"])
        return False, str(exc)

    source.busy_blocks = blocks
    source.last_synced_at = timezone.now()
    source.last_error = ""
    source.save(
        update_fields=["busy_blocks", "last_synced_at", "last_error"]
    )
    return True, f"Synchronizováno — {len(blocks)} bloků."


def aggregate_busy_days(
    user, from_date: dt.date, to_date: dt.date
) -> dict[str, bool]:
    """Vrátí {'YYYY-MM-DD': True} pro každý busy den v range.

    Union přes všechny enabled user's calendar sources. Day-level
    granularita (canvas view je per-day, ne per-hour).
    """
    result: dict[str, bool] = {}
    for source in user.calendar_sources.filter(enabled=True):
        for block in source.busy_blocks:
            starts_str = block.get("starts")
            ends_str = block.get("ends")
            if not starts_str:
                continue
            with contextlib.suppress(ValueError):
                start_d = _iso_to_date(starts_str)
                end_d = _iso_to_date(ends_str) if ends_str else start_d
                current = start_d
                while current <= end_d and current <= to_date:
                    if current >= from_date:
                        result[current.isoformat()] = True
                    current += dt.timedelta(days=1)
    return result


def _iso_to_date(iso_str: str) -> dt.date:
    """Toleruje 'YYYY-MM-DD' i 'YYYY-MM-DDTHH:MM:SS+00:00'."""
    if "T" in iso_str:
        return dt.datetime.fromisoformat(iso_str.replace("Z", "+00:00")).date()
    return dt.date.fromisoformat(iso_str)
