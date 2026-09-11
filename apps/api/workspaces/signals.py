"""Signals for the workspaces app.

- pre_save on Workspace: když se změní `slug`, uložíme starý do
  WorkspaceSlugAlias tak, aby staré URL nadále odkazovaly na komunitu
  (308 redirect ve frontend page.tsx). 2026-09-11 — protějšek
  EventSlugAlias, umožní čistou migraci `personal-<id>` slugů.
"""
from __future__ import annotations

from django.db.models.signals import pre_save
from django.dispatch import receiver

from .models import Workspace, WorkspaceSlugAlias


@receiver(pre_save, sender=Workspace)
def create_slug_alias_on_rename(sender, instance: Workspace, **kwargs) -> None:
    if not instance.pk:
        return
    try:
        prev = Workspace.objects.only("slug").get(pk=instance.pk)
    except Workspace.DoesNotExist:
        return
    if prev.slug == instance.slug:
        return
    # Slug se změnil — uložíme alias. Když už existuje, přepíšeme
    # target: staré URL vede na aktuální workspace (bezpečnější než
    # 404 kdyby došlo ke slug-kolizi napříč přejmenováními).
    WorkspaceSlugAlias.objects.update_or_create(
        old_slug=prev.slug,
        defaults={"workspace": instance},
    )
