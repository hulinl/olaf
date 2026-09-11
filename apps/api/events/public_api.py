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


def _absolute_media_url(url: str) -> str:
    """Absolute URL pro média — v dev je storage relativní (`/media/...`),
    v prod Azure Blob absolutní. External konzument potřebuje absolutní."""
    if not url:
        return ""
    if url.startswith(("http://", "https://")):
        return url
    base = getattr(settings, "FRONTEND_URL", "https://olaf.events").rstrip("/")
    return f"{base}{url}"


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


def _resolve_guides(event: Event) -> list[dict]:
    """Vede-li akci vybraný organizátor (přes organizers landing block),
    vrátíme ho externímu konzumentovi jako `{name, avatarImage}`.

    Reuse logika z `EventDetailSerializer.get_organizers_by_user_id`:
    z bloku typu `organizers` vezmeme `user_ids` v pořadí jak je
    asistentka seřadila; filtrujeme proti aktuálnímu organizer pool-u
    (workspace owner/admin sjednoceno s EventCollaborator) aby nezůstal viset
    zombie ID.
    """
    ids: list[int] = []
    seen: set[int] = set()
    for block in event.blocks or []:
        if not isinstance(block, dict) or block.get("type") != "organizers":
            continue
        for uid in (block.get("payload") or {}).get("user_ids") or []:
            if isinstance(uid, int) and uid not in seen:
                ids.append(uid)
                seen.add(uid)
    if not ids:
        return []

    from accounts.models import User
    from workspaces.models import WorkspaceMember

    from .models import EventCollaborator

    pool_ids: set[int] = set(
        WorkspaceMember.objects.filter(
            workspace=event.workspace,
            role__in=[
                WorkspaceMember.ROLE_OWNER,
                WorkspaceMember.ROLE_ADMIN,
            ],
        ).values_list("user_id", flat=True)
    )
    pool_ids.update(
        EventCollaborator.objects.filter(event=event).values_list(
            "user_id", flat=True
        )
    )
    ids = [uid for uid in ids if uid in pool_ids]
    if not ids:
        return []

    users_by_id = {u.id: u for u in User.objects.filter(id__in=ids)}
    guides: list[dict] = []
    for uid in ids:
        u = users_by_id.get(uid)
        if u is None:
            continue
        avatar_url = ""
        # Respect profile_show_avatar toggle — když si user schoval
        # avatar z veřejnosti, ani external web ho nedostane.
        if u.avatar and getattr(u, "profile_show_avatar", True):
            try:
                avatar_url = _absolute_media_url(u.avatar.url)
            except (ValueError, AttributeError):
                avatar_url = ""
        guides.append(
            {
                "name": u.get_full_name() or u.email,
                "avatarImage": avatar_url or None,
            }
        )
    return guides


def _serialize_event(event: Event, now) -> dict:
    """Payload dle spec v3 (2026-09-11 rozšíření o coverImage,
    description, price — nice-to-have pole aby externí konzumenti měli
    kompletní kartu bez druhého fetch)."""
    registered = event.confirmed_rsvp_count
    capacity = event.capacity
    spots_left = None if capacity is None else max(0, capacity - registered)
    difficulty_label = _DIFFICULTY_LABEL.get(event.difficulty)
    cover_url = ""
    if event.cover:
        try:
            cover_url = _absolute_media_url(event.cover.url)
        except (ValueError, AttributeError):
            cover_url = ""
    price = None
    if event.price_amount is not None:
        price = {
            "amount": str(event.price_amount),
            "currency": event.price_currency or "CZK",
            "note": event.price_note or "",
        }
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
        # v3 nice-to-have — externí web card bez druhého fetch
        "coverImage": cover_url or None,
        "description": event.description or "",
        "price": price,
        "guides": _resolve_guides(event),
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
    manager (bez default filtru na deleted_at).

    Slug alias fallback (2026-09-11): pokud přímý match selže,
    zkontrolujeme EventSlugAlias — externí konzumenti co drží starý
    slug (např. rozeslané odkazy) dostanou aktuální data místo 404.
    """
    from .models import EventSlugAlias

    event = (
        Event.all_objects.filter(slug=slug, status__in=_PUBLIC_STATUSES)
        .select_related("workspace")
        .order_by("-starts_at")
        .first()
    )
    if event is not None:
        return event, event.deleted_at is not None

    alias = (
        EventSlugAlias.objects.select_related(
            "event", "event__workspace"
        )
        .filter(old_slug=slug, event__status__in=_PUBLIC_STATUSES)
        .first()
    )
    if alias is None:
        return None, False
    ev = alias.event
    return ev, ev.deleted_at is not None


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


_LIST_LIMIT_DEFAULT = 50
_LIST_LIMIT_MAX = 200


def _parse_int(value: str | None, default: int, minimum: int, maximum: int) -> int:
    try:
        n = int(value) if value is not None else default
    except (TypeError, ValueError):
        n = default
    return max(minimum, min(maximum, n))


@require_safe
@cache_control(public=True, max_age=60, s_maxage=60)
def public_events_batch(request) -> HttpResponse:
    """Hybrid endpoint (spec v3, 2026-09-11):

      GET /api/public/events?slugs=a,b,c
        → batch by slug (existing v1 chování, silent skip pro
          neexistující sluggy, cap 50).

      GET /api/public/events?upcoming=true&limit=50&offset=0
        → list všech publikovaných akcí (nový v3 mód). Bez `slugs=`
          param se aktivuje. `upcoming=true` filtruje state != 'ended'
          (draft/archived se nikdy neukazují). `limit` 1-200 (default
          50), `offset` >= 0.

    Draft nikdy neukazujeme; archived (deleted_at) jsou skipnuté i v
    list módu.
    """
    now = timezone.now()

    # --- Batch mód (slugs= je set) --------------------------------
    raw_slugs = (request.GET.get("slugs") or "").strip()
    if raw_slugs:
        slugs = [s.strip() for s in raw_slugs.split(",") if s.strip()][:50]
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
        payload = [
            _serialize_event(by_slug[s], now) for s in slugs if s in by_slug
        ]
        return _cors_ok(JsonResponse(payload, safe=False))

    # --- List mód (slugs není set) --------------------------------
    upcoming_flag = (request.GET.get("upcoming") or "").lower() in (
        "true",
        "1",
        "yes",
    )
    limit = _parse_int(
        request.GET.get("limit"),
        default=_LIST_LIMIT_DEFAULT,
        minimum=1,
        maximum=_LIST_LIMIT_MAX,
    )
    offset = _parse_int(
        request.GET.get("offset"), default=0, minimum=0, maximum=100000
    )

    qs = (
        Event.all_objects.filter(
            status__in=_PUBLIC_STATUSES,
            deleted_at__isnull=True,
        )
        .select_related("workspace")
    )
    if upcoming_flag:
        # Upcoming = ends_at v budoucnu + status není completed/cancelled.
        # Odpovídá state != 'ended' logice v `_compute_state`.
        qs = qs.filter(ends_at__gt=now).exclude(
            status__in=[Event.STATUS_COMPLETED, Event.STATUS_CANCELLED]
        )
        # Pro upcoming je přirozené řazení chronologické — nejbližší
        # akce první.
        qs = qs.order_by("starts_at")
    else:
        qs = qs.order_by("-starts_at")

    events = list(qs[offset : offset + limit])
    payload = [_serialize_event(ev, now) for ev in events]
    return _cors_ok(JsonResponse(payload, safe=False))


def public_events_options(request) -> HttpResponse:
    """CORS preflight — prohlížeč před cross-origin fetchem posílá
    OPTIONS request. Django `require_safe` decorator nedovolí OPTIONS,
    proto tenhle dedikovaný handler."""
    return _cors_ok(HttpResponse(status=204))
