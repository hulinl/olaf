"""Public race calendar — nezávislý na workspace/event modelu.

`Race` je vlastní entita (samostatný závod pořádaný jinde), který je
publikovaný na veřejném `/kalendar` bez nutnosti logina. Přihlášení
uživatelé si k závodům můžou přidat ★ favorit přes `RaceFavorite`.

Zdroje dat:
- V1: ruční import přes Django admin nebo management command
  `seed_races` (bootstrapuje pár klasik z Ultra kalendář reference)
- V2 (later): auto-scraper běžící přes Celery beat, syncuje z UTMB
  World Series API + WTM feed + jednotlivé webové rozvrhy

Model záměrně jednoduchý — landing calendar potřebuje jen listing +
filter + favorit toggle, žádný registrační flow (to je na organizátorově
straně, my jen ukazujeme „kdy a kde jsou závody").
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils.text import slugify


class Race(models.Model):
    """Jeden závod v kalendáři — samostatná entita, ne OLAF-hosted
    akce. Renderuje se na /kalendar."""

    # --- Identity ---
    name = models.CharField(
        max_length=200,
        help_text='Oficiální jméno závodu (např. „UTMB", „Beskydská 7").',
    )
    slug = models.SlugField(
        max_length=250,
        unique=True,
        help_text="URL slug — auto-generováno z jména, může se přepsat.",
    )

    # --- Kdy ---
    date_start = models.DateField(
        db_index=True,
        help_text="První den závodu / start.",
    )
    date_end = models.DateField(
        null=True,
        blank=True,
        help_text="Poslední den (u vícedenních). Prázdné = jednodenní.",
    )

    # --- Co ---
    distance_km = models.PositiveIntegerField(
        help_text="Délka trati v km (integer, zaokrouhli nahoru).",
    )
    elevation_m = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Celkové převýšení v metrech (D+). Prázdné = neuvedeno.",
    )
    terrain = models.CharField(
        max_length=60,
        blank=True,
        default="",
        help_text=(
            "Terén — trail / mountain / road / skyrace / desert. Volné pole "
            "pro flexibilitu, filtruje se full-text."
        ),
    )

    # --- Kde ---
    location = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text='Místo (např. „Beskydy, Frenštát p. Radhoštěm").',
    )
    country = models.CharField(
        max_length=100,
        blank=True,
        default="",
        db_index=True,
        help_text="Země (Česko, Slovensko, Francie…). Filtrujeme podle toho.",
    )

    # --- Odkaz + série ---
    url = models.URLField(
        blank=True,
        default="",
        help_text="Oficiální stránka závodu (registrace, program).",
    )

    SERIES_INDEP = "indep"
    SERIES_UTMB = "utmb"
    SERIES_WTM = "wtm"
    SERIES_SKY = "sky"
    SERIES_MAJOR = "major"
    SERIES_CHOICES = [
        (SERIES_INDEP, "Nezávislý"),
        (SERIES_UTMB, "UTMB World Series"),
        (SERIES_WTM, "World Trail Majors"),
        (SERIES_SKY, "Skyrunner Series"),
        (SERIES_MAJOR, "Major (bez série)"),
    ]
    series = models.CharField(
        max_length=20,
        choices=SERIES_CHOICES,
        default=SERIES_INDEP,
        db_index=True,
    )

    REG_OPEN = "open"
    REG_LOTTERY = "lottery"
    REG_SOLD_OUT = "sold_out"
    REG_QUALIFIER = "qualifier"
    REG_CLOSED = "closed"
    REG_CHOICES = [
        (REG_OPEN, "Přihlášky otevřeny"),
        (REG_LOTTERY, "Losování"),
        (REG_SOLD_OUT, "Vyprodáno"),
        (REG_QUALIFIER, "Nutná kvalifikace"),
        (REG_CLOSED, "Přihlášky uzavřeny"),
    ]
    registration_status = models.CharField(
        max_length=20,
        choices=REG_CHOICES,
        default=REG_OPEN,
    )

    # --- Obsah ---
    highlight = models.CharField(
        max_length=280,
        blank=True,
        default="",
        help_text=(
            '1-2 věty co je zajímavé (např. „Klasika v Beskydech, přesně '
            '100 km, 5 000 D+"). Zobrazuje se v listě pod jménem.'
        ),
    )

    # --- Meta ---
    is_visible = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Soft-hide bez smazání (např. při chybném importu).",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "races_race"
        ordering = ["date_start", "name"]
        indexes = [
            models.Index(fields=["is_visible", "date_start"]),
            models.Index(fields=["country", "date_start"]),
            models.Index(fields=["series"]),
        ]
        verbose_name = "Závod"
        verbose_name_plural = "Závody"

    def __str__(self) -> str:
        return f"{self.name} ({self.date_start:%d.%m.%Y})"

    def save(self, *args, **kwargs):
        if not self.slug and self.name:
            # Auto-slug z jména + roku (aby stejný závod pro různé roky
            # měl unikátní slug: „utmb-2027").
            base = slugify(self.name)
            year_suffix = self.date_start.year if self.date_start else ""
            candidate = f"{base}-{year_suffix}" if year_suffix else base
            i = 2
            while Race.objects.exclude(pk=self.pk).filter(slug=candidate).exists():
                candidate = f"{base}-{year_suffix}-{i}"
                i += 1
            self.slug = candidate
        super().save(*args, **kwargs)

    @property
    def elevation_per_km(self) -> float | None:
        """m/km — strmostní ukazatel. None když převýšení neuvedeno."""
        if not self.elevation_m or not self.distance_km:
            return None
        return self.elevation_m / self.distance_km


class RaceFavorite(models.Model):
    """★ Uživatelovo „chci na tenhle závod jet" — soukromý bucket-list.
    Nikdo jiný to nevidí, jen sám user na `/kalendar?fav=1` filtru."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="race_favorites",
    )
    race = models.ForeignKey(
        Race,
        on_delete=models.CASCADE,
        related_name="favorites",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "races_favorite"
        unique_together = [("user", "race")]
        ordering = ["-created_at"]
        verbose_name = "Oblíbený závod"
        verbose_name_plural = "Oblíbené závody"

    def __str__(self) -> str:
        return f"{self.user_id} ★ {self.race_id}"
