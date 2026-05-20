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
                "note": (
                    profiles_by_user[u.id].note
                    if u.id in profiles_by_user
                    else ""
                ),
                "tag_ids": (
                    [t.id for t in profiles_by_user[u.id].tags.all()]
                    if u.id in profiles_by_user
                    else []
                ),
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
    from django.conf import settings as _s
    from django.core.mail import EmailMessage
    from django.template.loader import render_to_string

    accept_url = f"{_frontend_base()}/invitations/{invitation.token}"
    body = render_to_string(
        "emails/workspace_invitation.txt",
        {
            "invitation": invitation,
            "workspace": invitation.workspace,
            "accept_url": accept_url,
            "invited_by_name": (
                invitation.invited_by.get_full_name()
                if invitation.invited_by
                else ""
            ),
        },
    )
    with contextlib.suppress(Exception):
        EmailMessage(
            subject=f"Pozvánka do komunity {invitation.workspace.name} — olaf",
            body=body,
            from_email=getattr(_s, "DEFAULT_FROM_EMAIL", "olaf@olaf.events"),
            to=[invitation.email],
        ).send(fail_silently=True)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def workspace_add_existing_member(request: Request, slug: str) -> Response:
    """Path 3 — owner picks an existing user (typically from Lidé) and
    adds them as a regular member. Body: {user_id: int}."""
    try:
        workspace = Workspace.objects.get(slug=slug)
    except Workspace.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not _is_owner(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    from accounts.models import User

    user_id = request.data.get("user_id")
    if not user_id:
        return Response(
            {"user_id": "Vyber uživatele."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        target = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    # Caller can choose admin or member. Owner role is never assignable
    # via this path — that's the hand-over endpoint's job.
    requested_role = (request.data.get("role") or "").strip().lower()
    role = (
        WorkspaceMember.ROLE_ADMIN
        if requested_role == WorkspaceMember.ROLE_ADMIN
        else WorkspaceMember.ROLE_MEMBER
    )
    membership, created = WorkspaceMember.objects.get_or_create(
        workspace=workspace, user=target, defaults={"role": role}
    )
    # If they already exist with a different role, allow upgrade from
    # member → admin (but never touch owner).
    if not created and membership.role == WorkspaceMember.ROLE_MEMBER and role == WorkspaceMember.ROLE_ADMIN:
        membership.role = role
        membership.save(update_fields=["role"])
    return Response(
        {
            "user_id": target.id,
            "role": membership.role,
            "created": created,
        },
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
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
