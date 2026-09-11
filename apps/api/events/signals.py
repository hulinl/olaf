"""Signals for the events app.

- pre_save on Event: když se změní `slug`, uložíme starý do
  EventSlugAlias tak, aby staré URL nadále odkazovaly na akci
  (301 redirect ve view). User request 2026-09-11.
"""
from __future__ import annotations

from django.db.models.signals import pre_save
from django.dispatch import receiver

from .models import Event, EventSlugAlias


@receiver(pre_save, sender=Event)
def create_slug_alias_on_rename(sender, instance: Event, **kwargs) -> None:
    if not instance.pk:
        # Nový event — žádný předchozí slug.
        return
    try:
        prev = Event.all_objects.only("slug", "workspace_id").get(pk=instance.pk)
    except Event.DoesNotExist:
        return
    if prev.slug == instance.slug:
        return
    # Slug se změnil — uložíme alias na starý slug v jeho původní
    # workspace. Kdyby stejný workspace-slug kombinace už existoval
    # (např. Event A přejmenován na X, pak Event B pojmenován starým
    # A, pak přejmenován na Y), get_or_create pomůže dedupovat —
    # alias ukáže na aktuální event, což může být edge-case, ale
    # user request byl „staré URL nesmí padat do 404" — směřování
    # na aktuální event je pořád lepší než 404.
    EventSlugAlias.objects.update_or_create(
        workspace_id=prev.workspace_id,
        old_slug=prev.slug,
        defaults={"event": instance},
    )
