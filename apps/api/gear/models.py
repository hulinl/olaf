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


class GearCategory(models.Model):
    """User-scoped category for grouping gear items.

    Promoted from free-text on GearItem to a first-class entity so the
    owner can manage the vocabulary (rename in one place, see empty
    categories, control sort order). GearItem still keeps the
    denormalized name string as a fallback display + for legacy reads;
    canonical truth is the FK."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="gear_categories",
    )
    name = models.CharField(max_length=60)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "gear_category"
        ordering = ["sort_order", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "name"], name="uniq_category_per_user"
            )
        ]

    def __str__(self) -> str:
        return self.name


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
    category_obj = models.ForeignKey(
        GearCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="items",
        help_text="Canonical category — kept in sync with the string below.",
    )
    category = models.CharField(
        max_length=60,
        blank=True,
        default="",
        help_text="Denormalised category name for legacy reads.",
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

    VISIBILITY_PRIVATE = "private"
    VISIBILITY_UNLISTED = "unlisted"
    VISIBILITY_PUBLIC = "public"
    VISIBILITY_CHOICES = [
        (VISIBILITY_PRIVATE, "Private — only the owner can see it"),
        (VISIBILITY_UNLISTED, "Unlisted — anyone with the URL can see it"),
        (VISIBILITY_PUBLIC, "Public — indexable + share-friendly"),
    ]

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
    # Random URL-safe slug, picked at create time so the public path
    # /gear/<slug> is stable. Not derived from the name so renames
    # don't break shared links.
    slug = models.SlugField(
        max_length=22,
        unique=True,
        db_index=True,
        blank=True,
    )
    visibility = models.CharField(
        max_length=20,
        choices=VISIBILITY_CHOICES,
        default=VISIBILITY_PRIVATE,
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "gear_list"
        ordering = ["name"]
        indexes = [models.Index(fields=["user", "name"])]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            import secrets

            for _ in range(8):
                candidate = secrets.token_urlsafe(12)[:16]
                if not GearList.objects.filter(slug=candidate).exists():
                    self.slug = candidate
                    break
        super().save(*args, **kwargs)


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


class GearLinkClick(models.Model):
    """A single outbound click on a gear-list entry's affiliate link.

    One row per visit (not deduplicated) so the owner can see raw
    interest over time. ip_hash is a salted SHA-256 prefix — we only
    keep it so future per-day deduping can layer on without leaking
    raw IPs. UA + referer are diagnostic and capped to short strings.
    """

    entry = models.ForeignKey(
        GearListItem,
        on_delete=models.CASCADE,
        related_name="clicks",
    )
    ip_hash = models.CharField(max_length=64, blank=True, default="")
    user_agent = models.CharField(max_length=300, blank=True, default="")
    referer = models.URLField(max_length=600, blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "gear_link_click"
        indexes = [models.Index(fields=["entry", "created_at"])]
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"click on entry {self.entry_id} at {self.created_at:%Y-%m-%d %H:%M}"
