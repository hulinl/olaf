"""Event + RSVP views."""
from __future__ import annotations

import secrets

from django.contrib.auth import login
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from accounts.models import User
from workspaces.models import Workspace

from communities.models import Community

from .models import RSVP, Event, EventImage
from .permissions import is_workspace_owner
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
    """Return the event if it's visible publicly, else None."""
    try:
        return Event.objects.select_related("workspace").get(
            workspace__slug=workspace_slug, slug=event_slug
        )
    except Event.DoesNotExist:
        return None


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

    # Draft events visible only to the creator (workspace owner).
    if event.status == Event.STATUS_DRAFT and not is_workspace_owner(
        request.user, event.workspace
    ):
        return Response(
            {"detail": "Event not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    serializer = EventPublicSerializer(event)
    payload = serializer.data

    # If the requester is authenticated and has an RSVP, include it.
    if request.user.is_authenticated:
        my_rsvp = (
            RSVP.objects.filter(event=event, user=request.user).first()
        )
        payload["my_rsvp"] = (
            MyRSVPSerializer(my_rsvp).data if my_rsvp else None
        )

    return Response(payload)


def _create_light_user(account_payload: dict) -> User | None:
    """Create a verified light-registration user for the public RSVP flow.

    The user is auto-verified (no email confirmation) because the RSVP itself
    is the proof of email — a confirmation lands in their inbox right after.
    A random password is set; the user is prompted to use password reset to
    pick their own.
    """
    email = (account_payload.get("email") or "").strip().lower()
    first_name = (account_payload.get("first_name") or "").strip()
    last_name = (account_payload.get("last_name") or "").strip()
    phone = (account_payload.get("phone") or "").strip()

    if not (email and first_name and last_name):
        return None

    user, created = User.objects.get_or_create(
        email=email,
        defaults={
            "first_name": first_name,
            "last_name": last_name,
            "phone": phone,
            "email_verified": True,
        },
    )
    if created:
        user.set_password(secrets.token_urlsafe(24))
        user.save(update_fields=["password"])
    elif not user.email_verified:
        user.email_verified = True
        if phone and not user.phone:
            user.phone = phone
        user.save(update_fields=["email_verified", "phone"])
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
        user = _create_light_user(account)
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
        # Log them in so subsequent edits to their RSVP work without a
        # separate password flow.
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")

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
    return Response(MyRSVPSerializer(rsvp).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_events(request: Request) -> Response:
    """Events the current user is RSVP-ed to (any non-cancelled status)."""
    rsvps = (
        RSVP.objects.filter(user=request.user)
        .exclude(status=RSVP.STATUS_CANCELLED)
        .select_related("event", "event__workspace")
        .order_by("event__starts_at")
    )
    serializer = EventSummarySerializer([r.event for r in rsvps], many=True)
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def owner_events(request: Request) -> Response:
    """Events the current user owns (workspace-Owner-scoped)."""
    workspaces = (
        Workspace.objects.filter(
            members__user=request.user,
            members__role="owner",
        )
        .distinct()
    )
    events = (
        Event.objects.filter(workspace__in=workspaces)
        .select_related("workspace")
        .order_by("-starts_at")
    )
    serializer = EventSummarySerializer(events, many=True)
    return Response(serializer.data)


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
    event = serializer.save(workspace=workspace)
    if community_slugs is not None:
        _set_event_communities(event, community_slugs)
    return Response(
        EventPublicSerializer(event).data,
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

    if not is_workspace_owner(request.user, event.workspace):
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
    event = serializer.save()
    if has_communities:
        _set_event_communities(event, community_slugs or [])
    return Response(EventPublicSerializer(event).data)


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
    - dates, location, content blocks, FAQ, program, questionnaire — all copied
    - RSVPs are NOT copied
    """
    from django.core.files.base import ContentFile

    try:
        event = Event.objects.select_related("workspace").get(
            workspace__slug=workspace_slug, slug=event_slug
        )
    except Event.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not is_workspace_owner(request.user, event.workspace):
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
        highlights=list(event.highlights or []),
        included=list(event.included or []),
        not_included=list(event.not_included or []),
        additional_cost_note=event.additional_cost_note,
        difficulty_level=event.difficulty_level,
        difficulty_note=event.difficulty_note,
        transport_info=event.transport_info,
        accommodation_info=event.accommodation_info,
        gear_info=event.gear_info,
        faq=list(event.faq or []),
        program=list(event.program or []),
        price_text=event.price_text,
        blocks=list(event.blocks or []),
        enabled_questionnaire_sections=list(
            event.enabled_questionnaire_sections or []
        ),
    )

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
GALLERY_MAX_BYTES = 5 * 1024 * 1024


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

    # POST — owner-only upload
    if not request.user.is_authenticated or not is_workspace_owner(
        request.user, event.workspace
    ):
        return Response(status=status.HTTP_403_FORBIDDEN)

    upload = request.FILES.get("image")
    if not upload:
        return Response(
            {"image": "Soubor je povinný."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if upload.size > GALLERY_MAX_BYTES:
        return Response(
            {"image": "Maximální velikost je 5 MB."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if event.images.count() >= GALLERY_MAX_IMAGES:
        return Response(
            {"image": f"Maximum je {GALLERY_MAX_IMAGES} obrázků v galerii."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    next_order = (
        event.images.order_by("-sort_order").values_list("sort_order", flat=True).first()
        or 0
    ) + 1
    img = EventImage.objects.create(
        event=event,
        image=upload,
        alt_text=request.data.get("alt_text", "") or "",
        sort_order=next_order,
    )
    return Response(
        EventImageSerializer(img).data,
        status=status.HTTP_201_CREATED,
    )


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

    if not is_workspace_owner(request.user, img.event.workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    img.image.delete(save=False)
    img.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


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

    if not is_workspace_owner(request.user, event.workspace):
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

    if not is_workspace_owner(request.user, event.workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    if request.method == "DELETE":
        if event.cover:
            event.cover.delete(save=False)
        event.cover = None
        event.save(update_fields=["cover", "updated_at"])
        return Response(EventPublicSerializer(event).data)

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

    if event.cover:
        event.cover.delete(save=False)
    event.cover = upload
    event.save(update_fields=["cover", "updated_at"])
    return Response(EventPublicSerializer(event).data)


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

    if not is_workspace_owner(request.user, event.workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    if event.status == Event.STATUS_CANCELLED:
        return Response(EventPublicSerializer(event).data)

    reason = (request.data.get("reason") or "").strip()
    event.status = Event.STATUS_CANCELLED
    event.cancellation_reason = reason
    event.save(update_fields=["status", "cancellation_reason", "updated_at"])

    fan_out_event_cancellation_task.delay(event.pk, reason)
    return Response(EventPublicSerializer(event).data)


def _owner_event_or_403(request, workspace_slug: str, event_slug: str):
    """Resolve event + verify owner. Returns (event, None) on success or (None, Response)."""
    try:
        event = Event.objects.select_related("workspace").get(
            workspace__slug=workspace_slug, slug=event_slug
        )
    except Event.DoesNotExist:
        return None, Response(status=status.HTTP_404_NOT_FOUND)
    if not is_workspace_owner(request.user, event.workspace):
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
        rsvp = RSVP.objects.get(pk=rsvp_id, event=event)
    except RSVP.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if rsvp.status != RSVP.STATUS_PENDING_APPROVAL:
        return Response(
            {"detail": "RSVP není ve stavu pending_approval."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    rsvp.cancel()
    return Response(RSVPSerializer(rsvp).data)


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

    if not is_workspace_owner(request.user, event.workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    rsvps = (
        RSVP.objects.filter(event=event)
        .exclude(status=RSVP.STATUS_CANCELLED)
        .select_related("user")
        .order_by("status", "waitlist_position", "created_at")
    )
    return Response(RSVPSerializer(rsvps, many=True).data)
