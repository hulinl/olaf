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

    if file_field:
        file_field.delete(save=False)
    setattr(workspace, field, upload)
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
    """List participants who have at least one RSVP in this workspace's events.

    "Member" in V1 = anyone who's registered for an event the workspace
    owns (or shares — Slice 3). Owner-only because it includes email + phone.
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

    if not _is_owner(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    event_ids = list(
        Event.objects.filter(
            DQ(workspace=workspace) | DQ(shared_workspaces=workspace)
        )
        .values_list("id", flat=True)
        .distinct()
    )

    now = timezone.now()
    # Roster = people who have RSVPed OR who hold an explicit role
    # (owner / admin). The role-only case matters now that the owner
    # can promote anyone to admin — their roster row needs to render
    # even before they RSVP to anything.
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

    # Bolt the workspace role onto each row so the UI can render
    # owner / admin badges + the right action buttons. None = plain
    # RSVPing participant with no explicit membership.
    member_roles = dict(
        WorkspaceMember.objects.filter(workspace=workspace).values_list(
            "user_id", "role"
        )
    )

    return Response(
        [
            {
                "id": u.id,
                "email": u.email,
                "first_name": u.first_name,
                "last_name": u.last_name,
                "full_name": u.get_full_name(),
                "phone": u.phone,
                "total_rsvps": u.total_rsvps,
                "upcoming_rsvps": u.upcoming_rsvps,
                "past_rsvps": u.past_rsvps,
                "last_rsvp_at": u.last_rsvp_at,
                "role": member_roles.get(u.id),
            }
            for u in users
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
        member.role = WorkspaceMember.ROLE_ADMIN
        member.save(update_fields=["role"])
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
        member.role = WorkspaceMember.ROLE_MEMBER
        member.save(update_fields=["role"])
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

    return Response(
        {
            "new_owner_id": target.user_id,
            "old_owner_id": me.user_id,
            "old_owner_role": me.role,
        }
    )
