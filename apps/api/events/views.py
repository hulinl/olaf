"""Event + RSVP views."""
from __future__ import annotations

import contextlib
import secrets

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from accounts.models import User
from communities.models import Community
from workspaces.models import Workspace

from .models import RSVP, Event, EventImage
from .permissions import can_manage_event, is_workspace_owner
from .serializers import (
    EventImageSerializer,
    EventPublicSerializer,
    EventSummarySerializer,
    EventWriteSerializer,
    MyRSVPSerializer,
    RSVPCreateSerializer,
    RSVPSerializer,
)
from .tasks import (
    fan_out_event_cancellation_task,
    send_rsvp_confirmation_task,
)


def _load_published_event(workspace_slug: str, event_slug: str):
    """Return the event if it's reachable under this workspace slug.

    Events live in one primary workspace but can be shared into many
    others (Event.shared_workspaces m2m). The URL /<slug>/e/<event>/
    must work for either path — otherwise clicking an event from a
    community that shares it produces a confused 404. We match by
    primary workspace OR shared, falling back to the event's primary
    workspace URL when only the shared path was requested."""
    from django.db.models import Q as DQ

    return (
        Event.objects.select_related("workspace")
        .filter(slug=event_slug)
        .filter(
            DQ(workspace__slug=workspace_slug)
            | DQ(shared_workspaces__slug=workspace_slug)
        )
        .first()
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def public_event(request: Request, workspace_slug: str, event_slug: str) -> Response:
    """Public event landing-page data (PRD §4.5)."""
    event = _load_published_event(workspace_slug, event_slug)
    if event is None:
        return Response(
            {"detail": "Event not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    # Draft events show a friendly placeholder to non-owners instead of
    # 404 — the owner shares the URL with collaborators / participants
    # before flipping to published, and seeing "not found" was confusing
    # enough that people kept asking "did you delete it?" Owners still
    # see the full landing in preview mode.
    if event.status == Event.STATUS_DRAFT and not can_manage_event(
        request.user, event
    ):
        return Response(
            {
                "is_draft_preview": True,
                "title": event.title,
                "workspace_name": event.workspace.name,
                "workspace_slug": event.workspace.slug,
                "workspace_logo_url": (
                    event.workspace.logo.url
                    if event.workspace.logo
                    else None
                ),
            },
            status=status.HTTP_200_OK,
        )

    serializer = EventPublicSerializer(event, context={"request": request})
    payload = serializer.data

    # If the requester is authenticated and has an RSVP, include it.
    if request.user.is_authenticated:
        my_rsvp = (
            RSVP.objects.filter(event=event, user=request.user).first()
        )
        payload["my_rsvp"] = (
            MyRSVPSerializer(my_rsvp).data if my_rsvp else None
        )
        payload["i_am_owner"] = can_manage_event(request.user, event)
    else:
        payload["i_am_owner"] = False

    return Response(payload)


class _ExistingVerifiedUser(Exception):
    """Raised když anon RSVP odkazuje na e-mail, který patří plnohodnotnému
    (verified) accountu. Předtím se v tomhle případě accountu zalogoval
    pod RSVP-em — což znamenalo, že kdokoli znalý cizího mailu mohl
    submitnout RSVP formulář a dostat se do session toho usera. Teď to
    odmítáme a frontend ukáže "Tenhle e-mail už má účet, přihlas se."
    """


def _create_light_user(account_payload: dict) -> User | None:
    """Najít nebo vytvořit guest usera pro public RSVP flow.

    Předtím tahle funkce dělala dvě věci: vytvářela auto-verified usera
    s random heslem A registrovala ho do session přes `login()` ve view.
    User pak po submitu RSVP formuláře skončil v aplikaci jako přihlášený,
    což zaskočilo všechny, kteří si chtěli jen RSVPnout a aplikaci
    používat zatím nehodlali.

    Po refaktoru: guest user je `email_verified=False` s unusable
    password. Žádný auto-login. Pokud si user později vytvoří účet
    (signup s tím samým e-mailem), endpoint signup detekuje existující
    unverified row a převezme ho — nastaví heslo, pošle ověřovací mail,
    a všechna jeho předchozí RSVPs (přivázaná FK na User row) zůstávají
    nadále jeho.

    Vrací `None` když chybí povinná pole. Hází `_ExistingVerifiedUser`
    když email patří verified accountu — anon submitter nesmí přepsat
    cizí session.
    """
    email = (account_payload.get("email") or "").strip().lower()
    first_name = (account_payload.get("first_name") or "").strip()
    last_name = (account_payload.get("last_name") or "").strip()
    phone = (account_payload.get("phone") or "").strip()

    if not (email and first_name and last_name):
        return None

    try:
        existing = User.objects.get(email=email)
    except User.DoesNotExist:
        existing = None

    if existing is not None:
        if existing.email_verified:
            raise _ExistingVerifiedUser()
        # Reuse unverified ("guest") row. Doplň prázdná pole — uživatel
        # mohl uvést telefon u druhé akce, který nezadal u první.
        updates: list[str] = []
        if phone and not existing.phone:
            existing.phone = phone
            updates.append("phone")
        if first_name and not existing.first_name:
            existing.first_name = first_name
            updates.append("first_name")
        if last_name and not existing.last_name:
            existing.last_name = last_name
            updates.append("last_name")
        if updates:
            existing.save(update_fields=updates)
        return existing

    user = User.objects.create(
        email=email,
        first_name=first_name,
        last_name=last_name,
        phone=phone,
        email_verified=False,
    )
    # Unusable password = login se nepovede dokud user nepřejde přes
    # signup nebo reset-password flow.
    user.set_unusable_password()
    user.save(update_fields=["password"])
    return user


@api_view(["POST"])
@permission_classes([AllowAny])
def rsvp_event(request: Request, workspace_slug: str, event_slug: str) -> Response:
    """Public RSVP submission (PRD §4.6)."""
    event = _load_published_event(workspace_slug, event_slug)
    if event is None:
        return Response(
            {"detail": "Event not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if not event.is_open_for_rsvp:
        return Response(
            {
                "detail": (
                    "This event is not currently accepting registrations."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer = RSVPCreateSerializer(
        data=request.data,
        context={"event_sections": event.effective_questionnaire_sections},
    )
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    user = request.user if request.user.is_authenticated else None
    if user is None:
        account = data.get("account") or {}
        try:
            user = _create_light_user(account)
        except _ExistingVerifiedUser:
            # Frontend ten kód detekuje a ukáže "Tento e-mail už má účet,
            # přihlas se" link. Nezakládáme cizímu uživateli session ani
            # nezavoláme jakoukoli akci, která by jeho data změnila.
            return Response(
                {
                    "account": {
                        "email": (
                            "Tento e-mail už má účet. Přihlas se, prosím."
                        ),
                    },
                    "code": "email_has_account",
                },
                status=status.HTTP_409_CONFLICT,
            )
        if user is None:
            return Response(
                {
                    "account": (
                        "Email, first_name, and last_name are required when "
                        "registering without an account."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Žádný auto-login — guest RSVP zůstává guest. Pokud chce user
        # spravovat svoje registrace, projde signup flow s tím samým
        # e-mailem.

    try:
        rsvp = RSVP.create_for_event(
            event=event,
            user=user,
            questionnaire_answers=data["answers"],
        )
    except DjangoValidationError as e:
        return Response(
            {"detail": e.messages[0] if e.messages else str(e)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Fire-and-forget confirmation email. Slight race vs. DB commit is fine:
    # the Celery broker latency is longer than the request commit.
    send_rsvp_confirmation_task.delay(rsvp.pk)

    return Response(
        MyRSVPSerializer(rsvp).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancel_my_rsvp(request: Request, workspace_slug: str, event_slug: str) -> Response:
    event = _load_published_event(workspace_slug, event_slug)
    if event is None:
        return Response(status=status.HTTP_404_NOT_FOUND)

    try:
        rsvp = RSVP.objects.get(event=event, user=request.user)
    except RSVP.DoesNotExist:
        return Response(
            {"detail": "You have no RSVP for this event."},
            status=status.HTTP_404_NOT_FOUND,
        )

    rsvp.cancel()

    from audit.models import AuditLog
    from audit.services import log as audit_log

    audit_log(
        actor=request.user,
        action=AuditLog.ACTION_RSVP_CANCEL,
        workspace=event.workspace,
        target_type="rsvp",
        target_id=rsvp.pk,
        summary=f"Zrušil přihlášku na akci „{event.title}”.",
    )
    return Response(MyRSVPSerializer(rsvp).data)


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def cancel_rsvp_by_token(request: Request) -> Response:
    """Magic-link cancel pro guest RSVP.

    Anon registranti nemají session — confirmation e-mail proto obsahuje
    odkaz `…/rsvp/cancel?token=<UUID>` který směřuje na frontend page;
    page volá tenhle endpoint a vrátí status. GET = jen vrátí info o
    RSVP (event title, status), aby se page mohla zeptat na potvrzení;
    POST = sám cancel + audit zápis (`removed_by_self_via_token`).
    Idempotentní — opakovaný POST už-cancelled RSVP vrátí 200.

    Token nese plnou autoritu cancel-u na ten konkrétní RSVP — proto
    UUID v4 (122 bits entropy) místo nějakého kratšího hash-e.
    """
    token = (request.query_params.get("token") or request.data.get("token") or "").strip()
    if not token:
        return Response(
            {"detail": "Missing token."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        rsvp = RSVP.objects.select_related("event", "event__workspace", "user").get(
            cancel_token=token
        )
    except (RSVP.DoesNotExist, DjangoValidationError, ValueError):
        # ValueError padá pro malformed UUID; DoesNotExist pro neznámý.
        # Oba mappnem na 404 — nesplývají info "token existuje vs. ne",
        # což omezuje value bruteforce-em za nulu.
        return Response(
            {"detail": "Invalid token."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if request.method == "GET":
        return Response(
            {
                "event_title": rsvp.event.title,
                "event_starts_at": rsvp.event.starts_at.isoformat(),
                "workspace_name": rsvp.event.workspace.name,
                "status": rsvp.status,
                "user_name": rsvp.user.get_full_name() if rsvp.user else "",
            }
        )

    # POST → cancel + audit (idempotentní).
    if rsvp.status != RSVP.STATUS_CANCELLED:
        rsvp.cancel()

        from audit.models import AuditLog
        from audit.services import log as audit_log

        audit_log(
            actor=rsvp.user,
            action=AuditLog.ACTION_RSVP_CANCEL,
            workspace=rsvp.event.workspace,
            target_type="rsvp",
            target_id=rsvp.pk,
            summary=(
                f'Zrušil registraci na akci „{rsvp.event.title}” '
                f'přes magic-link z e-mailu.'
            ),
            payload={"event_slug": rsvp.event.slug, "via_token": True},
        )

    return Response({"status": rsvp.status})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_events(request: Request) -> Response:
    """Events the current user is RSVP-ed to (any non-cancelled status).
    Soft-deleted events are hidden — the owner's Trash decision needs
    to be respected on the participant dashboard too."""
    rsvps = (
        RSVP.objects.filter(user=request.user)
        .exclude(status=RSVP.STATUS_CANCELLED)
        .filter(event__deleted_at__isnull=True)
        .select_related("event", "event__workspace")
        .order_by("event__starts_at")
    )
    serializer = EventSummarySerializer([r.event for r in rsvps], many=True)
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def owner_events(request: Request) -> Response:
    """Events the current user manages — workspace owner/admin scope,
    plus events where they're an explicit EventCollaborator (co-creator)."""
    from django.db.models import Q

    from .models import EventCollaborator

    managed_ws_ids = list(
        Workspace.objects.filter(
            members__user=request.user,
            members__role__in=["owner", "admin"],
        )
        .values_list("id", flat=True)
        .distinct()
    )
    collab_event_ids = list(
        EventCollaborator.objects.filter(user=request.user)
        .values_list("event_id", flat=True)
        .distinct()
    )
    events = (
        Event.objects.filter(
            Q(workspace_id__in=managed_ws_ids) | Q(id__in=collab_event_ids)
        )
        .select_related("workspace")
        .order_by("-starts_at")
        .distinct()
    )
    serializer = EventSummarySerializer(events, many=True)
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def ingest_event_from_source(request: Request) -> Response:
    """Extract a draft Event payload from a Notion URL.

    Uses the calling user's stored Notion + Anthropic credentials
    (see /api/auth/me/integrations/). Returns the parsed draft so
    the frontend can mount it in the standard event-create form for
    the owner to review + edit before persisting — we never auto-
    save, AI extracts are fallible.

    Errors map to:
      400 — bad URL, integration missing on this account, page
            invisible to the integration, page empty, LLM didn't
            return JSON.
      502 — upstream Notion or Anthropic API failure (transient).
    """
    from accounts.integrations import safe_decrypt_token

    from .notion_ingest import IngestError, ingest_event_from_notion_url

    url = (request.data.get("url") or "").strip()
    if not url:
        return Response(
            {"url": "URL je povinná."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    notion_token = safe_decrypt_token(
        request.user.notion_integration_token_encrypted
    )
    anthropic_key = safe_decrypt_token(
        request.user.anthropic_api_key_encrypted
    )
    if not notion_token:
        return Response(
            {
                "detail": (
                    "Nemáš připojený Notion. Otevři /settings/integrace "
                    "a vlož svůj Notion integration token."
                ),
                "missing": "notion",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not anthropic_key:
        return Response(
            {
                "detail": (
                    "Nemáš připojený Anthropic API key. Otevři "
                    "/settings/integrace a vlož svůj klíč."
                ),
                "missing": "anthropic",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        draft = ingest_event_from_notion_url(url, notion_token, anthropic_key)
    except IngestError as e:
        return Response(
            {"detail": str(e)},
            status=e.status_code,
        )
    return Response(draft)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_event(request: Request, workspace_slug: str) -> Response:
    """Owner-only create. The workspace is identified by URL slug."""
    from workspaces.models import Workspace

    try:
        workspace = Workspace.objects.get(slug=workspace_slug)
    except Workspace.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not is_workspace_owner(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    serializer = EventWriteSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    # Reject slug collision within workspace explicitly (nicer than IntegrityError).
    if Event.objects.filter(
        workspace=workspace, slug=serializer.validated_data["slug"]
    ).exists():
        return Response(
            {"slug": "Event s tímto slug už ve workspace existuje."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    community_slugs = serializer.validated_data.pop("community_slugs", None)
    shared_workspace_slugs = serializer.validated_data.pop(
        "shared_workspace_slugs", None
    )
    event = serializer.save(workspace=workspace)
    if community_slugs is not None:
        _set_event_communities(event, community_slugs)
    if shared_workspace_slugs is not None:
        _set_event_shared_workspaces(
            event, shared_workspace_slugs, requesting_user=request.user
        )

    from audit.models import AuditLog
    from audit.services import log as audit_log

    audit_log(
        actor=request.user,
        action=AuditLog.ACTION_EVENT_CREATE,
        workspace=workspace,
        target_type="event",
        target_id=event.pk,
        summary=f'Vytvořil akci „{event.title}”',
        payload={"event_slug": event.slug, "status": event.status},
    )

    return Response(
        EventPublicSerializer(event, context={"request": request}).data,
        status=status.HTTP_201_CREATED,
    )


def _set_event_communities(event: Event, community_slugs: list[str]) -> None:
    """Set the event's communities m2m to exactly the matching communities
    in the event's workspace. Silently drops slugs that don't match a
    community in this workspace (UI is the right place to surface that)."""
    if not community_slugs:
        event.communities.clear()
        return
    matches = Community.objects.filter(
        workspace=event.workspace, slug__in=community_slugs
    )
    event.communities.set(matches)


def _set_event_shared_workspaces(
    event: Event, workspace_slugs: list[str], *, requesting_user
) -> None:
    """Replace shared_workspaces with the given slugs, but only attach
    workspaces the requesting user actually owns. The primary owner
    workspace (event.workspace) is never added here — it's already the
    canonical owner via the FK."""
    from workspaces.models import Workspace, WorkspaceMember

    if not workspace_slugs:
        event.shared_workspaces.clear()
        return

    owned_slugs = set(
        WorkspaceMember.objects.filter(
            user=requesting_user,
            role=WorkspaceMember.ROLE_OWNER,
        ).values_list("workspace__slug", flat=True)
    )
    target_slugs = [
        s for s in workspace_slugs
        if s in owned_slugs and s != event.workspace.slug
    ]
    matches = Workspace.objects.filter(slug__in=target_slugs)
    event.shared_workspaces.set(matches)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_event(request: Request, workspace_slug: str, event_slug: str) -> Response:
    """Owner-only update."""
    try:
        event = Event.objects.select_related("workspace").get(
            workspace__slug=workspace_slug, slug=event_slug
        )
    except Event.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not can_manage_event(request.user, event):
        return Response(status=status.HTTP_403_FORBIDDEN)

    serializer = EventWriteSerializer(event, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)

    new_slug = serializer.validated_data.get("slug")
    if (
        new_slug
        and new_slug != event.slug
        and Event.objects.filter(workspace=event.workspace, slug=new_slug)
        .exclude(pk=event.pk)
        .exists()
    ):
        return Response(
            {"slug": "Event s tímto slug už ve workspace existuje."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    has_communities = "community_slugs" in serializer.validated_data
    community_slugs = serializer.validated_data.pop("community_slugs", None)
    has_shared = "shared_workspace_slugs" in serializer.validated_data
    shared_workspace_slugs = serializer.validated_data.pop(
        "shared_workspace_slugs", None
    )

    # Snapshot participant-visible fields BEFORE save so we can
    # diff against the post-save state and fan out a bell-feed
    # notification per active RSVPed user.
    from .notifications import (
        diff_changed_fields,
        notify_event_updated,
        snapshot_event_for_diff,
    )

    before = snapshot_event_for_diff(event)
    event = serializer.save()

    # Sync `event.location_url` <-> Map block's `map_url`. Existují
    # dvě surface, kde owner zadává URL mapy (Detaily form +
    # `/edit/obsah` Map block). User je chtěl propisovat oběma směry:
    # editace na jednom místě se má objevit i na druhém. Detaily PATCH
    # nese `location_url` ale nikoli `blocks`; Obsah PATCH naopak nese
    # `blocks` ale nikoli `location_url`. Tady to spojíme:
    #
    # - Detaily save → projdi `event.blocks`, přepiš `map_url` ve všech
    #   Map blocích na novou hodnotu `event.location_url`.
    # - Obsah save → vezmi `map_url` z prvního Map blocku (pokud existuje)
    #   a propiš ho do `event.location_url`.
    location_url_in = "location_url" in serializer.validated_data
    blocks_in = "blocks" in serializer.validated_data
    if location_url_in and event.blocks:
        new_url = event.location_url or ""
        updated_blocks = False
        for block in event.blocks:
            if block.get("type") == "map":
                payload = block.get("payload") or {}
                if payload.get("map_url") != new_url and new_url:
                    payload["map_url"] = new_url
                    block["payload"] = payload
                    updated_blocks = True
        if updated_blocks:
            event.save(update_fields=["blocks", "updated_at"])
    elif blocks_in:
        first_map = next(
            (b for b in (event.blocks or []) if b.get("type") == "map"),
            None,
        )
        if first_map:
            map_url = (first_map.get("payload") or {}).get("map_url") or ""
            if map_url and map_url != event.location_url:
                event.location_url = map_url[:500]  # URLField max_length
                event.save(update_fields=["location_url", "updated_at"])

    after = snapshot_event_for_diff(event)
    changed = diff_changed_fields(before, after)

    if has_communities:
        _set_event_communities(event, community_slugs or [])
    if has_shared:
        _set_event_shared_workspaces(
            event, shared_workspace_slugs or [], requesting_user=request.user
        )

    # Best-effort: notification fan-out runs after the structural
    # save so a failure here (e.g. the DB hiccupping on bulk_create)
    # doesn't unwind the event update itself.
    with contextlib.suppress(Exception):
        notify_event_updated(event, changed, actor=request.user)

    if changed:
        from audit.models import AuditLog
        from audit.services import log as audit_log

        audit_log(
            actor=request.user,
            action=AuditLog.ACTION_EVENT_UPDATE,
            workspace=event.workspace,
            target_type="event",
            target_id=event.pk,
            summary=(
                f'Upravil akci „{event.title}” — '
                f'{", ".join(changed)}'
            ),
            payload={"event_slug": event.slug, "changed_fields": changed},
        )

    return Response(EventPublicSerializer(event, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def duplicate_event(
    request: Request, workspace_slug: str, event_slug: str
) -> Response:
    """Owner-only: clone an event into a new Draft. Useful for recurring
    events ("we run 20 výběhů a year, mostly the same") — see PRD §4.5
    Templates (V1.5).

    New event:
    - title = `{title} (kopie)`
    - slug = `{slug}-kopie[-N]` (unique within workspace)
    - status = draft
    - cancellation_reason = "" (start clean)
    - cover file is duplicated, not referenced
    - dates, location, content blocks, questionnaire sections — all copied
    - operational config (price, gear, risks, required docs, owner
      checklist) — copied so the new draft is workable, not empty
    - RSVPs, gallery images, co-creators — NOT copied
    """
    from django.core.files.base import ContentFile

    try:
        event = Event.objects.select_related("workspace").get(
            workspace__slug=workspace_slug, slug=event_slug
        )
    except Event.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not can_manage_event(request.user, event):
        return Response(status=status.HTTP_403_FORBIDDEN)

    base = f"{event.slug}-kopie"
    new_slug = base
    n = 2
    while Event.objects.filter(workspace=event.workspace, slug=new_slug).exists():
        new_slug = f"{base}-{n}"
        n += 1

    copy = Event.objects.create(
        workspace=event.workspace,
        slug=new_slug,
        title=f"{event.title} (kopie)",
        description=event.description,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        tz=event.tz,
        location_text=event.location_text,
        meeting_point_text=event.meeting_point_text,
        location_url=event.location_url,
        capacity=event.capacity,
        waitlist_enabled=event.waitlist_enabled,
        visibility=event.visibility,
        status=Event.STATUS_DRAFT,
        requires_approval=event.requires_approval,
        cancellation_reason="",
        blocks=list(event.blocks or []),
        enabled_questionnaire_sections=list(
            event.enabled_questionnaire_sections or []
        ),
        price_amount=event.price_amount,
        price_currency=event.price_currency,
        price_note=event.price_note,
        payment_in_cash=event.payment_in_cash,
        billing_profile=event.billing_profile,
        recommended_gear_list=event.recommended_gear_list,
        # JSONFields — copy the value, not the reference, so editing
        # one event's list can't mutate the other's.
        risk_checklist=[dict(r) for r in (event.risk_checklist or [])],
        required_documents=[dict(d) for d in (event.required_documents or [])],
    )

    # Owner's checklist items copy too — that's the bulk of the
    # setup work, and the whole point of duplication is to skip it.
    from .models import EventChecklistItem

    bulk: list[EventChecklistItem] = []
    for item in event.checklist_items.all():
        bulk.append(
            EventChecklistItem(
                event=copy,
                title=item.title,
                description=item.description,
                category=item.category,
                done=False,
                sort_order=item.sort_order,
                remind_audience=item.remind_audience,
            )
        )
    if bulk:
        EventChecklistItem.objects.bulk_create(bulk)

    # Reset risk checklist statuses — the new event hasn't been
    # prepped yet, but the labels/categories/notes are still useful.
    if copy.risk_checklist:
        for item in copy.risk_checklist:
            item["status"] = "open"
        copy.save(update_fields=["risk_checklist"])

    # Duplicate the cover so deleting one doesn't strip the other.
    if event.cover:
        try:
            event.cover.open("rb")
            content = event.cover.read()
            filename = event.cover.name.rsplit("/", 1)[-1]
            copy.cover.save(filename, ContentFile(content), save=True)
        finally:
            event.cover.close()

    return Response(
        EventPublicSerializer(copy).data,
        status=status.HTTP_201_CREATED,
    )


GALLERY_MAX_IMAGES = 20
# Modern phone photos commonly land in the 4-10 MB range — 5 MB was rejecting
# typical uploads. Bumped to 20 MB v 06/2026 — iPhone 16 ProRAW + HEIC full-
# res atakují 15+ MB a typický owner po campu sype celou kolekci. Server-side
# downscale + JPEG re-encode v downscale_upload sníží disk footprint zpátky
# na sub-MB hodnoty, takže větší vstup nezdraží storage.
GALLERY_MAX_BYTES = 20 * 1024 * 1024


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
@parser_classes([MultiPartParser, FormParser])
def event_images(
    request: Request, workspace_slug: str, event_slug: str
) -> Response:
    """List (public) + upload (owner) of gallery images for an event."""
    try:
        event = Event.objects.select_related("workspace").get(
            workspace__slug=workspace_slug, slug=event_slug
        )
    except Event.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        qs = event.images.all()
        return Response(EventImageSerializer(qs, many=True).data)

    # POST — gallery upload. Předtím to gateoval `is_workspace_owner`,
    # což ale vyloučí EventCollaborators (co-creators) → 403 i pro
    # legitimní spolutvůrce. Sjednoceno s ostatními event-management
    # endpointy které používají `can_manage_event` (workspace
    # owner/admin OR explicit collaborator).
    if not request.user.is_authenticated or not can_manage_event(
        request.user, event
    ):
        return Response(status=status.HTTP_403_FORBIDDEN)

    upload = request.FILES.get("image")
    if not upload:
        return Response(
            {"image": "Soubor je povinný."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if upload.size > GALLERY_MAX_BYTES:
        mb = GALLERY_MAX_BYTES // (1024 * 1024)
        return Response(
            {"detail": f"Obrázek je moc velký — maximum je {mb} MB."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if event.images.count() >= GALLERY_MAX_IMAGES:
        return Response(
            {"detail": f"Maximum je {GALLERY_MAX_IMAGES} obrázků v galerii."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    next_order = (
        event.images.order_by("-sort_order").values_list("sort_order", flat=True).first()
        or 0
    ) + 1
    # Phones upload 3-5 MB JPEGs at 4000+ px; an event landing with
    # 20 of those is multiple megabytes per pageview. Downscale to
    # 1600px on the long side + re-encode JPEG at quality 82 before
    # we persist, keeping the original aspect ratio. Result: 200-400
    # KB per image, fast load on 4G + PWA.
    from .image_utils import UnsupportedImageError

    try:
        processed = _downscale_upload(upload)
    except UnsupportedImageError as exc:
        return Response(
            {"image": str(exc)},
            status=status.HTTP_400_BAD_REQUEST,
        )
    img = EventImage.objects.create(
        event=event,
        image=processed,
        alt_text=request.data.get("alt_text", "") or "",
        sort_order=next_order,
    )
    return Response(
        EventImageSerializer(img).data,
        status=status.HTTP_201_CREATED,
    )


def _downscale_upload(upload):
    """Backward-compat shim — keep call sites working while the shared
    helper migrates. Delegates to events.image_utils."""
    from .image_utils import downscale_upload

    return downscale_upload(upload)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def event_image_detail(
    request: Request, workspace_slug: str, event_slug: str, image_id: int
) -> Response:
    """Owner-only delete of a single gallery image."""
    try:
        img = EventImage.objects.select_related("event__workspace").get(
            event__workspace__slug=workspace_slug,
            event__slug=event_slug,
            pk=image_id,
        )
    except EventImage.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not can_manage_event(request.user, img.event):
        return Response(status=status.HTTP_403_FORBIDDEN)

    img.image.delete(save=False)
    img.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def event_block_image_upload(
    request: Request, workspace_slug: str, event_slug: str
) -> Response:
    """Upload an image referenced from inside a block payload (hero cover,
    prose image, day image, …).

    Unlike `event_images`, this does NOT create an EventImage row. The file
    lands in media/events/blocks/<event-id>/ and the URL goes straight into
    the block JSON. Keeps the public gallery (event.images) from listing
    every cover photo someone uploaded for a hero block.
    """
    try:
        event = Event.objects.select_related("workspace").get(
            workspace__slug=workspace_slug, slug=event_slug
        )
    except Event.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not can_manage_event(request.user, event):
        return Response(status=status.HTTP_403_FORBIDDEN)

    upload = request.FILES.get("image")
    if not upload:
        return Response(
            {"detail": "Soubor je povinný."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if upload.size > GALLERY_MAX_BYTES:
        mb = GALLERY_MAX_BYTES // (1024 * 1024)
        return Response(
            {"detail": f"Obrázek je moc velký — maximum je {mb} MB."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    from django.core.files.storage import default_storage

    # Pass through the same downscale + EXIF-rotation pipeline as the
    # gallery uploads. Předtím se file ukládal as-is → 4000+ px iPhone
    # JPEGy zpomalovaly landing + portrait fotky byly naležato.
    from .image_utils import UnsupportedImageError, downscale_upload

    try:
        processed = downscale_upload(upload)
    except UnsupportedImageError as exc:
        return Response(
            {"detail": str(exc)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # downscale vždycky vrací JPEG (raise → fallback výš).
    name = f"events/blocks/{event.pk}/{secrets.token_urlsafe(12)}.jpg"
    saved_path = default_storage.save(name, processed)
    return Response(
        {"url": default_storage.url(saved_path)},
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def event_images_reorder(
    request: Request, workspace_slug: str, event_slug: str
) -> Response:
    """Owner-only reorder. Body: {"order": [3, 1, 2]} — ids in desired order."""
    try:
        event = Event.objects.select_related("workspace").get(
            workspace__slug=workspace_slug, slug=event_slug
        )
    except Event.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not can_manage_event(request.user, event):
        return Response(status=status.HTTP_403_FORBIDDEN)

    order = request.data.get("order")
    if not isinstance(order, list) or not all(isinstance(x, int) for x in order):
        return Response(
            {"order": "Očekávaný seznam celých čísel (ids)."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    existing_ids = set(event.images.values_list("id", flat=True))
    if set(order) != existing_ids:
        return Response(
            {"order": "Seznam musí obsahovat přesně všechna id obrázků akce."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    for new_pos, img_id in enumerate(order, start=1):
        EventImage.objects.filter(pk=img_id).update(sort_order=new_pos)

    qs = event.images.all()
    return Response(EventImageSerializer(qs, many=True).data)


@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def event_cover(
    request: Request, workspace_slug: str, event_slug: str
) -> Response:
    """Owner-only cover image upload/clear. POST multipart `cover`; DELETE clears."""
    try:
        event = Event.objects.select_related("workspace").get(
            workspace__slug=workspace_slug, slug=event_slug
        )
    except Event.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not can_manage_event(request.user, event):
        return Response(status=status.HTTP_403_FORBIDDEN)

    if request.method == "DELETE":
        if event.cover:
            event.cover.delete(save=False)
        event.cover = None
        event.save(update_fields=["cover", "updated_at"])
        return Response(EventPublicSerializer(event, context={"request": request}).data)

    upload = request.FILES.get("cover")
    if not upload:
        return Response(
            {"cover": "Soubor je povinný."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    max_bytes = 8 * 1024 * 1024
    if upload.size > max_bytes:
        return Response(
            {"cover": "Maximální velikost je 8 MB."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Same downscale + JPEG re-encode pipeline as the gallery uploads —
    # owners drop iPhone-original 4000+ px JPEGs in here and the public
    # landing pays the load-time cost on every visit otherwise.
    from .image_utils import UnsupportedImageError, downscale_upload

    try:
        processed = downscale_upload(upload)
    except UnsupportedImageError as exc:
        return Response(
            {"cover": str(exc)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if event.cover:
        event.cover.delete(save=False)
    event.cover = processed
    event.save(update_fields=["cover", "updated_at"])
    return Response(EventPublicSerializer(event, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancel_event(
    request: Request, workspace_slug: str, event_slug: str
) -> Response:
    """Owner-only cancel. Fan-outs cancellation email to active RSVPs."""
    try:
        event = Event.objects.select_related("workspace").get(
            workspace__slug=workspace_slug, slug=event_slug
        )
    except Event.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not can_manage_event(request.user, event):
        return Response(status=status.HTTP_403_FORBIDDEN)

    if event.status == Event.STATUS_CANCELLED:
        return Response(EventPublicSerializer(event, context={"request": request}).data)

    reason = (request.data.get("reason") or "").strip()
    event.status = Event.STATUS_CANCELLED
    event.cancellation_reason = reason
    event.save(update_fields=["status", "cancellation_reason", "updated_at"])

    from audit.models import AuditLog
    from audit.services import log as audit_log

    audit_log(
        actor=request.user,
        action=AuditLog.ACTION_EVENT_CANCEL,
        workspace=event.workspace,
        target_type="event",
        target_id=event.pk,
        summary=f'Zrušil akci „{event.title}”',
        payload={"event_slug": event.slug, "reason": reason},
    )

    fan_out_event_cancellation_task.delay(event.pk, reason)
    return Response(EventPublicSerializer(event, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def soft_delete_event(
    request: Request, workspace_slug: str, event_slug: str
) -> Response:
    """Owner soft-deletes an event. Row is hidden from the default
    manager (so all public + admin lists stop showing it) but kept in
    the DB for 30 days so it can be restored from the Trash. After
    30 days the `events.purge_old_soft_deletes` Celery task hard-
    deletes it."""
    try:
        event = Event.all_objects.select_related("workspace").get(
            workspace__slug=workspace_slug, slug=event_slug
        )
    except Event.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not can_manage_event(request.user, event):
        return Response(status=status.HTTP_403_FORBIDDEN)
    already_deleted = event.deleted_at is not None
    event.soft_delete(user=request.user)
    if not already_deleted:
        from audit.models import AuditLog
        from audit.services import log as audit_log

        audit_log(
            actor=request.user,
            action=AuditLog.ACTION_EVENT_SOFT_DELETE,
            workspace=event.workspace,
            target_type="event",
            target_id=event.pk,
            summary=f'Smazal akci „{event.title}” do koše',
            payload={"event_slug": event.slug},
        )
    return Response(
        EventPublicSerializer(event, context={"request": request}).data
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def restore_event(
    request: Request, workspace_slug: str, event_slug: str
) -> Response:
    """Bring a soft-deleted event back. Only available while the row
    is still inside the 30-day retention window."""
    try:
        event = Event.all_objects.select_related("workspace").get(
            workspace__slug=workspace_slug, slug=event_slug
        )
    except Event.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not can_manage_event(request.user, event):
        return Response(status=status.HTTP_403_FORBIDDEN)
    if event.deleted_at is None:
        return Response(
            {"detail": "Akce není smazaná."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    event.restore()
    from audit.models import AuditLog
    from audit.services import log as audit_log

    audit_log(
        actor=request.user,
        action=AuditLog.ACTION_EVENT_RESTORE,
        workspace=event.workspace,
        target_type="event",
        target_id=event.pk,
        summary=f'Obnovil akci „{event.title}” z koše',
        payload={"event_slug": event.slug},
    )
    return Response(
        EventPublicSerializer(event, context={"request": request}).data
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def purge_event(
    request: Request, workspace_slug: str, event_slug: str
) -> Response:
    """Hard-delete a soft-deleted event NOW (skip the 30-day wait).
    Refuses to act on a live event — purge is destructive enough that
    we want a two-step path (soft_delete → purge) every time."""
    try:
        event = Event.all_objects.select_related("workspace").get(
            workspace__slug=workspace_slug, slug=event_slug
        )
    except Event.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not can_manage_event(request.user, event):
        return Response(status=status.HTTP_403_FORBIDDEN)
    if event.deleted_at is None:
        return Response(
            {
                "detail": (
                    "Před hard-delete musí být akce nejdřív v koši "
                    "(soft-delete)."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    # Capture identity BEFORE the row is gone — the audit row needs
    # to outlive its target.
    audit_ctx = {
        "event_id": event.pk,
        "event_slug": event.slug,
        "event_title": event.title,
        "workspace": event.workspace,
    }
    event.delete()
    from audit.models import AuditLog
    from audit.services import log as audit_log

    audit_log(
        actor=request.user,
        action=AuditLog.ACTION_EVENT_PURGE,
        workspace=audit_ctx["workspace"],
        target_type="event",
        target_id=audit_ctx["event_id"],
        summary=f'Smazal akci „{audit_ctx["event_title"]}" napořád',
        payload={"event_slug": audit_ctx["event_slug"]},
    )
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def deleted_events_list(request: Request) -> Response:
    """Trash list — soft-deleted events the calling user can manage.
    Mirrors the scope of `owner_events`."""
    from django.db.models import Q

    from .models import EventCollaborator

    managed_ws_ids = list(
        Workspace.objects.filter(
            members__user=request.user,
            members__role__in=["owner", "admin"],
        )
        .values_list("id", flat=True)
        .distinct()
    )
    collab_event_ids = list(
        EventCollaborator.objects.filter(user=request.user)
        .values_list("event_id", flat=True)
        .distinct()
    )
    events = (
        Event.all_objects.filter(deleted_at__isnull=False)
        .filter(
            Q(workspace_id__in=managed_ws_ids) | Q(id__in=collab_event_ids)
        )
        .select_related("workspace", "deleted_by")
        .order_by("-deleted_at")
        .distinct()
    )
    serializer = EventSummarySerializer(events, many=True)
    return Response(serializer.data)


def _owner_event_or_403(request, workspace_slug: str, event_slug: str):
    """Resolve event + verify manager access. Workspace owner/admin OR
    explicit event co-creator. Returns (event, None) on success or
    (None, Response)."""
    from .permissions import can_manage_event

    try:
        event = Event.objects.select_related("workspace").get(
            workspace__slug=workspace_slug, slug=event_slug
        )
    except Event.DoesNotExist:
        return None, Response(status=status.HTTP_404_NOT_FOUND)
    if not can_manage_event(request.user, event):
        return None, Response(status=status.HTTP_403_FORBIDDEN)
    return event, None


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def approve_rsvp(
    request: Request, workspace_slug: str, event_slug: str, rsvp_id: int
) -> Response:
    """Approve a pending_approval RSVP — moves to yes, or waitlist if full."""
    event, err = _owner_event_or_403(request, workspace_slug, event_slug)
    if err:
        return err
    try:
        rsvp = RSVP.objects.select_related("user").get(pk=rsvp_id, event=event)
    except RSVP.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if rsvp.status != RSVP.STATUS_PENDING_APPROVAL:
        return Response(
            {"detail": "RSVP není ve stavu pending_approval."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Capacity-aware: if at capacity AND waitlist enabled, send to waitlist.
    if event.is_at_capacity and event.waitlist_enabled:
        rsvp.status = RSVP.STATUS_WAITLIST
        rsvp.waitlist_position = RSVP._next_waitlist_position(event)
    elif event.is_at_capacity:
        return Response(
            {"detail": "Akce je naplněná a waitlist není povolený."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    else:
        rsvp.status = RSVP.STATUS_YES
        rsvp.waitlist_position = None
    rsvp.save(update_fields=["status", "waitlist_position", "updated_at"])

    send_rsvp_confirmation_task.delay(rsvp.pk)

    # In-app bell — best-effort, doesn't block on email/push pipeline.
    with contextlib.suppress(Exception):
        from .notifications import notify_rsvp_approved

        notify_rsvp_approved(rsvp)

    from audit.models import AuditLog
    from audit.services import log as audit_log

    applicant_name = rsvp.user.get_full_name() if rsvp.user else "(neznámý)"
    audit_log(
        actor=request.user,
        action=AuditLog.ACTION_RSVP_APPROVE,
        workspace=event.workspace,
        target_type="rsvp",
        target_id=rsvp.pk,
        summary=f'Schválil přihlášku {applicant_name} na „{event.title}”',
        payload={
            "event_slug": event.slug,
            "rsvp_status": rsvp.status,
        },
    )

    return Response(RSVPSerializer(rsvp).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def reject_rsvp(
    request: Request, workspace_slug: str, event_slug: str, rsvp_id: int
) -> Response:
    """Reject a pending_approval RSVP — moves to cancelled."""
    event, err = _owner_event_or_403(request, workspace_slug, event_slug)
    if err:
        return err
    try:
        rsvp = RSVP.objects.select_related("user").get(
            pk=rsvp_id, event=event
        )
    except RSVP.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if rsvp.status != RSVP.STATUS_PENDING_APPROVAL:
        return Response(
            {"detail": "RSVP není ve stavu pending_approval."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    reason = (request.data.get("reason") or "").strip()
    rsvp.cancel()

    with contextlib.suppress(Exception):
        from .notifications import notify_rsvp_rejected

        notify_rsvp_rejected(rsvp, reason=reason)

    from audit.models import AuditLog
    from audit.services import log as audit_log

    applicant_name = rsvp.user.get_full_name() if rsvp.user else "(neznámý)"
    audit_log(
        actor=request.user,
        action=AuditLog.ACTION_RSVP_REJECT,
        workspace=event.workspace,
        target_type="rsvp",
        target_id=rsvp.pk,
        summary=f'Zamítl přihlášku {applicant_name} na „{event.title}”',
        payload={"event_slug": event.slug, "reason": reason},
    )

    return Response(RSVPSerializer(rsvp).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def remove_rsvp(
    request: Request, workspace_slug: str, event_slug: str, rsvp_id: int
) -> Response:
    """Owner-side cancel libovolného RSVP.

    `reject_rsvp` funguje jen na `pending_approval` (zamítnutí žádosti).
    Když ale ownerovi vznikne duplicitní účastník (přihláška dvakrát ze
    stejného telefonu / jména, badge `⚠ Duplikát?`), potřebuje ho jít
    smazat z rosteru. Tady force-cancel přes `rsvp.cancel()` — FIFO
    promote z waitlistu se vyřeší automaticky uvnitř `cancel()`.

    Idempotentní: pokud je RSVP už cancelled, vrátíme 200 s aktuálním
    stavem (frontend si stejně refreshne).
    """
    event, err = _owner_event_or_403(request, workspace_slug, event_slug)
    if err:
        return err
    try:
        rsvp = RSVP.objects.select_related("user").get(pk=rsvp_id, event=event)
    except RSVP.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if rsvp.status != RSVP.STATUS_CANCELLED:
        rsvp.cancel()

        from audit.models import AuditLog
        from audit.services import log as audit_log

        participant_name = (
            rsvp.user.get_full_name() if rsvp.user else "(neznámý)"
        )
        audit_log(
            actor=request.user,
            action=AuditLog.ACTION_RSVP_REJECT,
            workspace=event.workspace,
            target_type="rsvp",
            target_id=rsvp.pk,
            summary=(
                f'Odebral účastníka „{participant_name}” z akce '
                f'„{event.title}”'
            ),
            payload={
                "event_slug": event.slug,
                "rsvp_id": rsvp.pk,
                "removed_by_owner": True,
            },
        )

    return Response(RSVPSerializer(rsvp).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def participant_profile(
    request: Request, workspace_slug: str, event_slug: str, rsvp_id: int
) -> Response:
    """Owner view of a participant's profile basics (name, phone, address,
    emergency contact). Surfaces just enough for the owner to call/identify
    the person without exposing internal user fields.
    """
    event, err = _owner_event_or_403(request, workspace_slug, event_slug)
    if err:
        return err
    try:
        rsvp = RSVP.objects.select_related("user").get(pk=rsvp_id, event=event)
    except RSVP.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    user = rsvp.user
    if user is None:
        return Response(
            {"detail": "Účastník registrovaný bez účtu — profil není dostupný."},
            status=status.HTTP_404_NOT_FOUND,
        )

    return Response(
        {
            "rsvp_id": rsvp.id,
            "user_id": user.id,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "full_name": user.get_full_name() or user.email,
            "email": user.email,
            "phone": user.phone,
            "address": {
                "street": user.address_street,
                "city": user.address_city,
                "zip": user.address_zip,
                "country": user.address_country,
                # Legacy single-line, only shown when structured is empty.
                "legacy": user.address,
            },
            "emergency_contact": {
                "name": user.emergency_contact_name,
                "phone": user.emergency_contact_phone,
                "relationship": user.emergency_contact_relationship,
            },
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def event_rsvps(request: Request, workspace_slug: str, event_slug: str) -> Response:
    """Owner-only list of RSVPs for an event (with questionnaire answers)."""
    try:
        event = Event.objects.select_related("workspace").get(
            workspace__slug=workspace_slug, slug=event_slug
        )
    except Event.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not can_manage_event(request.user, event):
        return Response(status=status.HTTP_403_FORBIDDEN)

    rsvps = list(
        RSVP.objects.filter(event=event)
        .exclude(status=RSVP.STATUS_CANCELLED)
        .select_related("user")
        .order_by("status", "waitlist_position", "created_at")
    )
    from .duplicates import detect_duplicates

    duplicate_hints_map = detect_duplicates(rsvps)
    return Response(
        RSVPSerializer(
            rsvps,
            many=True,
            context={"duplicate_hints_map": duplicate_hints_map},
        ).data
    )


# ---------------------------------------------------------------------------
# Slice 5 — RSVP payment endpoints
# ---------------------------------------------------------------------------


def _my_rsvp_or_404(user, workspace_slug: str, event_slug: str):
    """Helper: load the current user's RSVP for an event, or return None."""
    try:
        return RSVP.objects.select_related("event", "event__workspace").get(
            event__workspace__slug=workspace_slug,
            event__slug=event_slug,
            user=user,
        )
    except RSVP.DoesNotExist:
        return None


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_rsvp_payment(request: Request, workspace_slug: str, event_slug: str) -> Response:
    """Payment instructions for the current user's RSVP.

    Returns the structured info the frontend needs to render a QR + IBAN
    + variable symbol panel. 404 when there's no RSVP, 400 when the
    event is free, 200 with the data otherwise.
    """
    rsvp = _my_rsvp_or_404(request.user, workspace_slug, event_slug)
    if rsvp is None:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not rsvp.event.price_amount:
        return Response(
            {"detail": "Tato akce je zdarma — žádná platba se neřeší."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    workspace = rsvp.event.workspace
    qr_url = (
        request.build_absolute_uri(
            f"/api/events/{workspace_slug}/{event_slug}/rsvp/payment/qr.png"
        )
        if workspace.payment_iban
        else None
    )
    return Response(
        {
            "status": rsvp.payment_status,
            "amount": str(rsvp.payment_due_amount or rsvp.event.price_amount),
            "currency": rsvp.payment_currency or rsvp.event.price_currency,
            "variable_symbol": rsvp.variable_symbol,
            "iban": workspace.payment_iban,
            "bank_name": workspace.payment_bank_name,
            "due_days": workspace.payment_due_days,
            "qr_png_url": qr_url,
            "message": f"{workspace.name} — {rsvp.event.title}"[:60],
            "paid_at": rsvp.paid_at,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_rsvp_payment_qr(
    request: Request, workspace_slug: str, event_slug: str
) -> HttpResponse:
    """Render the QR Platba PNG for the current user's RSVP. Inline image."""
    from .payments import build_qr_png, build_spayd_string

    rsvp = _my_rsvp_or_404(request.user, workspace_slug, event_slug)
    if rsvp is None or not rsvp.event.price_amount:
        return HttpResponse(status=404)

    workspace = rsvp.event.workspace
    if not workspace.payment_iban:
        return HttpResponse(status=404)

    spayd = build_spayd_string(
        iban=workspace.payment_iban,
        amount=rsvp.payment_due_amount or rsvp.event.price_amount,
        currency=rsvp.payment_currency or rsvp.event.price_currency or "CZK",
        variable_symbol=rsvp.variable_symbol,
        message=f"{workspace.name} — {rsvp.event.title}",
    )
    png = build_qr_png(spayd)
    response = HttpResponse(png, content_type="image/png")
    # Short cache: VS doesn't change, but if the owner edits the IBAN
    # mid-flight we want it to refresh quickly.
    response["Cache-Control"] = "private, max-age=300"
    return response


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_rsvp_paid(
    request: Request, workspace_slug: str, event_slug: str, rsvp_id: int
) -> Response:
    """Owner action: mark an RSVP as paid (manual reconciliation in V1).

    V1.5 will replace this with a Fio bank webhook that matches incoming
    payments by variable_symbol + amount and flips the status automatically.
    """
    try:
        rsvp = RSVP.objects.select_related("event", "event__workspace").get(
            pk=rsvp_id,
            event__workspace__slug=workspace_slug,
            event__slug=event_slug,
        )
    except RSVP.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not can_manage_event(request.user, rsvp.event):
        return Response(status=status.HTTP_403_FORBIDDEN)

    if rsvp.payment_status == RSVP.PAYMENT_PAID:
        return Response(RSVPSerializer(rsvp).data)

    rsvp.payment_status = RSVP.PAYMENT_PAID
    rsvp.paid_at = timezone.now()
    rsvp.save(update_fields=["payment_status", "paid_at", "updated_at"])

    from audit.models import AuditLog
    from audit.services import log as audit_log

    audit_log(
        actor=request.user,
        action=AuditLog.ACTION_RSVP_MARK_PAID,
        workspace=rsvp.event.workspace,
        target_type="rsvp",
        target_id=rsvp.pk,
        summary=(
            f"Označil/a přihlášku {rsvp.user.get_full_name() or rsvp.user.email} "
            f"na akci „{rsvp.event.title}” jako zaplacenou."
        ),
        payload={
            "amount": str(rsvp.payment_due_amount or ""),
            "currency": rsvp.payment_currency or "",
            "variable_symbol": rsvp.variable_symbol or "",
        },
    )

    # Auto-generate the invoice (Slice 8). Idempotent.
    # Don't block mark-paid on invoice issues; owner can regenerate later.
    import contextlib

    from .models import generate_invoice_for_rsvp

    with contextlib.suppress(Exception):
        generate_invoice_for_rsvp(rsvp)

    return Response(RSVPSerializer(rsvp).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def toggle_rsvp_organizer(
    request: Request, workspace_slug: str, event_slug: str, rsvp_id: int
) -> Response:
    """Flip the organizer flag on an RSVP. Body: {is_organizer: bool}.

    On → waives any pending payment + clears payment_due_amount so no
    QR / invoice is expected from this person.
    Off → recomputes payment from event price (same path as a fresh
    RSVP would take, minus changing status)."""
    try:
        rsvp = RSVP.objects.select_related("event", "event__workspace").get(
            pk=rsvp_id,
            event__workspace__slug=workspace_slug,
            event__slug=event_slug,
        )
    except RSVP.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not can_manage_event(request.user, rsvp.event):
        return Response(status=status.HTTP_403_FORBIDDEN)

    is_organizer = bool(request.data.get("is_organizer"))
    rsvp.is_organizer = is_organizer

    if is_organizer:
        # No money, no paper trail.
        rsvp.payment_status = RSVP.PAYMENT_WAIVED
        rsvp.payment_due_amount = None
        rsvp.paid_at = None
    elif rsvp.event.price_amount and rsvp.payment_status == RSVP.PAYMENT_WAIVED:
        # Was organizer, now isn't — recompute the bill so they're back
        # in the normal payment flow.
        rsvp.payment_status = RSVP.PAYMENT_PENDING
        rsvp.payment_due_amount = rsvp.event.price_amount
        rsvp.payment_currency = rsvp.event.price_currency or "CZK"

    rsvp.save(
        update_fields=[
            "is_organizer",
            "payment_status",
            "payment_due_amount",
            "payment_currency",
            "paid_at",
            "updated_at",
        ]
    )

    from audit.models import AuditLog
    from audit.services import log as audit_log

    audit_log(
        actor=request.user,
        action=AuditLog.ACTION_RSVP_TOGGLE_ORGANIZER,
        workspace=rsvp.event.workspace,
        target_type="rsvp",
        target_id=rsvp.pk,
        summary=(
            f"{'Označil/a' if is_organizer else 'Zrušil/a'} "
            f"{rsvp.user.get_full_name() or rsvp.user.email} jako organizátora "
            f"akce „{rsvp.event.title}”."
        ),
        payload={"is_organizer": is_organizer},
    )
    return Response(RSVPSerializer(rsvp).data)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def rsvp_gear_checklist(
    request: Request, workspace_slug: str, event_slug: str
) -> Response:
    """Toggle a single gear-checklist item for the requester's own RSVP.

    Body: {item_id: int, is_checked: bool}.

    The state lives on RSVP.gear_checklist (dict[str item_id, str ISO
    timestamp]). Setting is_checked=true upserts the timestamp; false
    deletes the key. We don't validate item_id against the event's
    recommended_gear_list — the FE only shows real items, and even a
    stale id at worst clutters the JSON (no security implication)."""
    try:
        event = Event.objects.get(
            workspace__slug=workspace_slug, slug=event_slug
        )
    except Event.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    try:
        rsvp = RSVP.objects.get(event=event, user=request.user)
    except RSVP.DoesNotExist:
        return Response(
            {"detail": "Nemáš registraci na tuto akci."},
            status=status.HTTP_404_NOT_FOUND,
        )

    raw_id = request.data.get("item_id")
    is_checked = bool(request.data.get("is_checked"))
    try:
        item_id_str = str(int(raw_id))
    except (TypeError, ValueError):
        return Response(
            {"item_id": "Neplatné ID položky."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    state = dict(rsvp.gear_checklist or {})
    if is_checked:
        state[item_id_str] = timezone.now().isoformat()
    else:
        state.pop(item_id_str, None)
    rsvp.gear_checklist = state
    rsvp.save(update_fields=["gear_checklist", "updated_at"])
    return Response({"gear_checklist": state})


# ---------------------------------------------------------------------------
# Slice 7 — RSVP documents (uploads tied to required_documents)
# ---------------------------------------------------------------------------


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def my_rsvp_documents(
    request: Request, workspace_slug: str, event_slug: str
) -> Response:
    """List or upload the current user's RSVP documents.

    GET: returns required_documents schema + uploaded files.
    POST (multipart): {key, file} → creates RSVPDocument row.
    """
    from .models import RSVPDocument
    from .serializers import RSVPDocumentSerializer

    rsvp = _my_rsvp_or_404(request.user, workspace_slug, event_slug)
    if rsvp is None:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        docs = RSVPDocument.objects.filter(rsvp=rsvp)
        return Response(
            {
                "required": rsvp.event.required_documents or [],
                "uploaded": RSVPDocumentSerializer(docs, many=True).data,
            }
        )

    # POST
    key = (request.data.get("key") or "").strip()
    file_obj = request.FILES.get("file")
    if not key or not file_obj:
        return Response(
            {"detail": "Vyžadovaná pole: key, file."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    valid_keys = {d.get("key") for d in (rsvp.event.required_documents or [])}
    if key not in valid_keys:
        return Response(
            {"key": "Neznámý typ dokumentu."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    doc = RSVPDocument.objects.create(
        rsvp=rsvp,
        key=key,
        file=file_obj,
        original_name=getattr(file_obj, "name", "")[:255],
    )
    return Response(
        RSVPDocumentSerializer(doc).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def my_rsvp_document_detail(
    request: Request,
    workspace_slug: str,
    event_slug: str,
    document_id: int,
) -> Response:
    """Delete a previously-uploaded document. Self-service so participant
    can re-upload after a mistake."""
    from .models import RSVPDocument

    rsvp = _my_rsvp_or_404(request.user, workspace_slug, event_slug)
    if rsvp is None:
        return Response(status=status.HTTP_404_NOT_FOUND)

    try:
        doc = RSVPDocument.objects.get(pk=document_id, rsvp=rsvp)
    except RSVPDocument.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if doc.verified_at:
        return Response(
            {"detail": "Dokument už ověřil organizátor, nelze smazat."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    doc.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Slice 8 — Invoices (V1 minimum: list, detail, edit; no PDF yet)
# ---------------------------------------------------------------------------


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def event_invoices(
    request: Request, workspace_slug: str, event_slug: str
) -> Response:
    """Owner-only list of all invoices generated for an event."""
    from .models import Invoice
    from .serializers import InvoiceSerializer

    try:
        event = Event.objects.select_related("workspace").get(
            workspace__slug=workspace_slug, slug=event_slug
        )
    except Event.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not can_manage_event(request.user, event):
        return Response(status=status.HTTP_403_FORBIDDEN)

    from .models import refresh_invoice_supplier

    qs = (
        Invoice.objects.filter(rsvp__event=event)
        .select_related(
            "rsvp",
            "rsvp__user",
            "rsvp__event",
            "rsvp__event__workspace",
            "rsvp__event__billing_profile",
        )
        .order_by("-issued_at")
    )
    # Live-sync supplier_* on every read — billing profile changes flow
    # into existing invoices without manual regen.
    invoices = [refresh_invoice_supplier(inv) for inv in qs]
    return Response(InvoiceSerializer(invoices, many=True).data)


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def invoice_detail(
    request: Request,
    workspace_slug: str,
    event_slug: str,
    invoice_id: int,
) -> Response:
    """Owner reads / edits a single invoice. Editing is intentionally
    permissive in V1 — owner can fix anything in the snapshot."""
    from .models import Invoice
    from .serializers import InvoiceSerializer

    try:
        invoice = Invoice.objects.select_related(
            "rsvp", "rsvp__user", "rsvp__event", "rsvp__event__workspace"
        ).get(
            pk=invoice_id,
            rsvp__event__workspace__slug=workspace_slug,
            rsvp__event__slug=event_slug,
        )
    except Invoice.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not is_workspace_owner(request.user, invoice.rsvp.event.workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    if request.method == "GET":
        from .models import refresh_invoice_supplier

        invoice = refresh_invoice_supplier(invoice)
        return Response(InvoiceSerializer(invoice).data)

    serializer = InvoiceSerializer(invoice, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_invoice(
    request: Request, workspace_slug: str, event_slug: str
) -> Response:
    """Participant read-only view of their own invoice for an event."""
    from .models import refresh_invoice_supplier
    from .serializers import InvoiceSerializer

    rsvp = _my_rsvp_or_404(request.user, workspace_slug, event_slug)
    if rsvp is None:
        return Response(status=status.HTTP_404_NOT_FOUND)
    try:
        invoice = rsvp.invoice
    except Exception:
        return Response(status=status.HTTP_404_NOT_FOUND)
    invoice = refresh_invoice_supplier(invoice)
    return Response(InvoiceSerializer(invoice).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def invoice_pdf(
    request: Request,
    workspace_slug: str,
    event_slug: str,
    invoice_id: int,
) -> HttpResponse:
    """Stream the invoice as a PDF. Owner or the invoice's own
    participant can download."""
    from .invoice_pdf import render_invoice_pdf
    from .models import Invoice, refresh_invoice_supplier

    try:
        invoice = Invoice.objects.select_related(
            "rsvp",
            "rsvp__user",
            "rsvp__event",
            "rsvp__event__workspace",
            "rsvp__event__billing_profile",
        ).get(
            pk=invoice_id,
            rsvp__event__workspace__slug=workspace_slug,
            rsvp__event__slug=event_slug,
        )
    except Invoice.DoesNotExist:
        return HttpResponse(status=404)

    is_owner = is_workspace_owner(request.user, invoice.rsvp.event.workspace)
    is_participant = invoice.rsvp.user_id == request.user.id
    if not (is_owner or is_participant):
        return HttpResponse(status=403)

    # Live-sync supplier_* from the current billing profile so the PDF
    # always reflects the latest. Customer fields stay snapshotted.
    invoice = refresh_invoice_supplier(invoice)

    pdf = render_invoice_pdf(invoice)
    filename = f"{invoice.number}.pdf"
    response = HttpResponse(pdf, content_type="application/pdf")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def invoice_qr(
    request: Request,
    workspace_slug: str,
    event_slug: str,
    invoice_id: int,
) -> HttpResponse:
    """Render the invoice's QR Platba as a PNG. Owner or the invoice's
    own participant can fetch."""
    from .models import Invoice
    from .payments import build_qr_png, build_spayd_string

    try:
        invoice = Invoice.objects.select_related(
            "rsvp", "rsvp__user", "rsvp__event", "rsvp__event__workspace"
        ).get(
            pk=invoice_id,
            rsvp__event__workspace__slug=workspace_slug,
            rsvp__event__slug=event_slug,
        )
    except Invoice.DoesNotExist:
        return HttpResponse(status=404)

    is_owner = is_workspace_owner(request.user, invoice.rsvp.event.workspace)
    is_participant = invoice.rsvp.user_id == request.user.id
    if not (is_owner or is_participant):
        return HttpResponse(status=403)

    # Fallback chain for IBAN: invoice snapshot → workspace.payment_iban.
    # Catches older invoices generated before billing profiles landed,
    # or invoices manually edited blank.
    iban = invoice.supplier_iban or invoice.rsvp.event.workspace.payment_iban
    if not iban or not invoice.total:
        return HttpResponse(status=404)

    spayd = build_spayd_string(
        iban=iban,
        amount=invoice.total,
        currency=invoice.currency or "CZK",
        variable_symbol=invoice.variable_symbol,
        message=f"{invoice.supplier_name} — {invoice.number}",
    )
    png = build_qr_png(spayd)
    response = HttpResponse(png, content_type="image/png")
    response["Cache-Control"] = "private, max-age=300"
    return response


# ---------------------------------------------------------------------------
# Slice 11 — Event roadmap / checklist
# ---------------------------------------------------------------------------


def _load_event_for_owner(workspace_slug: str, event_slug: str, user):
    """Common preamble for owner-only event endpoints."""
    try:
        event = Event.objects.select_related(
            "workspace", "billing_profile"
        ).get(workspace__slug=workspace_slug, slug=event_slug)
    except Event.DoesNotExist:
        return None, Response(status=status.HTTP_404_NOT_FOUND)
    if not is_workspace_owner(user, event.workspace):
        return None, Response(status=status.HTTP_403_FORBIDDEN)
    return event, None


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def event_checklist(
    request: Request, workspace_slug: str, event_slug: str
) -> Response:
    """Owner-only roadmap: auto-derived state items + manual items + presets."""
    from .checklist import CHECKLIST_PRESETS, auto_items_for_event
    from .models import EventChecklistItem
    from .serializers import EventChecklistItemSerializer

    event, err = _load_event_for_owner(workspace_slug, event_slug, request.user)
    if err is not None:
        return err

    auto = auto_items_for_event(event)
    manual = EventChecklistItem.objects.filter(event=event)
    return Response(
        {
            "auto": [
                {
                    "key": a.key,
                    "title": a.title,
                    "description": a.description,
                    "done": a.done,
                    "category": a.category,
                    "action_href": a.action_href,
                }
                for a in auto
            ],
            "manual": EventChecklistItemSerializer(manual, many=True).data,
            "presets": CHECKLIST_PRESETS,
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def checklist_items(
    request: Request, workspace_slug: str, event_slug: str
) -> Response:
    """Owner adds a manual checklist item from scratch."""
    from .models import EventChecklistItem
    from .serializers import EventChecklistItemSerializer

    event, err = _load_event_for_owner(workspace_slug, event_slug, request.user)
    if err is not None:
        return err

    title = (request.data.get("title") or "").strip()
    if not title:
        return Response(
            {"title": "Vyplň titulek."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    item = EventChecklistItem.objects.create(
        event=event,
        title=title[:200],
        description=(request.data.get("description") or "").strip(),
        category=(request.data.get("category") or "").strip()[:40],
    )
    return Response(
        EventChecklistItemSerializer(item).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def checklist_item_detail(
    request: Request,
    workspace_slug: str,
    event_slug: str,
    item_id: int,
) -> Response:
    from .models import EventChecklistItem
    from .serializers import EventChecklistItemSerializer

    event, err = _load_event_for_owner(workspace_slug, event_slug, request.user)
    if err is not None:
        return err

    try:
        item = EventChecklistItem.objects.get(pk=item_id, event=event)
    except EventChecklistItem.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # PATCH — flip done, edit title/description/category/sort_order.
    if "done" in request.data:
        item.done = bool(request.data["done"])
    if "title" in request.data:
        title = str(request.data["title"]).strip()[:200]
        if title:
            item.title = title
    if "description" in request.data:
        item.description = str(request.data["description"]).strip()
    if "category" in request.data:
        item.category = str(request.data["category"]).strip()[:40]
    if "sort_order" in request.data:
        import contextlib

        with contextlib.suppress(TypeError, ValueError):
            item.sort_order = max(0, int(request.data["sort_order"]))

    if "remind_at" in request.data:
        from django.utils.dateparse import parse_datetime

        raw = request.data["remind_at"]
        new_remind_at = parse_datetime(raw) if raw else None
        if new_remind_at != item.remind_at:
            item.remind_at = new_remind_at
            item.remind_sent_at = None
    if "remind_audience" in request.data:
        candidate = str(request.data["remind_audience"]).strip()
        valid = {c for c, _ in EventChecklistItem.REMIND_AUDIENCE_CHOICES}
        if candidate in valid:
            item.remind_audience = candidate

    item.save()
    return Response(EventChecklistItemSerializer(item).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def checklist_item_send_now(
    request: Request,
    workspace_slug: str,
    event_slug: str,
    item_id: int,
) -> Response:
    """Owner override — force-send the reminder for this item right now."""
    from .models import EventChecklistItem
    from .serializers import EventChecklistItemSerializer
    from .tasks import send_checklist_reminder_now_task

    event, err = _load_event_for_owner(workspace_slug, event_slug, request.user)
    if err is not None:
        return err

    try:
        item = EventChecklistItem.objects.get(pk=item_id, event=event)
    except EventChecklistItem.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    send_checklist_reminder_now_task.delay(item.pk)
    item.refresh_from_db()
    return Response(EventChecklistItemSerializer(item).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def checklist_from_preset(
    request: Request, workspace_slug: str, event_slug: str
) -> Response:
    """Spawn a fresh manual item from a preset key."""
    from .checklist import CHECKLIST_PRESETS
    from .models import EventChecklistItem
    from .serializers import EventChecklistItemSerializer

    event, err = _load_event_for_owner(workspace_slug, event_slug, request.user)
    if err is not None:
        return err

    key = (request.data.get("key") or "").strip()
    preset = next((p for p in CHECKLIST_PRESETS if p["key"] == key), None)
    if preset is None:
        return Response(
            {"key": "Neznámý preset."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    item = EventChecklistItem.objects.create(
        event=event,
        title=preset["title"],
        description=preset["description"],
        category=preset["category"],
    )
    return Response(
        EventChecklistItemSerializer(item).data,
        status=status.HTTP_201_CREATED,
    )


# ---------------------------------------------------------------------------
# Event co-creators (Spolutvůrci)
# ---------------------------------------------------------------------------


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def event_collaborators(
    request: Request, workspace_slug: str, event_slug: str
) -> Response:
    """List current co-creators on this event (GET), or add a new one
    by email (POST). Only callers with manage rights see / mutate."""
    from .models import EventCollaborator

    event, err = _owner_event_or_403(request, workspace_slug, event_slug)
    if err:
        return err

    if request.method == "GET":
        rows = (
            EventCollaborator.objects.filter(event=event)
            .select_related("user")
            .order_by("created_at")
        )
        return Response(
            [
                {
                    "id": c.id,
                    "user_id": c.user_id,
                    "email": c.user.email,
                    "full_name": c.user.get_full_name() or c.user.email,
                    "created_at": c.created_at,
                }
                for c in rows
            ]
        )

    email = (request.data.get("email") or "").strip().lower()
    if not email:
        return Response(
            {"email": "Vyplň e-mail."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        target = User.objects.get(email=email)
    except User.DoesNotExist:
        return Response(
            {"email": "Uživatel s tímto e-mailem na olafu zatím není. Ať si nejdřív vytvoří účet."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if target == request.user:
        return Response(
            {"detail": "Spolutvůrcem nemůžeš být ty sám — už event spravuješ."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    # Workspace owner/admin doesn't need an explicit collaborator row;
    # they already manage this event through workspace role.
    if is_workspace_owner(target, event.workspace):
        return Response(
            {"detail": "Tato osoba už event spravuje přes komunitu."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    collab, created = EventCollaborator.objects.get_or_create(
        event=event,
        user=target,
        defaults={"added_by": request.user},
    )
    return Response(
        {
            "id": collab.id,
            "user_id": collab.user_id,
            "email": collab.user.email,
            "full_name": collab.user.get_full_name() or collab.user.email,
            "created_at": collab.created_at,
        },
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def event_collaborator_detail(
    request: Request,
    workspace_slug: str,
    event_slug: str,
    user_id: int,
) -> Response:
    from .models import EventCollaborator

    event, err = _owner_event_or_403(request, workspace_slug, event_slug)
    if err:
        return err
    EventCollaborator.objects.filter(event=event, user_id=user_id).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def bulk_match_payments(
    request: Request, workspace_slug: str
) -> Response:
    """Workspace-scoped bulk payment matching.

    Pro každý vstupní záznam `{variable_symbol, amount}` najde RSVP
    s odpovídajícím VS v daném workspace, ověří amount match a
    flipne payment_status na `paid`. Idempotentní — už zaplacené
    RSVPs jsou v `already_paid`, nikdy se nedupluje audit row nebo
    invoice.

    Tento endpoint je generic JSON sink — frontend ho volá s daty
    vytaženými z paste Fio statementu (V1.5 pak Fio webhook adapter
    posílá rovnou sem). Žádná závislost na konkrétním bank API.

    Body:
        {
          "matches": [
            {"variable_symbol": "20240042", "amount": "1500.00", "currency": "CZK"},
            ...
          ]
        }

    Returns 200 + summary:
        {
          "matched":      [{vs, rsvp_id, user_email, amount}],
          "amount_mismatch": [{vs, rsvp_id, expected, received}],
          "already_paid": [{vs, rsvp_id}],
          "not_found":    [{vs}],
          "summary": {matched, amount_mismatch, already_paid, not_found}
        }
    """
    from decimal import Decimal, InvalidOperation

    try:
        workspace = Workspace.objects.get(slug=workspace_slug)
    except Workspace.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not is_workspace_owner(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    matches_in = request.data.get("matches")
    if not isinstance(matches_in, list):
        return Response(
            {"detail": "`matches` musí být list objektů s `variable_symbol` a `amount`."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    matched: list[dict] = []
    amount_mismatch: list[dict] = []
    already_paid: list[dict] = []
    not_found: list[dict] = []

    from audit.models import AuditLog
    from audit.services import log as audit_log

    from .models import generate_invoice_for_rsvp

    for entry in matches_in:
        if not isinstance(entry, dict):
            continue
        vs = str(entry.get("variable_symbol", "")).strip()
        amount_raw = entry.get("amount")
        if not vs or amount_raw is None:
            continue
        try:
            amount = Decimal(str(amount_raw))
        except (InvalidOperation, ValueError):
            continue

        rsvp = (
            RSVP.objects.filter(
                event__workspace=workspace,
                variable_symbol=vs,
            )
            .select_related("event", "event__workspace", "user")
            .order_by("created_at")
            .first()
        )
        if rsvp is None:
            not_found.append({"variable_symbol": vs})
            continue

        if rsvp.payment_status == RSVP.PAYMENT_PAID:
            already_paid.append(
                {"variable_symbol": vs, "rsvp_id": rsvp.pk}
            )
            continue

        expected = rsvp.payment_due_amount
        if expected is not None and abs(amount - expected) > Decimal("1.00"):
            # Tolerance 1 Kč — někdy přijde s diakrtikou v haléřích.
            amount_mismatch.append(
                {
                    "variable_symbol": vs,
                    "rsvp_id": rsvp.pk,
                    "expected": str(expected),
                    "received": str(amount),
                }
            )
            continue

        rsvp.payment_status = RSVP.PAYMENT_PAID
        rsvp.paid_at = timezone.now()
        rsvp.save(update_fields=["payment_status", "paid_at", "updated_at"])

        audit_log(
            actor=request.user,
            action=AuditLog.ACTION_RSVP_MARK_PAID,
            workspace=workspace,
            target_type="rsvp",
            target_id=rsvp.pk,
            summary=(
                f"Spárováno přes bulk-match: přihláška "
                f"{rsvp.user.get_full_name() or rsvp.user.email} na "
                f'akci „{rsvp.event.title}".'
            ),
            payload={
                "amount": str(amount),
                "currency": entry.get("currency") or rsvp.payment_currency,
                "variable_symbol": vs,
                "source": "bulk_match",
            },
        )

        import contextlib

        with contextlib.suppress(Exception):
            generate_invoice_for_rsvp(rsvp)

        matched.append(
            {
                "variable_symbol": vs,
                "rsvp_id": rsvp.pk,
                "user_email": rsvp.user.email,
                "amount": str(amount),
            }
        )

    return Response(
        {
            "matched": matched,
            "amount_mismatch": amount_mismatch,
            "already_paid": already_paid,
            "not_found": not_found,
            "summary": {
                "matched": len(matched),
                "amount_mismatch": len(amount_mismatch),
                "already_paid": len(already_paid),
                "not_found": len(not_found),
            },
        }
    )
