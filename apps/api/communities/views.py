"""Community endpoints — list/CRUD for workspace owners + roster + invite."""
from __future__ import annotations

import contextlib

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from accounts.models import User
from events.permissions import is_workspace_owner
from workspaces.models import Workspace

from .models import Community, CommunityMember
from .permissions import (
    can_change_role,
    can_manage_community,
    can_remove_member,
)
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
@permission_classes([AllowAny])
def community_detail(
    request: Request, workspace_slug: str, community_slug: str
) -> Response:
    """Retrieve / update / delete a single community.

    GET je otevřený anonymnímu uživateli pro `visibility in {public,
    unlisted}` — potřebuje to public landing page (`/<ws>/k/<c>`). Pro
    private komunity a anon usera vracíme 404 (tzn. neexistuje pro tebe),
    ať neúmyslně nepotvrzujeme existenci privátních komunit.

    PATCH/DELETE stále vyžadují auth + can_manage_community /
    workspace-owner gate. AllowAny na dekorátoru → permission gate je
    v těle metody podle akce."""
    community, err = _community_or_404(workspace_slug, community_slug)
    if err:
        return err

    if request.method == "GET":
        # Anonymous can see public/unlisted only. Private komunita se
        # anonymu tváří jako 404 (soft-hide).
        if community.visibility == Community.VISIBILITY_PRIVATE and (
            not request.user.is_authenticated
            or not can_manage_community(request.user, community)
        ):
            # Members of a private community by měli vidět svou komunitu
            # taky přes tenhle endpoint (dashboard fetch). Když je auth
            # user aktivní member → povolit read.
            if not request.user.is_authenticated:
                return Response(status=status.HTTP_404_NOT_FOUND)
            is_member = CommunityMember.objects.filter(
                community=community,
                user=request.user,
                status=CommunityMember.STATUS_MEMBER,
            ).exists()
            if not is_member:
                return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(
            CommunitySerializer(community, context={"request": request}).data
        )

    # Write akce potřebují auth.
    if not request.user.is_authenticated:
        return Response(status=status.HTTP_401_UNAUTHORIZED)

    # DELETE je destructive — drží se na úrovni workspace ownera, ne
    # community admina. Community admin smí editovat, ne mazat celou
    # komunitu (např. omylem klikne ten správný button).
    if request.method == "DELETE":
        if not is_workspace_owner(request.user, community.workspace):
            return Response(status=status.HTTP_403_FORBIDDEN)
        community.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # PATCH — edit profilu — community admin smí.
    if not can_manage_community(request.user, community):
        return Response(status=status.HTTP_403_FORBIDDEN)

    serializer = CommunitySerializer(
        community, data=request.data, partial=True, context={"request": request}
    )
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
    return Response(
        CommunitySerializer(community, context={"request": request}).data
    )


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def community_members(
    request: Request, workspace_slug: str, community_slug: str
) -> Response:
    """List members + bulk invite via paste-emails (owner-only)."""
    community, err = _community_or_404(workspace_slug, community_slug)
    if err:
        return err

    if not can_manage_community(request.user, community):
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
    """Remove a member from a community.

    Workspace owner/admin: anyone.
    Community admin: only non-admin members (must demote first).
    """
    community, err = _community_or_404(workspace_slug, community_slug)
    if err:
        return err

    try:
        member = community.memberships.get(pk=member_id)
    except CommunityMember.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not can_remove_member(request.user, member):
        return Response(status=status.HTTP_403_FORBIDDEN)

    member.status = CommunityMember.STATUS_REMOVED
    member.decided_at = timezone.now()
    member.save(update_fields=["status", "decided_at"])
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def community_member_role(
    request: Request,
    workspace_slug: str,
    community_slug: str,
    member_id: int,
) -> Response:
    """Promote / demote a member's role in this community.

    Body: `{"role": "admin"}` or `{"role": "member"}`.

    Permission rules in `permissions.can_change_role`. Returns 403 with
    a localized `detail` when denied (e.g. last admin self-demote).
    """
    community, err = _community_or_404(workspace_slug, community_slug)
    if err:
        return err

    try:
        member = community.memberships.select_related("user").get(pk=member_id)
    except CommunityMember.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    new_role = request.data.get("role")
    if new_role not in (
        CommunityMember.ROLE_ADMIN,
        CommunityMember.ROLE_MEMBER,
    ):
        return Response(
            {"role": 'Role musí být "admin" nebo "member".'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    allowed, reason = can_change_role(request.user, member, new_role)
    if not allowed:
        return Response(
            {"detail": reason}, status=status.HTTP_403_FORBIDDEN
        )

    if member.role == new_role:
        # Idempotent — no state change, no audit row.
        return Response(CommunityMemberSerializer(member).data)

    old_role = member.role
    member.role = new_role
    member.save(update_fields=["role"])

    from audit.models import AuditLog
    from audit.services import log as audit_log

    audit_log(
        actor=request.user,
        action=AuditLog.ACTION_COMMUNITY_MEMBER_ROLE_CHANGE,
        workspace=community.workspace,
        target_type="community_member",
        target_id=member.pk,
        summary=(
            ('Povýšil' if new_role == CommunityMember.ROLE_ADMIN else 'Snížil')
            + f' {member.user.get_full_name() or member.user.email} '
            + f'v komunitě „{community.name}" na '
            + ('admina.' if new_role == CommunityMember.ROLE_ADMIN else 'člena.')
        ),
        payload={
            "community_id": community.pk,
            "community_slug": community.slug,
            "old_role": old_role,
            "new_role": new_role,
        },
    )
    return Response(CommunityMemberSerializer(member).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def community_join(
    request: Request, workspace_slug: str, community_slug: str
) -> Response:
    """Public community join request.

    Any authenticated user může požádat o vstup do `visibility=public`
    komunity. Vytvoří CommunityMember se statusem `pending` a pingne
    community adminy + workspace ownera do bell feedu. Admin pak
    schvaluje přes `community_member_approve`.

    Idempotence:
    - existing member → 200 `{status: "already_member"}`
    - existing pending → 200 `{status: "already_pending"}`
    - existing declined/removed → přepnout zpět na pending + notif.
    """
    community, err = _community_or_404(workspace_slug, community_slug)
    if err:
        return err

    if community.visibility != Community.VISIBILITY_PUBLIC:
        # Unlisted i private → join přes tenhle endpoint blokovaný.
        # Unlisted "link-only" znamená share odkaz, ale členství si
        # owner drží pod kontrolou (invite). Public je jediný self-serve
        # kanál v V1.
        return Response(
            {"detail": "Do této komunity se nelze samostatně přihlásit."},
            status=status.HTTP_403_FORBIDDEN,
        )

    existing = CommunityMember.objects.filter(
        community=community, user=request.user
    ).first()
    if existing is not None:
        if existing.status == CommunityMember.STATUS_MEMBER:
            return Response(
                {
                    "status": "already_member",
                    "membership": CommunityMemberSerializer(existing).data,
                }
            )
        if existing.status == CommunityMember.STATUS_PENDING:
            return Response(
                {
                    "status": "already_pending",
                    "membership": CommunityMemberSerializer(existing).data,
                }
            )
        # declined / removed → re-request. Přepneme na pending, decided_at
        # nulujeme (nová žádost = nové rozhodnutí čeká).
        existing.status = CommunityMember.STATUS_PENDING
        existing.decided_at = None
        existing.save(update_fields=["status", "decided_at"])
        with contextlib.suppress(Exception):
            from .notifications import notify_community_join_request

            notify_community_join_request(existing)
        return Response(
            {
                "status": "pending",
                "membership": CommunityMemberSerializer(existing).data,
            },
            status=status.HTTP_200_OK,
        )

    member = CommunityMember.objects.create(
        community=community,
        user=request.user,
        status=CommunityMember.STATUS_PENDING,
    )

    with contextlib.suppress(Exception):
        from .notifications import notify_community_join_request

        notify_community_join_request(member)

    return Response(
        {
            "status": "pending",
            "membership": CommunityMemberSerializer(member).data,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def community_member_approve(
    request: Request,
    workspace_slug: str,
    community_slug: str,
    member_id: int,
) -> Response:
    """Approve a pending community membership request."""
    community, err = _community_or_404(workspace_slug, community_slug)
    if err:
        return err

    if not can_manage_community(request.user, community):
        return Response(status=status.HTTP_403_FORBIDDEN)

    try:
        member = community.memberships.select_related("user").get(pk=member_id)
    except CommunityMember.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if member.status != CommunityMember.STATUS_PENDING:
        return Response(
            {"detail": "Členství není ve stavu pending."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    member.status = CommunityMember.STATUS_MEMBER
    member.decided_at = timezone.now()
    member.save(update_fields=["status", "decided_at"])

    with contextlib.suppress(Exception):
        from .notifications import notify_community_member_approved

        notify_community_member_approved(member)

    from audit.models import AuditLog
    from audit.services import log as audit_log

    applicant_name = (
        member.user.get_full_name() or member.user.email
        if member.user_id
        else "(neznámý)"
    )
    audit_log(
        actor=request.user,
        action=AuditLog.ACTION_COMMUNITY_MEMBER_APPROVE,
        workspace=community.workspace,
        target_type="community_member",
        target_id=member.pk,
        summary=(
            f'Schválil žádost {applicant_name} '
            f'o vstup do komunity „{community.name}".'
        ),
        payload={
            "community_id": community.pk,
            "community_slug": community.slug,
        },
    )

    return Response(CommunityMemberSerializer(member).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def community_member_reject(
    request: Request,
    workspace_slug: str,
    community_slug: str,
    member_id: int,
) -> Response:
    """Reject a pending community membership request."""
    community, err = _community_or_404(workspace_slug, community_slug)
    if err:
        return err

    if not can_manage_community(request.user, community):
        return Response(status=status.HTTP_403_FORBIDDEN)

    try:
        member = community.memberships.select_related("user").get(pk=member_id)
    except CommunityMember.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if member.status != CommunityMember.STATUS_PENDING:
        return Response(
            {"detail": "Členství není ve stavu pending."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    reason = (request.data.get("reason") or "").strip()

    member.status = CommunityMember.STATUS_DECLINED
    member.decided_at = timezone.now()
    member.save(update_fields=["status", "decided_at"])

    with contextlib.suppress(Exception):
        from .notifications import notify_community_member_rejected

        notify_community_member_rejected(member, reason=reason)

    from audit.models import AuditLog
    from audit.services import log as audit_log

    applicant_name = (
        member.user.get_full_name() or member.user.email
        if member.user_id
        else "(neznámý)"
    )
    audit_log(
        actor=request.user,
        action=AuditLog.ACTION_COMMUNITY_MEMBER_REJECT,
        workspace=community.workspace,
        target_type="community_member",
        target_id=member.pk,
        summary=(
            f'Zamítl žádost {applicant_name} '
            f'o vstup do komunity „{community.name}".'
        ),
        payload={
            "community_id": community.pk,
            "community_slug": community.slug,
            "reason": reason,
        },
    )

    return Response(CommunityMemberSerializer(member).data)
