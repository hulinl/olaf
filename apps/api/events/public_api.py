"""Veřejné API pro externí konzumenty (olafadventures.cz, atd.)

Spec: docs/olaf-events-public-api-spec.md (repo hulinl/olafadventures-web).

Endpointy:
  GET /api/public/events/{slug}
  GET /api/public/events?slugs=a,b,c

Chování:
- Bez autentikace, jen `published/closed/completed/cancelled` eventy.
- CORS `Access-Control-Allow-Origin: *` — public read-only.
- Cache-Control 60 s, aby olaf.events neriskoval traffic spike z homepage
  refresh smyčky.
- State enum spočítá backend (viz `_compute_state`), aby všichni klienti
  měli jednu pravdu.
- 404 pro neexistující slug, 410 pro archived (soft-deleted).

Payload v2 (2026-09-11) přidává identity + termín/místo bloky
(title, date, endDate, duration, location, difficulty) — externí weby
mají mít single source of truth pro fakta o akci.
"""
from __future__ import annotations

from datetime import UTC

from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.cache import cache_control
from django.views.decorators.http import require_safe

from .models import Event

_DIFFICULTY_LABEL: dict[str, str] = {
    Event.DIFFICULTY_LIGHT: "Lehká",
    Event.DIFFICULTY_MODERATE: "Střední",
    Event.DIFFICULTY_HARD: "Náročná",
    Event.DIFFICULTY_EXTREME: "Extrémní",
}


def _absolute_event_url(event: Event) -> str:
    """Kanonická URL registrace na frontendu."""
    base = getattr(settings, "FRONTEND_URL", "https://olaf.events").rstrip("/")
    return f"{base}/{event.workspace.slug}/e/{event.slug}"


def _iso(dt) -> str | None:
    """ISO 8601 s UTC 'Z' suffixem tak, jak spec požaduje."""
    if dt is None:
        return None
    # `astimezone(utc)` konvertuje aware datetimes; naivní by neměly
    # v DB nikdy dorazit (USE_TZ=True v settings).

    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _duration_days(event: Event) -> int:
    """Počet dní eventu (inclusive). Jednodenní = 1, vícedenní = int
    calendár-dnů které event pokrývá."""
    if event.starts_at is None or event.ends_at is None:
        return 1
    start = event.starts_at.date()
    end = event.ends_at.date()
    return max(1, (end - start).days + 1)


def _end_date_for_payload(event: Event) -> str | None:
    """Spec chce `endDate: null` pro jednodenní akce, ISO string pro
    vícedenní. Jednodenní = starts_at.date() == ends_at.date()."""
    if event.starts_at is None or event.ends_at is None:
        return None
    if event.starts_at.date() == event.ends_at.date():
        return None
    return _iso(event.ends_at)


def _compute_state(event: Event, now, registered: int) -> str:
    """Enum `state` per spec:

      planned  — reg neotevřena (`now < registrationOpensAt`)
      open     — reg běží + jsou místa
      soldout  — plno, event ještě neproběhl
      running  — event právě probíhá
      ended    — event doběhl / zrušen / archivován
    """
    if event.status in (Event.STATUS_CANCELLED, Event.STATUS_COMPLETED):
        return "ended"
    if now >= event.ends_at:
        return "ended"
    if now >= event.starts_at:
        return "running"
    if event.registration_opens_at and now < event.registration_opens_at:
        return "planned"
    if event.status == Event.STATUS_CLOSED:
        return "soldout"
    if event.capacity is not None and registered >= event.capacity:
        return "soldout"
    if event.registration_closes_at and now >= event.registration_closes_at:
        return "soldout"
    return "open"


def _serialize_event(event: Event, now) -> dict:
    """Payload dle spec v2."""
    registered = event.confirmed_rsvp_count
    capacity = event.capacity
    spots_left = None if capacity is None else max(0, capacity - registered)
    difficulty_label = _DIFFICULTY_LABEL.get(event.difficulty)
    return {
        # Identita
        "slug": event.slug,
        "title": event.title,
        "url": _absolute_event_url(event),
        # Termín + místo
        "date": _iso(event.starts_at),
        "endDate": _end_date_for_payload(event),
        "duration": _duration_days(event),
        "location": event.location_text or "",
        "difficulty": difficulty_label,
        # Registrace (dynamické)
        "state": _compute_state(event, now, registered),
        "capacity": capacity,
        "registered": registered,
        "spotsLeft": spots_left,
        "registrationOpensAt": _iso(event.registration_opens_at),
        "registrationClosesAt": _iso(event.registration_closes_at),
    }


def _cors_ok(response: HttpResponse) -> HttpResponse:
    response["Access-Control-Allow-Origin"] = "*"
    response["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    response["Access-Control-Allow-Headers"] = "Content-Type"
    return response


# Statuses publicly visible via API. Draft se nikdy neukáže; archived
# (deleted_at) obsluhuje samostatná 410 větev.
_PUBLIC_STATUSES = [
    Event.STATUS_PUBLISHED,
    Event.STATUS_COMPLETED,
    Event.STATUS_CLOSED,
    Event.STATUS_CANCELLED,
]


def _resolve_event(slug: str) -> tuple[Event | None, bool]:
    """Vrátí (event, is_archived). Archived = deleted_at set. Vracíme
    ho zvlášť, aby view rozlišil 404 od 410. Používáme `all_objects`
    manager (bez default filtru na deleted_at)."""
    qs = (
        Event.all_objects.filter(slug=slug, status__in=_PUBLIC_STATUSES)
        .select_related("workspace")
        .order_by("-starts_at")
    )
    event = qs.first()
    if event is None:
        return None, False
    return event, event.deleted_at is not None


@require_safe
@cache_control(public=True, max_age=60, s_maxage=60)
def public_event_status(request, slug: str) -> HttpResponse:
    """GET /api/public/events/{slug}"""
    event, archived = _resolve_event(slug)
    if event is None:
        return _cors_ok(
            JsonResponse({"error": "Event not found"}, status=404)
        )
    if archived:
        return _cors_ok(
            JsonResponse({"error": "Event archived"}, status=410)
        )
    now = timezone.now()
    return _cors_ok(JsonResponse(_serialize_event(event, now)))


@require_safe
@cache_control(public=True, max_age=60, s_maxage=60)
def public_events_batch(request) -> HttpResponse:
    """GET /api/public/events?slugs=a,b,c"""
    raw = (request.GET.get("slugs") or "").strip()
    slugs = [s.strip() for s in raw.split(",") if s.strip()]
    if not slugs:
        return _cors_ok(JsonResponse([], safe=False))
    slugs = slugs[:50]
    events = (
        Event.all_objects.filter(
            slug__in=slugs,
            status__in=_PUBLIC_STATUSES,
            deleted_at__isnull=True,
        )
        .select_related("workspace")
        .order_by("-starts_at")
    )
    by_slug: dict[str, Event] = {}
    for ev in events:
        if ev.slug not in by_slug:
            by_slug[ev.slug] = ev
    now = timezone.now()
    payload = [
        _serialize_event(by_slug[s], now) for s in slugs if s in by_slug
    ]
    return _cors_ok(JsonResponse(payload, safe=False))


def public_events_options(request) -> HttpResponse:
    """CORS preflight — prohlížeč před cross-origin fetchem posílá
    OPTIONS request. Django `require_safe` decorator nedovolí OPTIONS,
    proto tenhle dedikovaný handler."""
    return _cors_ok(HttpResponse(status=204))
