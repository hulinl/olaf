"""Tenant-aware querysets and managers.

Every workspace-scoped model in olaf (Communities, Events, GearItems, etc.)
will subclass TenantScopedModel below so that:

  - cross-tenant joins are impossible to write accidentally
  - the active tenant resolved by TenantResolverMiddleware filters queries

Slice 2 sets up the base infrastructure. Communities (Slice 3) and Events
(Slice 4) are the first real consumers.
"""
from __future__ import annotations

from django.db import models


class TenantQuerySet(models.QuerySet):
    """QuerySet that supports an explicit per-tenant filter helper."""

    def for_workspace(self, workspace) -> TenantQuerySet:
        if workspace is None:
            return self.none()
        return self.filter(workspace=workspace)


class TenantManager(models.Manager.from_queryset(TenantQuerySet)):
    """Default manager for workspace-scoped models.

    Subclasses gain `.for_workspace(workspace)`. Cross-tenant joins remain
    syntactically possible at the ORM level — the convention is enforced by
    explicit `for_workspace()` calls in views and by tests in slice 2 and
    onwards.
    """

    pass


class TenantScopedModel(models.Model):
    """Abstract base for any model that lives under a Workspace tenant.

    Adds a non-null `workspace` FK and a default `objects` TenantManager.
    """

    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="+",
    )

    objects = TenantManager()

    class Meta:
        abstract = True
