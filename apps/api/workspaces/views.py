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
    if not user or not user.is_authenticated:
        return False
    return WorkspaceMember.objects.filter(
        workspace=workspace, user=user, role=WorkspaceMember.ROLE_OWNER
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
def my_workspaces(request: Request) -> Response:
    """Workspaces the current user belongs to (any role).

    Returns workspace data + the viewer's role on each (so the frontend
    can show owner controls without a second request).
    """
    memberships = (
        WorkspaceMember.objects.filter(user=request.user)
        .select_related("workspace")
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

    qs = Event.objects.filter(workspace=workspace).select_related("workspace")
    if viewer_role is None:
        qs = qs.exclude(status=Event.STATUS_DRAFT)
    qs = qs.order_by("-starts_at")
    return Response(EventSummarySerializer(qs, many=True).data)
