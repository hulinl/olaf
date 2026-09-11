"""Veřejné API pro externí konzumenty (olafadventures.cz, atd.)

Spec: docs/olaf-events-public-api-spec.md (repo hulinl/olafadventures-web).

Endpointy:
  GET /api/public/events/{slug}
  GET /api/public/events?slugs=a,b,c   (batch)

Chování:
- Bez autentikace, jen `published` (a doběhlé `completed`) eventy.
- CORS `Access-Control-Allow-Origin: *` — public read-only.
- Cache-Control 60 s, aby olaf.events neriskoval traffic spike z homepage
  refresh smyčky.
- State enum spočítá backend (viz `_compute_state`), aby všichni klienti
  měli jednu pravdu.

Pro V1 nemáme samostatné `registration_opens_at` / `_closes_at` pole;
vracíme null a state `planned` (=neotevřeno) nikdy nespadá. Kdyby to
někdo potřeboval, přidáme pole na Event model a vypočet doupravíme.
"""
from __future__ import annotations

from django.conf import settings
from django.http import Http404, HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.cache import cache_control
from django.views.decorators.http import require_safe

from .models import Event


def _absolute_event_url(event: Event) -> str:
    """Kanonická URL registrace na frontendu. Používáme
    `FRONTEND_URL` z env (v dev localhost, v prod olaf.events)."""
    base = getattr(settings, "FRONTEND_URL", "https://olaf.events").rstrip("/")
    return f"{base}/{event.workspace.slug}/e/{event.slug}"


def _compute_state(event: Event, now, registered: int) -> str:
    """Enum `state` per spec:

      planned  — reg neotevřena (nemáme pole, zůstává rezervovaný)
      open     — reg běží, jsou místa
      soldout  — plno, ale event ještě neproběhl
      running  — event právě běží
      ended    — event skončil / zrušen / archivován
    """
    if event.status in (Event.STATUS_CANCELLED, Event.STATUS_COMPLETED):
        return "ended"
    if now >= event.ends_at:
        return "ended"
    if now >= event.starts_at:
        return "running"
    if event.status == Event.STATUS_CLOSED:
        return "soldout"
    if event.capacity is not None and registered >= event.capacity:
        return "soldout"
    return "open"


def _serialize_event(event: Event, now) -> dict:
    """Payload dle spec. `registered` počítáme přes confirmed_rsvp_count
    property (STATUS_YES rows, exclude organizer)."""
    registered = event.confirmed_rsvp_count
    capacity = event.capacity
    spots_left = None if capacity is None else max(0, capacity - registered)
    return {
        "slug": event.slug,
        "state": _compute_state(event, now, registered),
        "capacity": capacity,
        "registered": registered,
        "spotsLeft": spots_left,
        # Registrace opens/closes zatím nemáme jako samostatné pole na
        # modelu — vracíme null, klient je respektuje (state `planned`
        # se nespočítá).
        "registrationOpensAt": None,
        "registrationClosesAt": None,
        "url": _absolute_event_url(event),
    }


def _cors_ok(response: HttpResponse) -> HttpResponse:
    """Explicit `Access-Control-Allow-Origin: *` header — bez tohoto
    projde `CorsMiddleware` jen requesty ze `CORS_ALLOWED_ORIGINS`
    whitelistu. Veřejné API má být přístupné odkudkoli."""
    response["Access-Control-Allow-Origin"] = "*"
    response["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    response["Access-Control-Allow-Headers"] = "Content-Type"
    return response


def _resolve_event(slug: str) -> Event | None:
    """Najde první published/completed event s tímto slug. Slug je
    unique per workspace, ne globálně — v edge case dvou workspacu se
    stejným slug vracíme deterministicky nejnovější (podle starts_at
    desc). Draft eventy neproniknou public API. Soft-deleted (via
    manager) taky ne."""
    qs = Event.objects.filter(
        slug=slug,
        status__in=[Event.STATUS_PUBLISHED, Event.STATUS_COMPLETED, Event.STATUS_CLOSED, Event.STATUS_CANCELLED],
    ).select_related("workspace").order_by("-starts_at")
    return qs.first()


@require_safe
@cache_control(public=True, max_age=60, s_maxage=60)
def public_event_status(request, slug: str) -> HttpResponse:
    """GET /api/public/events/{slug}"""
    event = _resolve_event(slug)
    if event is None:
        return _cors_ok(
            JsonResponse({"error": "Event not found"}, status=404)
        )
    if event.deleted_at is not None:
        return _cors_ok(
            JsonResponse({"error": "Event archived"}, status=410)
        )
    now = timezone.now()
    return _cors_ok(JsonResponse(_serialize_event(event, now)))


@require_safe
@cache_control(public=True, max_age=60, s_maxage=60)
def public_events_batch(request) -> HttpResponse:
    """GET /api/public/events?slugs=a,b,c

    Vrátí pole payloadů, silent skip pro neexistující/archivované
    sluggy. Klient pak drží mapping slug → payload podle vlastní logiky.
    """
    raw = (request.GET.get("slugs") or "").strip()
    slugs = [s.strip() for s in raw.split(",") if s.strip()]
    if not slugs:
        return _cors_ok(JsonResponse([], safe=False))
    # Cap na 50 slugs per request, aby útočník nesestavoval jeden
    # request se 100k slugs a nezavaloval DB.
    slugs = slugs[:50]
    events = (
        Event.objects.filter(
            slug__in=slugs,
            status__in=[
                Event.STATUS_PUBLISHED,
                Event.STATUS_COMPLETED,
                Event.STATUS_CLOSED,
                Event.STATUS_CANCELLED,
            ],
            deleted_at__isnull=True,
        )
        .select_related("workspace")
        .order_by("-starts_at")
    )
    # Když víc workspacu má stejný slug, vezmeme nejnovější (dedup přes
    # dict s prvním vítězem — order_by je desc).
    by_slug: dict[str, Event] = {}
    for ev in events:
        if ev.slug not in by_slug:
            by_slug[ev.slug] = ev
    now = timezone.now()
    # Zachováme pořadí, jak přišlo v query paramu.
    payload = [
        _serialize_event(by_slug[s], now) for s in slugs if s in by_slug
    ]
    return _cors_ok(JsonResponse(payload, safe=False))


def public_events_options(request) -> HttpResponse:
    """CORS preflight — prohlížeč před cross-origin fetchem posílá
    OPTIONS request. Django `require_safe` decorator nedovolí OPTIONS,
    proto tenhle dedikovaný handler."""
    return _cors_ok(HttpResponse(status=204))


# Ensure module import doesn't leave Http404 unused (keeps imports
# organized without a hidden ruff complaint).
_ = Http404
