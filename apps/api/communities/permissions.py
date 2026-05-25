"""Community permission helpers — Slice 2 z multi-admin community.

Permission perimeter:

  1. Workspace owner/admin (`is_workspace_owner` from events.permissions)
     — implicitly above everything in their tenant. Can manage any
     community, promote/demote anyone, remove anyone.
  2. Community admin (`CommunityMember(status=member, role=admin)`)
     — can edit community profile, moderate nástěnka, invite members,
     remove non-admin members, promote members to admin, demote OTHER
     admins to member. Cannot:
        - demote themselves if they're the last admin (community must
          always have ≥1 admin OR rely on workspace owner)
        - remove other admins without demoting them first
  3. Regular community member — read-only.

Workspace tenancy beats community role: a workspace admin can override
any community admin decision (e.g., emergency demote). Community admin
is a *delegated* role, not a replacement for tenant ownership.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from events.permissions import is_workspace_owner

if TYPE_CHECKING:
    from accounts.models import User

    from .models import Community, CommunityMember


def is_community_admin(user: User | None, community: Community) -> bool:
    """True if user has an active membership in `community` with admin role."""
    if user is None or not user.is_authenticated:
        return False
    from .models import CommunityMember

    return (
        CommunityMember.objects.filter(
            community=community,
            user=user,
            status=CommunityMember.STATUS_MEMBER,
            role=CommunityMember.ROLE_ADMIN,
        )
        .only("pk")
        .exists()
    )


def can_manage_community(user: User | None, community: Community) -> bool:
    """Top-level gate for "can this user change community state"?

    True for workspace owners/admins (tenant-level) OR community admins
    (delegated). Use this for: edit community profile, invite members,
    delete community-scoped content (topics, etc.).

    For more granular checks (e.g. "can demote this specific admin"),
    use the role-change helpers below.
    """
    if user is None or not user.is_authenticated:
        return False
    if is_workspace_owner(user, community.workspace):
        return True
    return is_community_admin(user, community)


def can_remove_member(
    user: User | None, member: CommunityMember
) -> bool:
    """True if user can remove the given membership.

    Workspace owner/admin can remove anyone. Community admin can remove
    non-admin members only (must demote first before removing another
    admin — prevents accidental „depose" without explicit intent).
    """
    if user is None or not user.is_authenticated:
        return False
    community = member.community
    if is_workspace_owner(user, community.workspace):
        return True
    if not is_community_admin(user, community):
        return False
    # Community admin: can only remove non-admins.
    from .models import CommunityMember

    return member.role != CommunityMember.ROLE_ADMIN


def can_change_role(
    user: User | None,
    target_member: CommunityMember,
    new_role: str,
) -> tuple[bool, str]:
    """Can `user` set `target_member.role = new_role`?

    Returns (allowed, reason). `reason` is empty when allowed; on deny
    contains a short Czech explanation for the API response.

    Rules:
      - Workspace owner/admin: anything (incl. demoting last admin —
        tenant override).
      - Community admin: can promote member → admin, can demote OTHER
        admin → member, can demote SELF only if ≥1 other admin remains.
      - Last admin cannot be demoted by anyone but workspace owner.
    """
    from .models import CommunityMember

    if user is None or not user.is_authenticated:
        return False, "Nepřihlášen."

    community = target_member.community

    if new_role not in (CommunityMember.ROLE_ADMIN, CommunityMember.ROLE_MEMBER):
        return False, f"Neznámá role: {new_role}."

    if target_member.status != CommunityMember.STATUS_MEMBER:
        return False, "Roli lze měnit jen aktivním členům komunity."

    if new_role == target_member.role:
        # No-op; treat as allowed (idempotence). Caller can short-circuit.
        return True, ""

    # Workspace tenancy beats everything.
    if is_workspace_owner(user, community.workspace):
        return True, ""

    if not is_community_admin(user, community):
        return False, "Nemáš oprávnění měnit role v této komunitě."

    # Community admin demoting → must not be the last admin.
    if new_role == CommunityMember.ROLE_MEMBER:
        other_admins = (
            CommunityMember.objects.filter(
                community=community,
                status=CommunityMember.STATUS_MEMBER,
                role=CommunityMember.ROLE_ADMIN,
            )
            .exclude(pk=target_member.pk)
            .count()
        )
        if other_admins == 0:
            return (
                False,
                "Komunita musí mít alespoň jednoho admina. Před demotí "
                "promoň jiného člena na admina.",
            )
    return True, ""
