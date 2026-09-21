"""Community-side fan-out into the bell feed.

Three triggers:
- `notify_community_join_request` — someone requested to join a public
  community. Fan-out to community admins + workspace owners/admins.
- `notify_community_member_approved` — owner approved a pending
  membership request.
- `notify_community_member_rejected` — owner rejected a pending
  request.

All best-effort — a DB error in the notification path must not unwind
the surrounding state change. Callers ignore return values.
"""
from __future__ import annotations

from notifications.models import Notification
from workspaces.models import WorkspaceMember

from .models import Community, CommunityMember


def _public_link(community: Community) -> str:
    return f"/{community.workspace.slug}/k/{community.slug}"


def _admin_link(community: Community) -> str:
    return f"/workspaces/{community.workspace.slug}/communities/{community.slug}"


def notify_community_join_request(member: CommunityMember) -> int:
    """Someone asked to join. Ping every community admin + workspace
    owner/admin so they can act. Returns count of Notifications created.
    """
    community = member.community
    applicant_name = (
        member.user.get_full_name() or member.user.email
        if member.user_id
        else "(neznámý)"
    )

    # Recipients: workspace owners/admins + community admins (active
    # memberships with role=admin). Dedup by user id.
    workspace_admin_ids = set(
        WorkspaceMember.objects.filter(
            workspace=community.workspace,
            role__in=[WorkspaceMember.ROLE_OWNER, WorkspaceMember.ROLE_ADMIN],
            status=WorkspaceMember.STATUS_ACTIVE,
        ).values_list("user_id", flat=True)
    )
    community_admin_ids = set(
        CommunityMember.objects.filter(
            community=community,
            status=CommunityMember.STATUS_MEMBER,
            role=CommunityMember.ROLE_ADMIN,
        ).values_list("user_id", flat=True)
    )
    recipient_ids = (workspace_admin_ids | community_admin_ids) - {member.user_id}
    if not recipient_ids:
        return 0

    title = f'Nová žádost o vstup: „{community.name}"'
    body = f"{applicant_name} chce být členem komunity."
    link = _admin_link(community)

    Notification.objects.bulk_create(
        [
            Notification(
                recipient_id=uid,
                kind=Notification.KIND_COMMUNITY_JOIN_REQUEST,
                title=title,
                body=body,
                link=link,
                payload={
                    "community_id": community.pk,
                    "community_slug": community.slug,
                    "workspace_slug": community.workspace.slug,
                    "member_id": member.pk,
                    "applicant_user_id": member.user_id,
                },
            )
            for uid in recipient_ids
        ]
    )
    return len(recipient_ids)


def notify_community_member_approved(member: CommunityMember) -> Notification | None:
    """Owner approved the pending membership — tell the user."""
    if member.user_id is None:
        return None
    community = member.community
    return Notification.objects.create(
        recipient_id=member.user_id,
        kind=Notification.KIND_COMMUNITY_MEMBER_APPROVED,
        title=f'Vítej v komunitě „{community.name}"',
        body="Tvoje žádost o členství byla schválena.",
        link=_public_link(community),
        payload={
            "community_id": community.pk,
            "community_slug": community.slug,
            "workspace_slug": community.workspace.slug,
            "member_id": member.pk,
        },
    )


def notify_community_member_rejected(
    member: CommunityMember, *, reason: str = ""
) -> Notification | None:
    """Owner rejected the pending membership request."""
    if member.user_id is None:
        return None
    community = member.community
    body = (
        f"Tvoje žádost o členství byla zamítnuta: {reason}"
        if reason
        else "Tvoje žádost o členství byla zamítnuta."
    )
    return Notification.objects.create(
        recipient_id=member.user_id,
        kind=Notification.KIND_COMMUNITY_MEMBER_REJECTED,
        title=f'Zamítnuto: „{community.name}"',
        body=body,
        link=_public_link(community),
        payload={
            "community_id": community.pk,
            "community_slug": community.slug,
            "workspace_slug": community.workspace.slug,
            "member_id": member.pk,
        },
    )
