import contextlib

from django.db import transaction
from rest_framework import status
from rest_framework.decorators import (
    api_view,
    parser_classes,
    permission_classes,
)
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from .models import Workspace, WorkspaceMember
from .serializers import (
    WorkspaceCreateSerializer,
    WorkspacePublicSerializer,
    WorkspaceWriteSerializer,
)


def _is_owner(user, workspace: Workspace) -> bool:
    """Operational owner-or-admin check. Despite the name, admins pass
    too — matches events.permissions.is_workspace_owner semantics."""
    if not user or not user.is_authenticated:
        return False
    return WorkspaceMember.objects.filter(
        workspace=workspace,
        user=user,
        role__in=[WorkspaceMember.ROLE_OWNER, WorkspaceMember.ROLE_ADMIN],
    ).exists()


def _can_view_workspace_people(user, workspace: Workspace) -> bool:
    """Anyone who can manage at least one event in this workspace can
    see its Lidé list — owners/admins via WorkspaceMember and event
    co-creators via EventCollaborator. The co-creator's edit screen
    needs this so they can pick a fellow spolutvůrce from the list."""
    if not user or not user.is_authenticated:
        return False
    if _is_owner(user, workspace):
        return True
    from events.models import EventCollaborator
    return EventCollaborator.objects.filter(
        user=user, event__workspace=workspace
    ).exists()


WORKSPACE_IMAGE_MAX_BYTES = 8 * 1024 * 1024


def _user_role_in_workspace(user, workspace: Workspace) -> str | None:
    if not user or not user.is_authenticated:
        return None
    membership = WorkspaceMember.objects.filter(
        workspace=workspace, user=user
    ).first()
    return membership.role if membership else None


def _user_is_member(user, workspace: Workspace) -> bool:
    if not user or not user.is_authenticated:
        return False
    return WorkspaceMember.objects.filter(
        workspace=workspace, user=user
    ).exists()


@api_view(["GET"])
@permission_classes([AllowAny])
def public_workspace(request: Request, slug: str) -> Response:
    """Public workspace profile (PRD §4.3).

    Visibility rules:
      - public   → 200 to anyone
      - unlisted → 200 to anyone with the URL
      - private  → 200 only to members; 404 otherwise (no existence leak)
    """
    try:
        workspace = Workspace.objects.get(slug=slug)
    except Workspace.DoesNotExist:
        return Response(
            {"detail": "Workspace not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if workspace.visibility == Workspace.VISIBILITY_PRIVATE and not _user_is_member(
        request.user, workspace
    ):
        return Response(
            {"detail": "Workspace not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    serializer = WorkspacePublicSerializer(workspace, context={"request": request})
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_workspace(request: Request) -> Response:
    """Create a new workspace. The authenticated user becomes its owner.

    Any authenticated user can hit this — there's no "I'm a creator" gate.
    The act of creating the workspace is what makes them one.
    """
    serializer = WorkspaceCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    with transaction.atomic():
        workspace = serializer.save()
        WorkspaceMember.objects.create(
            workspace=workspace,
            user=request.user,
            role=WorkspaceMember.ROLE_OWNER,
        )
    data = WorkspacePublicSerializer(workspace, context={"request": request}).data
    data["my_role"] = WorkspaceMember.ROLE_OWNER
    data["member_count"] = 1
    return Response(data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_personal_workspace(request: Request) -> Response:
    """Get-or-create the user's personal workspace.

    Personal workspaces are lazy tenant containers so any user can spin
    up an event without first founding a community. The slug is
    deterministic (`personal-<user_id>`) so URLs stay stable; the user
    can rename + repurpose later via the standard edit endpoints.

    Hidden from /api/workspaces/ public discovery and from `mine` if
    the user has other workspaces — they're plumbing, not a destination.
    """
    user = request.user
    full_name = user.get_full_name() or user.email.split("@", 1)[0]
    workspace, _ = Workspace.objects.get_or_create(
        slug=f"personal-{user.id}",
        defaults={
            "name": f"{full_name} — můj prostor",
            "is_personal": True,
            "default_tz": "Europe/Prague",
            "visibility": Workspace.VISIBILITY_UNLISTED,
        },
    )
    WorkspaceMember.objects.get_or_create(
        workspace=workspace,
        user=user,
        defaults={"role": WorkspaceMember.ROLE_OWNER},
    )
    data = WorkspacePublicSerializer(workspace, context={"request": request}).data
    data["my_role"] = WorkspaceMember.ROLE_OWNER
    return Response(data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_workspaces(request: Request) -> Response:
    """Workspaces the current user belongs to (any role).

    Returns workspace data + the viewer's role on each (so the frontend
    can show owner controls without a second request).
    """
    memberships = (
        WorkspaceMember.objects.filter(user=request.user)
        .select_related("workspace")
        .exclude(workspace__is_personal=True)
        .order_by("workspace__name")
    )
    out = []
    for m in memberships:
        data = WorkspacePublicSerializer(
            m.workspace, context={"request": request}
        ).data
        data["my_role"] = m.role
        out.append(data)
    return Response(out)


@api_view(["GET", "PATCH"])
@permission_classes([AllowAny])
def workspace_detail(request: Request, slug: str) -> Response:
    """Workspace detail with viewer's role + member count.

    GET — same visibility rules as `public_workspace`. Authenticated members
    additionally see their role; non-members see the public view.
    PATCH — owner-only; updates writable profile fields.
    """
    try:
        workspace = Workspace.objects.get(slug=slug)
    except Workspace.DoesNotExist:
        return Response(
            {"detail": "Workspace not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    viewer_role = _user_role_in_workspace(request.user, workspace)

    if request.method == "PATCH":
        if not _is_owner(request.user, workspace):
            return Response(status=status.HTTP_403_FORBIDDEN)
        serializer = WorkspaceWriteSerializer(
            workspace, data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        # Fall through to GET-style response so the client gets the merged view.

    if workspace.visibility == Workspace.VISIBILITY_PRIVATE and viewer_role is None:
        return Response(
            {"detail": "Workspace not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    data = WorkspacePublicSerializer(
        workspace, context={"request": request}
    ).data
    data["my_role"] = viewer_role
    data["member_count"] = WorkspaceMember.objects.filter(
        workspace=workspace
    ).count()
    return Response(data)


@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def workspace_logo(request: Request, slug: str) -> Response:
    """Owner-only logo upload / delete."""
    return _handle_workspace_image(request, slug, field="logo")


@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def workspace_cover(request: Request, slug: str) -> Response:
    """Owner-only cover upload / delete."""
    return _handle_workspace_image(request, slug, field="cover")


def _handle_workspace_image(request: Request, slug: str, *, field: str) -> Response:
    """Shared logic for logo / cover endpoints — keeps the two view bodies
    one-liners. `field` must be "logo" or "cover" (matches Workspace.<field>).
    """
    try:
        workspace = Workspace.objects.get(slug=slug)
    except Workspace.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not _is_owner(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    file_field = getattr(workspace, field)

    if request.method == "DELETE":
        if file_field:
            file_field.delete(save=False)
            setattr(workspace, field, None)
            workspace.save(update_fields=[field])
        return Response(
            WorkspacePublicSerializer(workspace, context={"request": request}).data
        )

    upload = request.FILES.get(field) or request.FILES.get("image")
    if not upload:
        return Response(
            {"detail": "Soubor je povinný."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if upload.size > WORKSPACE_IMAGE_MAX_BYTES:
        mb = WORKSPACE_IMAGE_MAX_BYTES // (1024 * 1024)
        return Response(
            {"detail": f"Obrázek je moc velký — maximum je {mb} MB."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Same downscale + JPEG pipeline as event uploads — phones produce
    # multi-megabyte JPEGs that crush mobile pageload time otherwise.
    # Logos are usually small (rare for someone to upload a 4000px
    # logo), but the helper short-circuits when the source is already
    # under max_dim so calling it costs nothing in the common case.
    from events.image_utils import UnsupportedImageError, downscale_upload

    try:
        processed = downscale_upload(upload)
    except UnsupportedImageError as exc:
        return Response(
            {"detail": str(exc)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if file_field:
        file_field.delete(save=False)
    setattr(workspace, field, processed)
    workspace.save(update_fields=[field])
    return Response(
        WorkspacePublicSerializer(workspace, context={"request": request}).data
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def workspace_events(request: Request, slug: str) -> Response:
    """Events for a single workspace.

    Public visitors see only `published` (and `closed` / `completed`) events.
    Workspace members see all statuses incl. draft.
    """
    # Local import to keep module-load order clean.
    from events.models import Event
    from events.serializers import EventSummarySerializer

    try:
        workspace = Workspace.objects.get(slug=slug)
    except Workspace.DoesNotExist:
        return Response(
            {"detail": "Workspace not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    viewer_role = _user_role_in_workspace(request.user, workspace)

    if workspace.visibility == Workspace.VISIBILITY_PRIVATE and viewer_role is None:
        return Response(
            {"detail": "Workspace not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    # An event shows up in this workspace's list if it's *owned* by this
    # workspace OR has been shared into it (Slice 3 cross-workspace m2m).
    from django.db.models import Q

    qs = (
        Event.objects.filter(
            Q(workspace=workspace) | Q(shared_workspaces=workspace)
        )
        .select_related("workspace")
        .distinct()
    )
    if viewer_role is None:
        qs = qs.exclude(status=Event.STATUS_DRAFT)
    qs = qs.order_by("-starts_at")
    return Response(EventSummarySerializer(qs, many=True).data)


# ---------------------------------------------------------------------------
# Slice 9 — Členové komunity (owner-only views)
# ---------------------------------------------------------------------------


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def workspace_members(request: Request, slug: str) -> Response:
    """List explicit, active WorkspaceMembers for the community roster.

    V2: members are an explicit relationship, not RSVP-derived. A row
    here means the owner deliberately added the person (or the V1
    backfill carried them over from a non-cancelled RSVP). RSVPers who
    are not members go through the /participants/ endpoint and can be
    promoted to members via /members/add/.

    Each row is enriched with RSVP stats (total / upcoming / past) so
    the CRM table can show "what they've registered for" alongside
    their membership status, but the canonical filter is the member
    row, not the RSVP.

    Owner-only because it includes contact info.
    """
    from django.db.models import Count, Max
    from django.db.models import Q as DQ
    from django.utils import timezone

    from events.models import RSVP, Event

    try:
        workspace = Workspace.objects.get(slug=slug)
    except Workspace.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not _can_view_workspace_people(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    event_ids = list(
        Event.objects.filter(
            DQ(workspace=workspace) | DQ(shared_workspaces=workspace)
        )
        .values_list("id", flat=True)
        .distinct()
    )

    now = timezone.now()
    memberships = (
        WorkspaceMember.objects.filter(
            workspace=workspace,
            status=WorkspaceMember.STATUS_ACTIVE,
        )
        .select_related("user")
        .annotate(
            total_rsvps=Count(
                "user__rsvps",
                filter=DQ(user__rsvps__event_id__in=event_ids)
                & ~DQ(user__rsvps__status=RSVP.STATUS_CANCELLED),
                distinct=True,
            ),
            upcoming_rsvps=Count(
                "user__rsvps",
                filter=DQ(
                    user__rsvps__event_id__in=event_ids,
                    user__rsvps__event__ends_at__gte=now,
                )
                & ~DQ(user__rsvps__status=RSVP.STATUS_CANCELLED),
                distinct=True,
            ),
            past_rsvps=Count(
                "user__rsvps",
                filter=DQ(
                    user__rsvps__event_id__in=event_ids,
                    user__rsvps__event__ends_at__lt=now,
                )
                & ~DQ(user__rsvps__status=RSVP.STATUS_CANCELLED),
                distinct=True,
            ),
            last_rsvp_at=Max(
                "user__rsvps__created_at",
                filter=DQ(user__rsvps__event_id__in=event_ids)
                & ~DQ(user__rsvps__status=RSVP.STATUS_CANCELLED),
            ),
        )
        .order_by("-joined_at", "user_id")
    )

    # Pull profile (note + tag ids) per user in one query — keeps the
    # roster response O(1) regardless of how many tags are attached.
    from .models import PersonProfile
    profiles_by_user: dict[int, PersonProfile] = {
        p.user_id: p
        for p in PersonProfile.objects.filter(
            workspace=workspace
        ).prefetch_related("tags")
    }

    return Response(
        [
            {
                "id": m.user.id,
                "email": m.user.email,
                "first_name": m.user.first_name,
                "last_name": m.user.last_name,
                "full_name": m.user.get_full_name(),
                "phone": m.user.phone,
                "total_rsvps": m.total_rsvps,
                "upcoming_rsvps": m.upcoming_rsvps,
                "past_rsvps": m.past_rsvps,
                "last_rsvp_at": m.last_rsvp_at,
                "role": m.role,
                "joined_at": m.joined_at,
                "note": (
                    profiles_by_user[m.user_id].note
                    if m.user_id in profiles_by_user
                    else ""
                ),
                "tag_ids": (
                    [t.id for t in profiles_by_user[m.user_id].tags.all()]
                    if m.user_id in profiles_by_user
                    else []
                ),
            }
            for m in memberships
        ]
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def workspace_member_detail(
    request: Request, slug: str, user_id: int
) -> Response:
    """Profile + RSVP history for one member, scoped to this workspace."""
    from django.db.models import Q as DQ

    from accounts.models import User
    from events.models import RSVP, Event

    try:
        workspace = Workspace.objects.get(slug=slug)
    except Workspace.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not _is_owner(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    try:
        member = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    event_ids = list(
        Event.objects.filter(
            DQ(workspace=workspace) | DQ(shared_workspaces=workspace)
        )
        .values_list("id", flat=True)
        .distinct()
    )

    rsvps = (
        RSVP.objects.filter(user=member, event_id__in=event_ids)
        .select_related("event")
        .order_by("-event__starts_at")
    )

    return Response(
        {
            "id": member.id,
            "email": member.email,
            "first_name": member.first_name,
            "last_name": member.last_name,
            "full_name": member.get_full_name(),
            "phone": member.phone,
            "bio": member.bio,
            "fitness_level": member.fitness_level,
            "diet": member.diet,
            "tshirt_size": member.tshirt_size,
            "rsvps": [
                {
                    "id": r.id,
                    "event_slug": r.event.slug,
                    "event_title": r.event.title,
                    "event_starts_at": r.event.starts_at,
                    "event_workspace_slug": r.event.workspace.slug,
                    "status": r.status,
                    "payment_status": r.payment_status,
                    "created_at": r.created_at,
                }
                for r in rsvps
            ],
        }
    )


# ---------------------------------------------------------------------------
# V2 explicit membership — add / remove / participants
# ---------------------------------------------------------------------------


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def workspace_member_remove(
    request: Request, slug: str, user_id: int
) -> Response:
    """Remove a member from the community (status → removed).

    Idempotent: removing an already-removed row is a no-op (returns
    200). RSVPs and PersonProfile are NOT touched — the person can
    still appear in /participants/ if they have RSVPs, and the owner
    can add them back any time.

    Guards (mirror promote/demote logic to avoid surprises):
      - 400 if target is OWNER (must hand over first)
      - 400 if target is ADMIN (must demote first — keeps the audit
        trail of "lost admin" separate from "removed from community")
      - 400 if caller is removing themselves (use /members/handover/
        to leave the workspace cleanly)
      - 403 if caller is not workspace owner/admin
    """
    from events.permissions import is_workspace_super_admin

    try:
        workspace = Workspace.objects.get(slug=slug)
    except Workspace.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not is_workspace_super_admin(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    if request.user.id == user_id:
        return Response(
            {"detail": "Sebe nemůžeš odebrat. Pokud chceš opustit komunitu, předej nejdřív vlastnictví."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        member = WorkspaceMember.objects.get(
            workspace=workspace, user_id=user_id
        )
    except WorkspaceMember.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if member.role == WorkspaceMember.ROLE_OWNER:
        return Response(
            {"detail": "Ownera nelze odebrat — předej nejdřív vlastnictví."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if member.role == WorkspaceMember.ROLE_ADMIN:
        return Response(
            {"detail": "Admina nejdřív degraduj na člena, pak ho odeber."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if member.status == WorkspaceMember.STATUS_ACTIVE:
        member.status = WorkspaceMember.STATUS_REMOVED
        member.save(update_fields=["status"])
        _audit_membership_change(
            actor=request.user,
            workspace=workspace,
            action="remove",
            removed_user_id=user_id,
        )
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def workspace_participants(request: Request, slug: str) -> Response:
    """List users who have RSVPed to workspace events but are NOT
    active community members.

    Owner workflow: see the "Účastníci" sub-view, pick rows that
    deserve to be members, hit "Přidat do komunity" → POST
    /members/add/ with the selected user_ids. The reverse direction
    (an active member who hasn't RSVPed) doesn't surface here — that's
    just an explicitly added member with no event history yet.
    """
    from django.db.models import Count, Max
    from django.db.models import Q as DQ
    from django.utils import timezone

    from accounts.models import User
    from events.models import RSVP, Event

    try:
        workspace = Workspace.objects.get(slug=slug)
    except Workspace.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not _can_view_workspace_people(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    event_ids = list(
        Event.objects.filter(
            DQ(workspace=workspace) | DQ(shared_workspaces=workspace)
        )
        .values_list("id", flat=True)
        .distinct()
    )

    active_member_ids = set(
        WorkspaceMember.objects.filter(
            workspace=workspace,
            status=WorkspaceMember.STATUS_ACTIVE,
        ).values_list("user_id", flat=True)
    )

    now = timezone.now()
    users = (
        User.objects.filter(rsvps__event_id__in=event_ids)
        .exclude(rsvps__status=RSVP.STATUS_CANCELLED)
        .exclude(id__in=active_member_ids)
        .annotate(
            total_rsvps=Count(
                "rsvps",
                filter=DQ(rsvps__event_id__in=event_ids)
                & ~DQ(rsvps__status=RSVP.STATUS_CANCELLED),
                distinct=True,
            ),
            upcoming_rsvps=Count(
                "rsvps",
                filter=DQ(
                    rsvps__event_id__in=event_ids,
                    rsvps__event__ends_at__gte=now,
                )
                & ~DQ(rsvps__status=RSVP.STATUS_CANCELLED),
                distinct=True,
            ),
            last_rsvp_at=Max(
                "rsvps__created_at",
                filter=DQ(rsvps__event_id__in=event_ids)
                & ~DQ(rsvps__status=RSVP.STATUS_CANCELLED),
            ),
        )
        .distinct()
        .order_by("-last_rsvp_at")
    )

    return Response(
        [
            {
                "id": u.id,
                "email": u.email,
                "full_name": u.get_full_name(),
                "phone": u.phone,
                "total_rsvps": u.total_rsvps,
                "upcoming_rsvps": u.upcoming_rsvps,
                "last_rsvp_at": u.last_rsvp_at,
            }
            for u in users
        ]
    )


def _audit_membership_change(
    *,
    actor,
    workspace,
    action: str,
    added_user_ids: list[int] | None = None,
    removed_user_id: int | None = None,
) -> None:
    """Audit log for explicit add / remove. Promote / demote keep
    using `_audit_role_change` — those are role transitions, this is
    membership presence."""
    from audit.models import AuditLog
    from audit.services import log as audit_log

    if action == "add" and added_user_ids:
        summary = (
            f"Přidal {len(added_user_ids)} členů do komunity"
            if len(added_user_ids) != 1
            else "Přidal člena do komunity"
        )
        audit_log(
            actor=actor,
            action=AuditLog.ACTION_MEMBER_ADD,
            workspace=workspace,
            target_type="workspace_member",
            target_id=workspace.pk,
            summary=summary,
            payload={"added_user_ids": added_user_ids},
        )
    elif action == "remove" and removed_user_id is not None:
        audit_log(
            actor=actor,
            action=AuditLog.ACTION_MEMBER_REMOVE,
            workspace=workspace,
            target_type="workspace_member",
            target_id=removed_user_id,
            summary="Odebral člena z komunity",
            payload={"removed_user_id": removed_user_id},
        )


# ---------------------------------------------------------------------------
# Multi-admin — promote / demote (super-admin only)
# ---------------------------------------------------------------------------


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def workspace_member_promote(
    request: Request, slug: str, user_id: int
) -> Response:
    """Promote a member to admin (super-admin only). No-ops if already
    admin or owner."""
    try:
        workspace = Workspace.objects.get(slug=slug)
    except Workspace.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    from events.permissions import is_workspace_super_admin

    if not is_workspace_super_admin(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    from accounts.models import User
    from events.models import RSVP

    # Sanity-check that the target user has any presence in this
    # workspace at all (RSVP or existing membership) — we don't want
    # owners promoting strangers via id-guessing.
    try:
        target = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    has_presence = (
        RSVP.objects.filter(
            user=target, event__workspace=workspace
        ).exists()
        or WorkspaceMember.objects.filter(
            workspace=workspace, user=target
        ).exists()
    )
    if not has_presence:
        return Response(
            {"detail": "Tento uživatel není v komunitě (žádný RSVP ani členství)."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    member, _ = WorkspaceMember.objects.get_or_create(
        workspace=workspace,
        user=target,
        defaults={"role": WorkspaceMember.ROLE_MEMBER},
    )
    if member.role == WorkspaceMember.ROLE_OWNER:
        return Response(
            {"detail": "Owner už má všechna práva."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if member.role != WorkspaceMember.ROLE_ADMIN:
        old_role = member.role
        member.role = WorkspaceMember.ROLE_ADMIN
        member.save(update_fields=["role"])
        _audit_role_change(
            actor=request.user,
            workspace=workspace,
            member=member,
            old_role=old_role,
            new_role=member.role,
        )
    return Response({"user_id": member.user_id, "role": member.role})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def workspace_member_demote(
    request: Request, slug: str, user_id: int
) -> Response:
    """Demote an admin back to member (super-admin only). Cannot demote
    the owner — there must always be at least one owner."""
    try:
        workspace = Workspace.objects.get(slug=slug)
    except Workspace.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    from events.permissions import is_workspace_super_admin

    if not is_workspace_super_admin(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    try:
        member = WorkspaceMember.objects.get(workspace=workspace, user_id=user_id)
    except WorkspaceMember.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if member.role == WorkspaceMember.ROLE_OWNER:
        return Response(
            {"detail": "Ownera nelze degradovat — předej nejdřív vlastnictví."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if member.role != WorkspaceMember.ROLE_MEMBER:
        old_role = member.role
        member.role = WorkspaceMember.ROLE_MEMBER
        member.save(update_fields=["role"])
        _audit_role_change(
            actor=request.user,
            workspace=workspace,
            member=member,
            old_role=old_role,
            new_role=member.role,
        )
    return Response({"user_id": member.user_id, "role": member.role})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def workspace_member_handover(
    request: Request, slug: str, user_id: int
) -> Response:
    """Hand over ownership to another admin (super-admin only).

    Atomically swaps roles: caller (current owner) becomes admin;
    target (must be admin) becomes owner. The new owner can then
    demote / remove the old one if they choose. This is the only
    way to change the workspace owner — single-owner invariant is
    preserved by the swap.
    """
    try:
        workspace = Workspace.objects.get(slug=slug)
    except Workspace.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    from django.db import transaction

    from events.permissions import is_workspace_super_admin

    if not is_workspace_super_admin(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    if request.user.id == user_id:
        return Response(
            {"detail": "Vlastnictví nemůžeš předat sám sobě."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        target = WorkspaceMember.objects.get(
            workspace=workspace, user_id=user_id
        )
    except WorkspaceMember.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if target.role != WorkspaceMember.ROLE_ADMIN:
        return Response(
            {
                "detail": (
                    "Vlastnictví můžeš předat jen někomu, kdo už je adminem. "
                    "Nejdřív ho povyš na admina."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    me = WorkspaceMember.objects.get(workspace=workspace, user=request.user)
    with transaction.atomic():
        me.role = WorkspaceMember.ROLE_ADMIN
        me.save(update_fields=["role"])
        target.role = WorkspaceMember.ROLE_OWNER
        target.save(update_fields=["role"])

    _audit_role_change(
        actor=request.user,
        workspace=workspace,
        member=target,
        old_role=WorkspaceMember.ROLE_ADMIN,
        new_role=target.role,
    )
    _audit_role_change(
        actor=request.user,
        workspace=workspace,
        member=me,
        old_role=WorkspaceMember.ROLE_OWNER,
        new_role=me.role,
    )

    return Response(
        {
            "new_owner_id": target.user_id,
            "old_owner_id": me.user_id,
            "old_owner_role": me.role,
        }
    )


def _audit_role_change(
    *, actor, workspace, member, old_role: str, new_role: str
) -> None:
    """Single source of truth for the workspace_member.role_change audit row."""
    from audit.models import AuditLog
    from audit.services import log as audit_log

    target_name = (
        member.user.get_full_name() if member.user_id else "(unknown user)"
    )
    audit_log(
        actor=actor,
        action=AuditLog.ACTION_MEMBER_ROLE_CHANGE,
        workspace=workspace,
        target_type="workspace_member",
        target_id=member.pk,
        summary=(
            f'Změnil roli {target_name}: {old_role} → {new_role}'
        ),
        payload={
            "user_id": member.user_id,
            "old_role": old_role,
            "new_role": new_role,
        },
    )


# ---------------------------------------------------------------------------
# Lidé CRM — workspace-scoped tags + per-person notes + CSV export
# ---------------------------------------------------------------------------


def _serialize_tag(t) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "color": t.color,
        "sort_order": t.sort_order,
    }


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def person_tags(request: Request, slug: str) -> Response:
    """List + create tags for a workspace's Lidé CRM."""
    try:
        workspace = Workspace.objects.get(slug=slug)
    except Workspace.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not _can_view_workspace_people(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    from .models import PersonTag

    if request.method == "GET":
        qs = PersonTag.objects.filter(workspace=workspace)
        return Response([_serialize_tag(t) for t in qs])

    # Create. Owner/admin only — co-creators are read-only on tags so
    # they can't pollute the workspace vocabulary.
    if not _is_owner(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)
    name = (request.data.get("name") or "").strip()
    if not name:
        return Response(
            {"name": "Tag musí mít název."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    color = (request.data.get("color") or "").strip()[:20]
    tag, created = PersonTag.objects.get_or_create(
        workspace=workspace,
        name=name[:40],
        defaults={"color": color},
    )
    return Response(
        _serialize_tag(tag),
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def person_tag_detail(request: Request, slug: str, tag_id: int) -> Response:
    """Rename / recolor / delete a tag. Owner/admin only.

    Deleting a tag drops it from everyone it was assigned to (cascade
    via the m2m through table); profiles + people stay untouched."""
    try:
        workspace = Workspace.objects.get(slug=slug)
    except Workspace.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not _is_owner(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    from .models import PersonTag

    try:
        tag = PersonTag.objects.get(pk=tag_id, workspace=workspace)
    except PersonTag.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "DELETE":
        tag.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if "name" in request.data:
        n = str(request.data["name"]).strip()
        if n:
            tag.name = n[:40]
    if "color" in request.data:
        tag.color = str(request.data["color"]).strip()[:20]
    if "sort_order" in request.data:
        with contextlib.suppress(TypeError, ValueError):
            tag.sort_order = int(request.data["sort_order"])
    tag.save()
    return Response(_serialize_tag(tag))


def _get_or_create_profile(workspace, user):
    """Profiles are lazy — create on first write only."""
    from .models import PersonProfile

    profile, _ = PersonProfile.objects.get_or_create(
        workspace=workspace, user=user
    )
    return profile


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def person_note(request: Request, slug: str, user_id: int) -> Response:
    """Set the free-text CRM note on a person within this workspace."""
    try:
        workspace = Workspace.objects.get(slug=slug)
    except Workspace.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not _can_view_workspace_people(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    from accounts.models import User

    try:
        person = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    profile = _get_or_create_profile(workspace, person)
    profile.note = str(request.data.get("note") or "")[:5000]
    profile.save(update_fields=["note", "updated_at"])
    return Response({"note": profile.note})


@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated])
def person_tag_assignment(
    request: Request, slug: str, user_id: int, tag_id: int
) -> Response:
    """Attach (POST) / detach (DELETE) one tag from one person."""
    try:
        workspace = Workspace.objects.get(slug=slug)
    except Workspace.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not _can_view_workspace_people(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    from accounts.models import User

    from .models import PersonTag

    try:
        person = User.objects.get(pk=user_id)
        tag = PersonTag.objects.get(pk=tag_id, workspace=workspace)
    except (User.DoesNotExist, PersonTag.DoesNotExist):
        return Response(status=status.HTTP_404_NOT_FOUND)

    profile = _get_or_create_profile(workspace, person)
    if request.method == "POST":
        profile.tags.add(tag)
    else:
        profile.tags.remove(tag)
    return Response({"tag_ids": list(profile.tags.values_list("id", flat=True))})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def workspace_members_csv(request: Request, slug: str):
    """CSV dump of the Lidé roster — owner-tooling for newsletter
    handoff, accounting, retention review. Includes note + tag names
    so the spreadsheet matches what the owner sees on screen."""
    import csv as _csv
    import io as _io

    from django.db.models import Count, Max
    from django.db.models import Q as DQ
    from django.http import HttpResponse
    from django.utils import timezone

    from accounts.models import User
    from events.models import RSVP, Event

    from .models import PersonProfile

    try:
        workspace = Workspace.objects.get(slug=slug)
    except Workspace.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not _can_view_workspace_people(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    event_ids = list(
        Event.objects.filter(
            DQ(workspace=workspace) | DQ(shared_workspaces=workspace)
        )
        .values_list("id", flat=True)
        .distinct()
    )
    now = timezone.now()
    role_user_ids = list(
        WorkspaceMember.objects.filter(workspace=workspace).values_list(
            "user_id", flat=True
        )
    )
    users = (
        User.objects.filter(
            DQ(rsvps__event_id__in=event_ids) | DQ(id__in=role_user_ids)
        )
        .exclude(rsvps__status=RSVP.STATUS_CANCELLED)
        .annotate(
            total_rsvps=Count("rsvps", filter=DQ(rsvps__event_id__in=event_ids)),
            upcoming_rsvps=Count(
                "rsvps",
                filter=DQ(
                    rsvps__event_id__in=event_ids,
                    rsvps__event__ends_at__gte=now,
                )
                & ~DQ(rsvps__status=RSVP.STATUS_CANCELLED),
            ),
            past_rsvps=Count(
                "rsvps",
                filter=DQ(
                    rsvps__event_id__in=event_ids,
                    rsvps__event__ends_at__lt=now,
                )
                & ~DQ(rsvps__status=RSVP.STATUS_CANCELLED),
            ),
            last_rsvp_at=Max("rsvps__created_at"),
        )
        .distinct()
        .order_by("-last_rsvp_at")
    )
    profiles = {
        p.user_id: p
        for p in PersonProfile.objects.filter(workspace=workspace).prefetch_related(
            "tags"
        )
    }
    role_by_user = dict(
        WorkspaceMember.objects.filter(workspace=workspace).values_list(
            "user_id", "role"
        )
    )

    buf = _io.StringIO()
    # Excel-friendly BOM so the UTF-8 column with diacritics renders
    # right when the owner double-clicks the file on macOS / Windows.
    buf.write("﻿")
    w = _csv.writer(buf)
    w.writerow(
        [
            "Jméno",
            "E-mail",
            "Telefon",
            "Role",
            "Akcí celkem",
            "Nadcházejících",
            "Minulých",
            "Poslední registrace",
            "Tagy",
            "Poznámka",
        ]
    )
    for u in users:
        profile = profiles.get(u.id)
        tag_names = (
            ", ".join(t.name for t in profile.tags.all()) if profile else ""
        )
        note = profile.note if profile else ""
        last = u.last_rsvp_at.strftime("%Y-%m-%d") if u.last_rsvp_at else ""
        w.writerow(
            [
                u.get_full_name() or "",
                u.email,
                u.phone or "",
                role_by_user.get(u.id, ""),
                u.total_rsvps,
                u.upcoming_rsvps,
                u.past_rsvps,
                last,
                tag_names,
                note.replace("\n", " ").strip(),
            ]
        )

    filename = f"lide-{workspace.slug}-{timezone.now():%Y-%m-%d}.csv"
    response = HttpResponse(buf.getvalue(), content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


# ---------------------------------------------------------------------------
# Fio bank reconciliation (V1.5 — replaces "Označit zaplaceno" manual flow)
# ---------------------------------------------------------------------------


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def workspace_members_bulk_email(
    request: Request, slug: str
) -> Response:
    """Owner-only: send one e-mail to a curated subset of the Lidé roster.

    Body: {user_ids: int[], subject: str, body: str}.

    Each recipient gets their own message (separate To: header) so they
    don't see each other's addresses. The owner is set as Reply-To so
    replies go back to them, not to the platform inbox.

    Bounded to people who already RSVPed to (or hold a role in) this
    workspace — same surface the Lidé endpoint exposes — so owners
    can't spray to arbitrary user ids.
    """
    from django.db.models import Q as DQ

    from accounts.models import User
    from events.models import RSVP, Event

    try:
        workspace = Workspace.objects.get(slug=slug)
    except Workspace.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not _is_owner(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    user_ids = request.data.get("user_ids")
    subject = (request.data.get("subject") or "").strip()
    body = (request.data.get("body") or "").strip()
    if not isinstance(user_ids, list) or not user_ids:
        return Response(
            {"user_ids": "Vyber alespoň jednoho člověka."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not subject:
        return Response(
            {"subject": "Vyplň předmět."}, status=status.HTTP_400_BAD_REQUEST
        )
    if not body:
        return Response(
            {"body": "Vyplň text e-mailu."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    # Safety cap — owner sprays to a huge selection would be both a
    # spam vector and a tarpit for the worker. 200 is well above any
    # real OLAF community size for V1.
    if len(user_ids) > 200:
        return Response(
            {"user_ids": "Max 200 příjemců na jedno odeslání."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Roster scope mirrors workspace_members — anyone who's RSVPed
    # to an event in this workspace OR holds a role.
    event_ids = list(
        Event.objects.filter(
            DQ(workspace=workspace) | DQ(shared_workspaces=workspace)
        ).values_list("id", flat=True).distinct()
    )
    role_user_ids = list(
        WorkspaceMember.objects.filter(workspace=workspace).values_list(
            "user_id", flat=True
        )
    )
    eligible_ids = set(
        User.objects.filter(
            DQ(rsvps__event_id__in=event_ids) | DQ(id__in=role_user_ids)
        )
        .exclude(rsvps__status=RSVP.STATUS_CANCELLED)
        .values_list("id", flat=True)
        .distinct()
    )

    sent = 0
    skipped = 0
    author_name = request.user.get_full_name() or request.user.email
    reply_to = [request.user.email] if request.user.email else None
    # Owner's free-form body je vsazen do branded HTML šablony
    # (workspace_broadcast). Reply-To míří zpět na ownera tak že
    # případné odpovědi nelandnou na platform inbox.
    from notifications.email_sender import send_branded_email

    for uid in user_ids:
        try:
            uid_int = int(uid)
        except (TypeError, ValueError):
            skipped += 1
            continue
        if uid_int not in eligible_ids:
            skipped += 1
            continue
        try:
            recipient = User.objects.get(pk=uid_int)
        except User.DoesNotExist:
            skipped += 1
            continue
        if not recipient.email:
            skipped += 1
            continue
        try:
            send_branded_email(
                subject=subject,
                template_base="emails/workspace_broadcast",
                context={
                    "subject": subject,
                    "body": body,
                    "author_name": author_name,
                    "workspace": workspace,
                },
                recipient_list=[recipient.email],
                reply_to=reply_to,
                fail_silently=True,
            )
            sent += 1
        except Exception:
            skipped += 1

    return Response({"sent": sent, "skipped": skipped})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def workspace_payments_reconcile(request: Request, slug: str) -> Response:
    """Upload a Fio bank CSV ("Stažení v CSV") and auto-mark every
    matched RSVP as paid. Returns a summary so the owner can see what
    landed + what still needs manual handling.

    Permissions: workspace owner/admin only — manipulating payment
    state isn't something co-creators should do.
    """
    try:
        workspace = Workspace.objects.get(slug=slug)
    except Workspace.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not _is_owner(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    upload = request.FILES.get("file")
    if upload is None:
        return Response(
            {"file": "Nahraj CSV výpis z Fia (Účet → Stažení v CSV)."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if upload.size > 4 * 1024 * 1024:
        return Response(
            {"file": "Výpis je moc velký (max 4 MB)."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    from events.payments_reconcile import reconcile_workspace

    result = reconcile_workspace(workspace=workspace, csv_content=upload.read())

    def _tx_dict(tx):
        return {
            "date": tx.when.isoformat() if tx.when else None,
            "amount": str(tx.amount),
            "variable_symbol": tx.variable_symbol,
            "message": tx.message,
            "counterparty": tx.counterparty,
        }

    return Response(
        {
            "total_rows": result.total_rows,
            "credits": result.credits,
            "matched": [
                {
                    "tx": _tx_dict(m.tx),
                    "rsvp_id": m.rsvp_id,
                    "event_title": m.event_title,
                    "user_full_name": m.user_full_name,
                    "user_email": m.user_email,
                    "amount_mismatch": m.amount_mismatch,
                }
                for m in result.matched
            ],
            "unmatched": [_tx_dict(t) for t in result.unmatched],
            "already_paid": [_tx_dict(t) for t in result.already_paid],
        }
    )


# ---------------------------------------------------------------------------
# Workspace invitations — three ways to add a person to a komunita
# ---------------------------------------------------------------------------


def _frontend_base() -> str:
    from django.conf import settings as _s
    return getattr(_s, "FRONTEND_URL", "http://localhost:3000").rstrip("/")


def _send_workspace_invitation_email(invitation):
    """Best-effort: send the e-mail, never let it crash the request."""
    from notifications.email_sender import send_branded_email

    accept_url = f"{_frontend_base()}/invitations/{invitation.token}"
    with contextlib.suppress(Exception):
        send_branded_email(
            subject=f"Pozvánka do komunity {invitation.workspace.name} — olaf",
            template_base="emails/workspace_invitation",
            context={
                "invitation": invitation,
                "workspace": invitation.workspace,
                "accept_url": accept_url,
                "invited_by_name": (
                    invitation.invited_by.get_full_name()
                    if invitation.invited_by
                    else ""
                ),
            },
            recipient_list=[invitation.email],
            fail_silently=True,
        )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def workspace_add_existing_member(request: Request, slug: str) -> Response:
    """Owner picks one or more existing users and adds them as members.

    Body:
      - `{user_id: int}` — single add (legacy single-row flow)
      - `{user_ids: [int]}` — bulk add (V2 "Přidat do komunity" multi-select)
      - both can carry `role` ("member" | "admin"); default is member.

    Idempotent per user:
      - missing row → create WorkspaceMember(role=<asked>, status=active)
      - active row with member role + asked admin → promote (member → admin)
      - removed row → reactivate (status=active, joined_at=now)
      - owner row → untouched
    Owner-only.
    """
    from django.utils import timezone

    from accounts.models import User

    try:
        workspace = Workspace.objects.get(slug=slug)
    except Workspace.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not _is_owner(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    # Accept single or bulk id list. We never silently mix: caller
    # sends one shape or the other.
    raw_single = request.data.get("user_id")
    raw_bulk = request.data.get("user_ids")
    if raw_single is None and not raw_bulk:
        return Response(
            {"user_ids": "Pošli user_id nebo neprázdné user_ids."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    raw_ids = raw_bulk if raw_bulk else [raw_single]
    try:
        user_ids = [int(x) for x in raw_ids]
    except (TypeError, ValueError):
        return Response(
            {"user_ids": "Hodnoty musí být celá čísla."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    requested_role = (request.data.get("role") or "").strip().lower()
    role = (
        WorkspaceMember.ROLE_ADMIN
        if requested_role == WorkspaceMember.ROLE_ADMIN
        else WorkspaceMember.ROLE_MEMBER
    )

    users_by_id = {u.id: u for u in User.objects.filter(id__in=user_ids)}
    not_found = [uid for uid in user_ids if uid not in users_by_id]

    now = timezone.now()
    added: list[int] = []
    reactivated: list[int] = []
    promoted: list[int] = []
    already_active: list[int] = []

    for uid, user in users_by_id.items():
        membership, created = WorkspaceMember.objects.get_or_create(
            workspace=workspace,
            user=user,
            defaults={
                "role": role,
                "status": WorkspaceMember.STATUS_ACTIVE,
                "joined_at": now,
            },
        )
        if created:
            added.append(uid)
            continue
        # Never demote owner via this path.
        if membership.role == WorkspaceMember.ROLE_OWNER:
            already_active.append(uid)
            continue
        changed_fields: list[str] = []
        if membership.status == WorkspaceMember.STATUS_REMOVED:
            membership.status = WorkspaceMember.STATUS_ACTIVE
            membership.joined_at = now
            changed_fields.extend(["status", "joined_at"])
            reactivated.append(uid)
        # Allow upgrade from member → admin (legacy promote-via-add flow).
        if (
            membership.role == WorkspaceMember.ROLE_MEMBER
            and role == WorkspaceMember.ROLE_ADMIN
        ):
            membership.role = WorkspaceMember.ROLE_ADMIN
            changed_fields.append("role")
            promoted.append(uid)
        if changed_fields:
            membership.save(update_fields=changed_fields)
        elif uid not in reactivated:
            already_active.append(uid)

    if added or reactivated:
        _audit_membership_change(
            actor=request.user,
            workspace=workspace,
            action="add",
            added_user_ids=added + reactivated,
        )

    # Legacy single-user shape: keep the original response when the
    # caller used `user_id` so existing frontend code doesn't break.
    if raw_single is not None and raw_bulk is None:
        if not_found:
            return Response(status=status.HTTP_404_NOT_FOUND)
        target_id = user_ids[0]
        membership = WorkspaceMember.objects.get(
            workspace=workspace, user_id=target_id
        )
        return Response(
            {
                "user_id": target_id,
                "role": membership.role,
                "created": target_id in added,
            },
            status=(
                status.HTTP_201_CREATED
                if target_id in added
                else status.HTTP_200_OK
            ),
        )

    return Response(
        {
            "added": added,
            "reactivated": reactivated,
            "promoted": promoted,
            "already_active": already_active,
            "not_found": not_found,
        }
    )


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def workspace_invitations(request: Request, slug: str) -> Response:
    """List pending invitations or create a new one for an e-mail.

    If the e-mail already belongs to a registered user, we skip the
    invitation flow entirely and add them as a member directly — the
    owner doesn't need to wait for the recipient to click an e-mail
    link they could've avoided."""
    from .models import WorkspaceInvitation

    try:
        workspace = Workspace.objects.get(slug=slug)
    except Workspace.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not _is_owner(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    if request.method == "GET":
        qs = WorkspaceInvitation.objects.filter(
            workspace=workspace, status=WorkspaceInvitation.STATUS_PENDING
        ).select_related("invited_by")
        return Response(
            [
                {
                    "id": inv.id,
                    "email": inv.email,
                    "status": inv.status,
                    "invited_by_name": (
                        inv.invited_by.get_full_name() if inv.invited_by else ""
                    ),
                    "created_at": inv.created_at,
                }
                for inv in qs
            ]
        )

    email = (request.data.get("email") or "").strip().lower()
    if not email or "@" not in email:
        return Response(
            {"email": "Zadej platný e-mail."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Caller-chosen role — admin or member. Owner never assignable here.
    requested_role = (request.data.get("role") or "").strip().lower()
    role = (
        WorkspaceMember.ROLE_ADMIN
        if requested_role == WorkspaceMember.ROLE_ADMIN
        else WorkspaceMember.ROLE_MEMBER
    )

    # Short-circuit: if a user with this e-mail already exists, just
    # add them. No invitation needed.
    from accounts.models import User

    existing = User.objects.filter(email__iexact=email).first()
    if existing is not None:
        membership, created = WorkspaceMember.objects.get_or_create(
            workspace=workspace,
            user=existing,
            defaults={"role": role},
        )
        if not created and membership.role == WorkspaceMember.ROLE_MEMBER and role == WorkspaceMember.ROLE_ADMIN:
            membership.role = role
            membership.save(update_fields=["role"])
        return Response(
            {
                "mode": "direct",
                "user_id": existing.id,
                "role": membership.role,
                "created": created,
            },
            status=status.HTTP_201_CREATED,
        )

    # New e-mail → invitation flow. Encode the requested role into the
    # invitation so it sticks when the recipient accepts.
    invitation, created = WorkspaceInvitation.objects.get_or_create(
        workspace=workspace,
        email=email,
        status=WorkspaceInvitation.STATUS_PENDING,
        defaults={"invited_by": request.user, "role": role},
    )
    if created:
        _send_workspace_invitation_email(invitation)
    return Response(
        {
            "mode": "invited",
            "id": invitation.id,
            "email": invitation.email,
            "status": invitation.status,
            "created_at": invitation.created_at,
        },
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def workspace_invitations_bulk(request: Request, slug: str) -> Response:
    """Bulk-invite many e-mails in one call.

    Body: { "entries": [{ "email": "...", "role"?: "member|admin" }, ...] }
       or { "emails": "one per line, comma-separated also ok" }
       with optional top-level "role" applied to every row that
       doesn't have its own.

    Each row runs the same logic as the single-invite endpoint:
    existing user → added as member directly; new e-mail →
    invitation row + e-mail. Idempotent — re-uploading the same
    list is a no-op (pending invitation already exists).

    Returns per-row results so the UI can render:
      added: existing users added directly
      invited: new pending invitations
      already_member: noop (already in workspace)
      already_invited: noop (pending invitation already exists)
      invalid: rejected (bad format)
    """
    from accounts.models import User

    from .models import WorkspaceInvitation

    try:
        workspace = Workspace.objects.get(slug=slug)
    except Workspace.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not _is_owner(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    default_role_raw = (request.data.get("role") or "").strip().lower()
    default_role = (
        WorkspaceMember.ROLE_ADMIN
        if default_role_raw == WorkspaceMember.ROLE_ADMIN
        else WorkspaceMember.ROLE_MEMBER
    )

    raw_entries: list[dict] = []
    if isinstance(request.data.get("entries"), list):
        for row in request.data["entries"]:
            if isinstance(row, dict):
                raw_entries.append(row)
            elif isinstance(row, str):
                raw_entries.append({"email": row})
    elif isinstance(request.data.get("emails"), str):
        # Free-form textarea blob — split on newlines, commas, semicolons.
        import re

        for chunk in re.split(r"[\n,;]+", request.data["emails"]):
            chunk = chunk.strip()
            if chunk:
                raw_entries.append({"email": chunk})

    if not raw_entries:
        return Response(
            {
                "detail": "Body needs 'entries' (list) or 'emails' (string).",
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    added: list[dict] = []
    invited: list[dict] = []
    already_member: list[str] = []
    already_invited: list[str] = []
    invalid: list[dict] = []
    seen: set[str] = set()

    from django.core.exceptions import ValidationError
    from django.core.validators import validate_email

    for entry in raw_entries:
        email = (entry.get("email") or "").strip().lower()
        try:
            validate_email(email)
        except ValidationError:
            invalid.append({"email": email, "reason": "bad-format"})
            continue
        if email in seen:
            # Same e-mail typed twice in one upload — treat the second
            # occurrence as a no-op so counts don't double up.
            continue
        seen.add(email)

        row_role_raw = (entry.get("role") or "").strip().lower()
        role = (
            WorkspaceMember.ROLE_ADMIN
            if row_role_raw == WorkspaceMember.ROLE_ADMIN
            else default_role
        )

        existing = User.objects.filter(email__iexact=email).first()
        if existing is not None:
            membership, created = WorkspaceMember.objects.get_or_create(
                workspace=workspace,
                user=existing,
                defaults={"role": role},
            )
            if created:
                added.append({"email": email, "role": membership.role})
            elif (
                membership.role == WorkspaceMember.ROLE_MEMBER
                and role == WorkspaceMember.ROLE_ADMIN
            ):
                # Bump existing member to admin — useful on re-upload
                # when the role column changed.
                membership.role = role
                membership.save(update_fields=["role"])
                added.append({"email": email, "role": membership.role})
            else:
                already_member.append(email)
            continue

        invitation, created = WorkspaceInvitation.objects.get_or_create(
            workspace=workspace,
            email=email,
            status=WorkspaceInvitation.STATUS_PENDING,
            defaults={"invited_by": request.user, "role": role},
        )
        if created:
            _send_workspace_invitation_email(invitation)
            invited.append({"email": email, "id": invitation.id})
        else:
            already_invited.append(email)

    return Response(
        {
            "added": added,
            "invited": invited,
            "already_member": already_member,
            "already_invited": already_invited,
            "invalid": invalid,
            "total_processed": (
                len(added)
                + len(invited)
                + len(already_member)
                + len(already_invited)
                + len(invalid)
            ),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def workspace_invitation_detail(
    request: Request, slug: str, invitation_id: int
) -> Response:
    """Cancel a pending invitation. Owner-only."""
    from .models import WorkspaceInvitation

    try:
        workspace = Workspace.objects.get(slug=slug)
        invitation = WorkspaceInvitation.objects.get(
            pk=invitation_id, workspace=workspace
        )
    except (Workspace.DoesNotExist, WorkspaceInvitation.DoesNotExist):
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not _is_owner(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    if invitation.status == WorkspaceInvitation.STATUS_PENDING:
        invitation.status = WorkspaceInvitation.STATUS_CANCELLED
        invitation.save(update_fields=["status"])
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET", "POST", "DELETE"])
@permission_classes([IsAuthenticated])
def workspace_invite_link(request: Request, slug: str) -> Response:
    """Manage the workspace's public invite link.

    GET → returns current token (empty when disabled).
    POST → generates a fresh token (rotating any previous one).
    DELETE → disables the link (clears the token)."""
    import secrets

    try:
        workspace = Workspace.objects.get(slug=slug)
    except Workspace.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not _is_owner(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    base = _frontend_base()

    if request.method == "DELETE":
        workspace.public_invite_token = ""
        workspace.save(update_fields=["public_invite_token"])
        return Response({"public_invite_token": "", "invite_url": ""})

    if request.method == "POST":
        # Generate a fresh url-safe token (rotating any previous).
        workspace.public_invite_token = secrets.token_urlsafe(20)[:32]
        workspace.save(update_fields=["public_invite_token"])

    return Response(
        {
            "public_invite_token": workspace.public_invite_token,
            "invite_url": (
                f"{base}/join/{workspace.public_invite_token}"
                if workspace.public_invite_token
                else ""
            ),
        }
    )


# ---------------------------------------------------------------------------
# Public-facing invitation accept endpoints
# ---------------------------------------------------------------------------


@api_view(["GET"])
@permission_classes([AllowAny])
def invitation_lookup(request: Request, token: str) -> Response:
    """Public lookup of an e-mail invitation by token.

    Returns workspace info + invited e-mail so the accept page can
    render branded copy + check whether the caller's session matches
    the invited e-mail."""
    from .models import WorkspaceInvitation

    try:
        invitation = WorkspaceInvitation.objects.select_related(
            "workspace", "invited_by"
        ).get(token=token)
    except WorkspaceInvitation.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    return Response(
        {
            "email": invitation.email,
            "status": invitation.status,
            "workspace": {
                "slug": invitation.workspace.slug,
                "name": invitation.workspace.name,
                "bio": invitation.workspace.bio,
            },
            "invited_by_name": (
                invitation.invited_by.get_full_name()
                if invitation.invited_by
                else ""
            ),
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def invitation_accept(request: Request, token: str) -> Response:
    """Accept an e-mail invitation. Auth required (sign up first if no
    account). The invitation's e-mail must match the authenticated user
    so an invite link can't be redirected to someone else."""
    from .models import WorkspaceInvitation

    try:
        invitation = WorkspaceInvitation.objects.select_related(
            "workspace"
        ).get(token=token)
    except WorkspaceInvitation.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if invitation.status != WorkspaceInvitation.STATUS_PENDING:
        return Response(
            {"detail": "Pozvánka už není platná."},
            status=status.HTTP_410_GONE,
        )

    if request.user.email.lower() != invitation.email.lower():
        return Response(
            {
                "detail": (
                    "Pozvánka byla zaslána na jiný e-mail. Přihlas se "
                    f"jako {invitation.email}."
                )
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    from django.utils import timezone as _tz

    WorkspaceMember.objects.get_or_create(
        workspace=invitation.workspace,
        user=request.user,
        defaults={"role": invitation.role},
    )
    invitation.status = WorkspaceInvitation.STATUS_ACCEPTED
    invitation.accepted_at = _tz.now()
    invitation.accepted_by = request.user
    invitation.save(
        update_fields=["status", "accepted_at", "accepted_by"]
    )
    return Response({"workspace_slug": invitation.workspace.slug})


@api_view(["GET"])
@permission_classes([AllowAny])
def public_invite_lookup(request: Request, token: str) -> Response:
    """Public lookup by workspace.public_invite_token — used by /join/<token>."""
    try:
        workspace = Workspace.objects.get(public_invite_token=token)
    except Workspace.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    return Response(
        {
            "workspace": {
                "slug": workspace.slug,
                "name": workspace.name,
                "bio": workspace.bio,
            }
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def public_invite_accept(request: Request, token: str) -> Response:
    """Self-join via a public invite link. No approval step in V1."""
    try:
        workspace = Workspace.objects.get(public_invite_token=token)
    except Workspace.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    membership, created = WorkspaceMember.objects.get_or_create(
        workspace=workspace,
        user=request.user,
        defaults={"role": WorkspaceMember.ROLE_MEMBER},
    )
    return Response(
        {
            "workspace_slug": workspace.slug,
            "role": membership.role,
            "created": created,
        }
    )
