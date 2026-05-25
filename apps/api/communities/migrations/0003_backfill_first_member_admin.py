"""Backfill admin role for each existing community.

Multi-admin community V2 Slice 1 introduces `CommunityMember.role`.
Default for new memberships is `member`. For pre-existing communities
we promote the *first* member (chronologically, by `joined_at`) with
status=`member` to `admin` so every legacy community ends up with at
least one explicit community admin — not just the workspace owner.

If a community has no member-status rows yet (only pendings/declined),
we skip — workspace owner still controls everything via the implicit
hierarchy, and the next person to accept their join will be set
admin? No — the next person joins as a regular member. Communities
with no current admin are a soft state that admins can promote later
manually (Slice 2). Better than auto-promoting a future pending into
admin without their explicit intent.

Reversible: revert sets every role back to `member` (lossless for
schema, idempotent).
"""
from django.db import migrations


def forward(apps, schema_editor):
    CommunityMember = apps.get_model("communities", "CommunityMember")
    Community = apps.get_model("communities", "Community")

    for community in Community.objects.all():
        first = (
            CommunityMember.objects.filter(
                community=community,
                status="member",
            )
            .order_by("joined_at")
            .first()
        )
        if first is None:
            continue
        if first.role != "admin":
            first.role = "admin"
            first.save(update_fields=["role"])


def reverse(apps, schema_editor):
    CommunityMember = apps.get_model("communities", "CommunityMember")
    CommunityMember.objects.update(role="member")


class Migration(migrations.Migration):
    dependencies = [
        ("communities", "0002_communitymember_role"),
    ]

    operations = [
        migrations.RunPython(forward, reverse),
    ]
