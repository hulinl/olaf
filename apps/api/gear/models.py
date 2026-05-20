"""User-scoped gear catalog + named gear lists.

Each user maintains a personal library of items (name, weight, URL,
optional category). They can assemble those items into named lists
(e.g. "Beskická 7") that travel with their profile and become the
basis for "required gear" suggestions on events later (V2).

Weight stored as integer grams to avoid floating point sums. The UI
displays as kg when >= 1000 g.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone


class GearItem(models.Model):
    """One gear thing the user owns or recommends."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="gear_items",
    )
    name = models.CharField(max_length=200)
    weight_g = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Weight in grams. NULL = unspecified.",
    )
    url = models.URLField(
        max_length=600,
        blank=True,
        default="",
        help_text="Optional product link (e-shop, manufacturer).",
    )
    category = models.CharField(
        max_length=60,
        blank=True,
        default="",
        help_text="Free-text grouping label (sleep / cooking / clothing / ...).",
    )
    note = models.TextField(
        blank=True,
        default="",
        help_text="Optional comment — color, size, why I like it.",
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "gear_item"
        ordering = ["category", "name"]
        indexes = [models.Index(fields=["user", "category"])]

    def __str__(self) -> str:
        return self.name


class GearList(models.Model):
    """A named bundle of items the user packs together — e.g. trip kit."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="gear_lists",
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    items = models.ManyToManyField(
        GearItem,
        through="GearListItem",
        related_name="lists",
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "gear_list"
        ordering = ["name"]
        indexes = [models.Index(fields=["user", "name"])]

    def __str__(self) -> str:
        return self.name


class GearListItem(models.Model):
    """Through model — preserves quantity, ordering, and per-list notes
    so the same item can appear in two lists with different annotations."""

    gear_list = models.ForeignKey(
        GearList, on_delete=models.CASCADE, related_name="entries"
    )
    item = models.ForeignKey(
        GearItem, on_delete=models.CASCADE, related_name="list_entries"
    )
    quantity = models.PositiveIntegerField(default=1)
    sort_order = models.PositiveIntegerField(default=0)
    note = models.CharField(max_length=200, blank=True, default="")

    class Meta:
        db_table = "gear_list_item"
        ordering = ["sort_order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["gear_list", "item"],
                name="uniq_item_per_gear_list",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.item_id} x{self.quantity} in list {self.gear_list_id}"
