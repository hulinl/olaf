"""Permission helpers for event + workspace endpoints.

Two-tier admin model:
- OWNER (super-admin) — workspace creator. Can do anything, including
  delete the workspace, promote/demote admins, hand over ownership.
- ADMIN — promoted member. Operational parity with owner: can manage
  events, RSVPs, payments, content, members, nástěnka. CANNOT delete
  the workspace, promote/demote other admins, or remove the owner.
- MEMBER — basic access.

The legacy `is_workspace_owner` name is kept but its semantics
extended to "owner OR admin" so existing endpoints automatically pick
up admin support. New super-admin-only operations (promote/demote/
delete) use `is_workspace_super_admin`.
"""
from __future__ import annotations

from workspaces.models import Workspace, WorkspaceMember


def is_workspace_owner(user, workspace: Workspace) -> bool:
    """Owner OR admin — used for all operational endpoints.

    Despite the legacy name, this now allows admins through. Callers
    that need true super-admin semantics (delete, promote/demote)
    should switch to `is_workspace_super_admin`.
    """
    if not user or not user.is_authenticated:
        return False
    return WorkspaceMember.objects.filter(
        workspace=workspace,
        user=user,
        role__in=[WorkspaceMember.ROLE_OWNER, WorkspaceMember.ROLE_ADMIN],
    ).exists()


def is_workspace_super_admin(user, workspace: Workspace) -> bool:
    """Only the workspace creator (role=owner). Required for delete,
    promote/demote admin, hand over ownership."""
    if not user or not user.is_authenticated:
        return False
    return WorkspaceMember.objects.filter(
        workspace=workspace,
        user=user,
        role=WorkspaceMember.ROLE_OWNER,
    ).exists()


def can_manage_event(user, event) -> bool:
    """Workspace owner/admin OR explicit EventCollaborator on this event.

    Co-creators get operational parity with the workspace admin —
    they can edit content, approve RSVPs, issue invoices, send
    reminders. Scope-flag carve-outs (sekretářka edits faktury only)
    are V2.
    """
    if not user or not user.is_authenticated:
        return False
    if is_workspace_owner(user, event.workspace):
        return True
    from .models import EventCollaborator

    return EventCollaborator.objects.filter(event=event, user=user).exists()
