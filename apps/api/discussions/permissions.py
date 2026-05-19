"""Visibility rules for the discussion wall.

Two parents in V1: Workspace (komunita) and Event. The "can read / write"
question reduces to the parent's audience:

- Workspace wall:
    read  = anyone authenticated who's a member OR the owner,
    write = same.
- Event wall:
    read  = anyone with an active RSVP (non-cancelled) OR the workspace owner,
    write = same.

Pin / lock / delete-anyone's-post is owner-only on both.
"""
from __future__ import annotations

from events.models import RSVP, Event
from events.permissions import is_workspace_owner
from workspaces.models import Workspace, WorkspaceMember


def load_workspace_parent(parent_id: int) -> Workspace | None:
    try:
        return Workspace.objects.get(pk=parent_id)
    except Workspace.DoesNotExist:
        return None


def load_event_parent(parent_id: int) -> Event | None:
    try:
        return Event.objects.select_related("workspace").get(pk=parent_id)
    except Event.DoesNotExist:
        return None


def can_access_workspace_wall(user, workspace: Workspace) -> bool:
    if not user or not user.is_authenticated:
        return False
    return WorkspaceMember.objects.filter(
        workspace=workspace, user=user
    ).exists()


def can_access_event_wall(user, event: Event) -> bool:
    if not user or not user.is_authenticated:
        return False
    if is_workspace_owner(user, event.workspace):
        return True
    return RSVP.objects.filter(
        event=event,
        user=user,
    ).exclude(status=RSVP.STATUS_CANCELLED).exists()


def can_moderate_workspace(user, workspace: Workspace) -> bool:
    return is_workspace_owner(user, workspace)


def can_moderate_event(user, event: Event) -> bool:
    return is_workspace_owner(user, event.workspace)
