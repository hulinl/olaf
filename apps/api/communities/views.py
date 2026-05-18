"""Community endpoints — list/CRUD for workspace owners + roster + invite."""
from __future__ import annotations

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from accounts.models import User
from events.permissions import is_workspace_owner
from workspaces.models import Workspace

from .models import Community, CommunityMember
from .serializers import CommunityMemberSerializer, CommunitySerializer


def _workspace_or_404(slug: str):
    try:
        return Workspace.objects.get(slug=slug), None
    except Workspace.DoesNotExist:
        return None, Response(status=status.HTTP_404_NOT_FOUND)


def _community_or_404(workspace_slug: str, community_slug: str):
    try:
        return (
            Community.objects.select_related("workspace").get(
                workspace__slug=workspace_slug, slug=community_slug
            ),
            None,
        )
    except Community.DoesNotExist:
        return None, Response(status=status.HTTP_404_NOT_FOUND)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def workspace_communities(request: Request, workspace_slug: str) -> Response:
    """List communities in a workspace + create new (owner-only)."""
    workspace, err = _workspace_or_404(workspace_slug)
    if err:
        return err

    if request.method == "GET":
        qs = Community.objects.filter(workspace=workspace)
        return Response(CommunitySerializer(qs, many=True).data)

    if not is_workspace_owner(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    serializer = CommunitySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    slug = serializer.validated_data["slug"]
    if Community.objects.filter(workspace=workspace, slug=slug).exists():
        return Response(
            {"slug": "Komunita s tímto slug už ve workspace existuje."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    community = serializer.save(workspace=workspace)
    return Response(
        CommunitySerializer(community).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def community_detail(
    request: Request, workspace_slug: str, community_slug: str
) -> Response:
    """Retrieve / update / delete a single community."""
    community, err = _community_or_404(workspace_slug, community_slug)
    if err:
        return err

    if request.method == "GET":
        return Response(CommunitySerializer(community).data)

    if not is_workspace_owner(request.user, community.workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    if request.method == "DELETE":
        community.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = CommunitySerializer(community, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    new_slug = serializer.validated_data.get("slug")
    if (
        new_slug
        and new_slug != community.slug
        and Community.objects.filter(workspace=community.workspace, slug=new_slug)
        .exclude(pk=community.pk)
        .exists()
    ):
        return Response(
            {"slug": "Komunita s tímto slug už ve workspace existuje."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    community = serializer.save()
    return Response(CommunitySerializer(community).data)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def community_members(
    request: Request, workspace_slug: str, community_slug: str
) -> Response:
    """List members + bulk invite via paste-emails (owner-only)."""
    community, err = _community_or_404(workspace_slug, community_slug)
    if err:
        return err

    if not is_workspace_owner(request.user, community.workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    if request.method == "GET":
        qs = community.memberships.select_related("user").all()
        return Response(CommunityMemberSerializer(qs, many=True).data)

    raw_emails = request.data.get("emails", "")
    if not isinstance(raw_emails, str) or not raw_emails.strip():
        return Response(
            {"emails": "Vlož aspoň jeden email (po jednom na řádek nebo oddělené čárkou)."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    candidates = [
        e.strip().lower()
        for e in raw_emails.replace(",", "\n").splitlines()
        if e.strip()
    ]

    created: list[CommunityMember] = []
    skipped_existing: list[str] = []
    not_found_users: list[str] = []

    for email in candidates:
        try:
            user = User.objects.get(email__iexact=email)
        except User.DoesNotExist:
            # V1: invite-by-email-without-prior-account is deferred. PRD §4.4
            # mentions "emailed invite link" — that needs a token model. For
            # now surface unmatched emails so owner can chase them manually.
            not_found_users.append(email)
            continue

        existing = community.memberships.filter(user=user).first()
        if existing:
            skipped_existing.append(email)
            continue

        member = CommunityMember.objects.create(
            community=community,
            user=user,
            status=CommunityMember.STATUS_MEMBER,
            decided_at=timezone.now(),
        )
        created.append(member)

    return Response(
        {
            "added": CommunityMemberSerializer(created, many=True).data,
            "skipped_already_member": skipped_existing,
            "no_account_yet": not_found_users,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def community_member_detail(
    request: Request,
    workspace_slug: str,
    community_slug: str,
    member_id: int,
) -> Response:
    """Remove a member from a community (owner-only)."""
    community, err = _community_or_404(workspace_slug, community_slug)
    if err:
        return err
    if not is_workspace_owner(request.user, community.workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    try:
        member = community.memberships.get(pk=member_id)
    except CommunityMember.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    member.status = CommunityMember.STATUS_REMOVED
    member.decided_at = timezone.now()
    member.save(update_fields=["status", "decided_at"])
    return Response(status=status.HTTP_204_NO_CONTENT)
