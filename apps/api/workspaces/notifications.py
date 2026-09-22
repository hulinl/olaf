"""Workspace-side fan-out into the bell feed.

Three triggers (mirror communities/notifications.py):
- `notify_workspace_join_request` — someone requested to join a public
  workspace. Fan-out to workspace owners + admins.
- `notify_workspace_member_approved` — owner/admin approved a pending
  membership request.
- `notify_workspace_member_rejected` — owner/admin rejected a pending
  request.

All best-effort — a DB error in the notification path must not unwind
the surrounding state change. Callers ignore return values.
"""
from __future__ import annotations

from notifications.models import Notification

from .models import Workspace, WorkspaceMember


def _public_link(workspace: Workspace) -> str:
    return f"/{workspace.slug}"


def _admin_link(workspace: Workspace) -> str:
    # Lidé cockpit má sekci "Žádosti o členství" (viz frontend
    # workspaces/[slug]/people).
    return f"/workspaces/{workspace.slug}/people?tab=pending"


def notify_workspace_join_request(member: WorkspaceMember) -> int:
    """Someone asked to join. Ping every workspace owner + admin so they
    can act. Returns count of Notifications created."""
    workspace = member.workspace
    applicant_name = (
        member.user.get_full_name() or member.user.email
        if member.user_id
        else "(neznámý)"
    )

    recipient_ids = set(
        WorkspaceMember.objects.filter(
            workspace=workspace,
            role__in=[WorkspaceMember.ROLE_OWNER, WorkspaceMember.ROLE_ADMIN],
            status=WorkspaceMember.STATUS_ACTIVE,
        ).values_list("user_id", flat=True)
    ) - {member.user_id}
    if not recipient_ids:
        return 0

    title = f'Nová žádost o vstup: „{workspace.name}"'
    body = f"{applicant_name} chce být členem komunity."
    link = _admin_link(workspace)

    Notification.objects.bulk_create(
        [
            Notification(
                recipient_id=uid,
                kind=Notification.KIND_WORKSPACE_JOIN_REQUEST,
                title=title,
                body=body,
                link=link,
                payload={
                    "workspace_id": workspace.pk,
                    "workspace_slug": workspace.slug,
                    "member_id": member.pk,
                    "applicant_user_id": member.user_id,
                },
            )
            for uid in recipient_ids
        ]
    )
    return len(recipient_ids)


def notify_workspace_member_approved(
    member: WorkspaceMember,
) -> Notification | None:
    """Owner approved the pending membership — tell the user."""
    if member.user_id is None:
        return None
    workspace = member.workspace
    return Notification.objects.create(
        recipient_id=member.user_id,
        kind=Notification.KIND_WORKSPACE_MEMBER_APPROVED,
        title=f'Vítej v komunitě „{workspace.name}"',
        body="Tvoje žádost o členství byla schválena.",
        link=_public_link(workspace),
        payload={
            "workspace_id": workspace.pk,
            "workspace_slug": workspace.slug,
            "member_id": member.pk,
        },
    )


def notify_workspace_member_rejected(
    member: WorkspaceMember, *, reason: str = ""
) -> Notification | None:
    """Owner rejected the pending membership request."""
    if member.user_id is None:
        return None
    workspace = member.workspace
    body = (
        f"Tvoje žádost o členství byla zamítnuta: {reason}"
        if reason
        else "Tvoje žádost o členství byla zamítnuta."
    )
    return Notification.objects.create(
        recipient_id=member.user_id,
        kind=Notification.KIND_WORKSPACE_MEMBER_REJECTED,
        title=f'Zamítnuto: „{workspace.name}"',
        body=body,
        link=_public_link(workspace),
        payload={
            "workspace_id": workspace.pk,
            "workspace_slug": workspace.slug,
            "member_id": member.pk,
        },
    )
