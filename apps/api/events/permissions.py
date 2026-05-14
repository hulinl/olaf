"""Permission helpers for event endpoints."""
from __future__ import annotations

from workspaces.models import Workspace, WorkspaceMember


def is_workspace_owner(user, workspace: Workspace) -> bool:
    if not user or not user.is_authenticated:
        return False
    return WorkspaceMember.objects.filter(
        workspace=workspace,
        user=user,
        role=WorkspaceMember.ROLE_OWNER,
    ).exists()
