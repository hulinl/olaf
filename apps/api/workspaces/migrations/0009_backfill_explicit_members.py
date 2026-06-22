"""V2 explicit membership backfill (PR #212).

Through V1 the "members" list of a workspace was derived: any User with
a non-cancelled RSVP on one of the workspace's events showed up as a
member. V2 makes the membership row explicit (`WorkspaceMember`), so
the owner can curate it (remove, add, distinguish from one-time
participants).

This data migration brings the workspace into the new world without
losing the V1 visible roster:

  for each workspace:
    for each user with a non-cancelled RSVP on that workspace's events:
      ensure a WorkspaceMember row exists (role=member, status=active)

Shared events (event.workspace=A but shared_workspaces.contains=B):
  V1 surfaced the same user on BOTH workspaces' member rosters. We
  preserve that — backfill creates a member row in every workspace the
  event touches. Owner can prune later.

The backfill is idempotent: rows that already exist (owner, admin
promotions) are left untouched. `bulk_create(ignore_conflicts=True)`
relies on the unique_together (workspace, user) constraint.
"""
from __future__ import annotations

from django.db import migrations
from django.utils import timezone


def backfill(apps, schema_editor) -> None:
    WorkspaceMember = apps.get_model("workspaces", "WorkspaceMember")
    Workspace = apps.get_model("workspaces", "Workspace")
    Event = apps.get_model("events", "Event")
    RSVP = apps.get_model("events", "RSVP")

    # Pre-load existing memberships to skip them without per-row queries.
    existing = {
        (m.workspace_id, m.user_id)
        for m in WorkspaceMember.objects.all().only("workspace_id", "user_id")
    }

    # For each workspace, expand event_ids to owned + shared.
    new_rows: list = []
    now = timezone.now()
    for workspace in Workspace.objects.all().only("id"):
        owned_event_ids = list(
            Event.objects.filter(workspace_id=workspace.id).values_list(
                "id", flat=True
            )
        )
        shared_event_ids = list(
            Event.objects.filter(
                shared_workspaces__id=workspace.id
            ).values_list("id", flat=True)
        )
        event_ids = set(owned_event_ids) | set(shared_event_ids)
        if not event_ids:
            continue

        user_ids = (
            RSVP.objects.filter(event_id__in=event_ids)
            .exclude(status="cancelled")
            .values_list("user_id", flat=True)
            .distinct()
        )
        for user_id in user_ids:
            if (workspace.id, user_id) in existing:
                continue
            existing.add((workspace.id, user_id))
            new_rows.append(
                WorkspaceMember(
                    workspace_id=workspace.id,
                    user_id=user_id,
                    role="member",
                    status="active",
                    joined_at=now,
                    created_at=now,
                )
            )

    if new_rows:
        WorkspaceMember.objects.bulk_create(
            new_rows, ignore_conflicts=True, batch_size=500
        )


def noop_reverse(apps, schema_editor) -> None:
    """Reverse is intentionally a noop. The backfill creates rows that
    are indistinguishable from rows created by the new V2 add-member
    endpoint. Reverting the schema would still drop the rows via the
    AddField reverse; this migration only seeds data, so there's
    nothing safe to undo at the data layer (we'd risk deleting
    legitimate manually-added rows). If you really need to roll back,
    drop the rows manually."""
    return None


class Migration(migrations.Migration):

    dependencies = [
        (
            "workspaces",
            "0008_workspacemember_joined_at_workspacemember_status",
        ),
        # We read events.RSVP — make sure that app is fully migrated.
        ("events", "0032_event_external_ref"),
    ]

    operations = [
        migrations.RunPython(backfill, reverse_code=noop_reverse),
    ]
