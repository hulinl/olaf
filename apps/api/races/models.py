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
        max_length=200,
        blank=True,
        default="",
        db_index=True,
        help_text=(
            "Země (Česko, Slovensko, Francie…). Multi-country povolen "
            'pro cross-border závody: „Francie / Itálie / Švýcarsko".'
        ),
    )
    # Regionální bucket pro grouping v UI. Volitelný — pokud prázdný,
    # frontend defaultuje na `country`. Extrahováno z Ultra kalendář
    # datasetu (CZ/ALP/SVET/SKPL/SEV/IBE/OST/BAL).
    REGION_CZ = "CZ"
    REGION_SK = "SK"
    REGION_PL = "PL"
    REGION_ALP = "ALP"
    # Deprecated (kept for data migration continuity — vsechny záznamy s
    # tímto kódem migrují na SK/PL podle country při 0006).
    REGION_SKPL = "SKPL"
    REGION_SEV = "SEV"
    REGION_IBE = "IBE"
    REGION_BAL = "BAL"
    REGION_OST = "OST"
    REGION_SVET = "SVET"
    REGION_CHOICES = [
        (REGION_CZ, "Česko"),
        (REGION_SK, "Slovensko"),
        (REGION_PL, "Polsko"),
        (REGION_ALP, "Alpy"),
        (REGION_SEV, "Skandinávie / sever"),
        (REGION_IBE, "Ibérie"),
        (REGION_BAL, "Balkán / Řecko"),
        (REGION_OST, "Ostrovy"),
        (REGION_SVET, "Svět"),
    ]
    region = models.CharField(
        max_length=10,
        choices=REGION_CHOICES,
        blank=True,
        default="",
        db_index=True,
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
    REG_UNKNOWN = "unknown"
    REG_CHOICES = [
        (REG_OPEN, "Přihlášky otevřeny"),
        (REG_LOTTERY, "Losování"),
        (REG_SOLD_OUT, "Vyprodáno"),
        (REG_QUALIFIER, "Nutná kvalifikace"),
        (REG_CLOSED, "Přihlášky uzavřeny"),
        (REG_UNKNOWN, "Nejasné / TBA"),
    ]
    registration_status = models.CharField(
        max_length=20,
        choices=REG_CHOICES,
        default=REG_OPEN,
    )
    # Full explanation string z reference (např. "loterie, obvykle
    # prosinec/leden, nutný Running Stone"). Frontend to ukazuje pod
    # status pillem — přesná parita s reference kalendářem, kde je
    # detail pro každý závod klíčový. Prázdné = jen status pill.
    registration_detail = models.TextField(
        blank=True,
        default="",
        help_text="Full description of how registration works.",
    )

    # --- Sport typ ---
    SPORT_TRAIL = "trail"
    SPORT_SKIALP = "skialp"
    SPORT_CHOICES = [
        (SPORT_TRAIL, "Běh / trail"),
        (SPORT_SKIALP, "Skialpinismus"),
    ]
    sport = models.CharField(
        max_length=20,
        choices=SPORT_CHOICES,
        default=SPORT_TRAIL,
        db_index=True,
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
    # Secondary distances string pro multi-distance závody, kde `distance_km`
    # drží primary (nejdelší) trať a tady visí kompletní roster.
    # Např. „174 / 148 (TDS) / 101 (CCC) / 60 (OCC) / 40 (MCC)".
    distances_note = models.CharField(
        max_length=200,
        blank=True,
        default="",
        help_text='Vedlejší distance stringy (např. „100/50/25").',
    )
    # Volitelný lidský string data pro TBA / rozsahy - frontend ho
    # ukazuje místo formátovaného date_start když je vyplněný. Př.
    # "konec srpna (TBA)" / "13.-19. 9. 2027".
    date_display = models.CharField(
        max_length=80,
        blank=True,
        default="",
        help_text="Human date string, override formátovaného date_start.",
    )

    # --- Meta ---
    is_visible = models.BooleanField(
        default=True,
        db_index=True,
        help_text="Soft-hide bez smazání (např. při chybném importu).",
    )
    # TOP flagship — vlajkové závody, které tvoří „Top výběr". Frontend
    # filter „TOP / Vše" zobrazuje jen top=True v „TOP" módu, jinak vše.
    is_top = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Flagship race — vlajkový závod pro Top výběr.",
    )
    # Warn flag — data uncertainty (termín se posunul, ročník zrušen,
    # nejasné). Frontend renderuje warn banner pod row.
    has_warning = models.BooleanField(
        default=False,
        help_text="Data mají neurčitost (zrušeno/nejisté/pauza).",
    )
    # Human-readable date label — reference používa "obvykle srpen"
    # pro TBAs, "24.-30. 8." pro potvrzené data. Fallback pro
    # `date_display` když je prázdný.
    next_label = models.CharField(
        max_length=100,
        blank=True,
        default="",
    )
    next_year = models.PositiveIntegerField(
        default=2027,
        db_index=True,
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


class SyncRun(models.Model):
    """Audit trail pro daily sync agent — každé volání command `sync_races`
    zaloguje výsledky. Admin může projít v Django adminu a vidí co se
    kdy změnilo, kdyby došlo k regresi nebo se něco naimportovalo špatně.
    """

    SOURCE_LOCAL = "local"
    SOURCE_REMOTE = "remote"
    SOURCE_CHOICES = [
        (SOURCE_LOCAL, "Local seed_data.json"),
        (SOURCE_REMOTE, "Remote GitHub raw"),
    ]

    STATUS_OK = "ok"
    STATUS_ERROR = "error"
    STATUS_PARTIAL = "partial"
    STATUS_CHOICES = [
        (STATUS_OK, "OK"),
        (STATUS_ERROR, "Chyba"),
        (STATUS_PARTIAL, "Částečný úspěch"),
    ]

    source = models.CharField(
        max_length=20, choices=SOURCE_CHOICES, default=SOURCE_LOCAL
    )
    source_url = models.URLField(
        blank=True,
        default="",
        help_text="Přesná URL, ze které se fetchovalo (remote případy).",
    )
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default=STATUS_OK
    )
    created_count = models.PositiveIntegerField(default=0)
    updated_count = models.PositiveIntegerField(default=0)
    skipped_count = models.PositiveIntegerField(default=0)
    flagged_count = models.PositiveIntegerField(
        default=0,
        help_text="Počet races které dostaly has_warning=True kvůli contradiction detection.",
    )
    error_message = models.TextField(blank=True, default="")
    changes = models.JSONField(
        default=list,
        blank=True,
        help_text=(
            "List of {slug, field, old, new} objects — konkrétní změny "
            "detected. Zobrazí se v admin diff view."
        ),
    )
    duration_ms = models.PositiveIntegerField(default=0)
    triggered_by = models.CharField(
        max_length=50,
        default="beat",
        help_text="`beat` (periodic task) / `manual` / `signal` (deploy hook).",
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "races_sync_run"
        ordering = ["-created_at"]
        verbose_name = "Sync běh"
        verbose_name_plural = "Sync běhy"

    def __str__(self) -> str:
        return (
            f"{self.created_at:%Y-%m-%d %H:%M} {self.source} "
            f"{self.status}: +{self.created_count} ~{self.updated_count}"
        )


class RaceFavorite(models.Model):
    """Uživatelův race plán — soukromý bucket-list s tracking statusem.

    Status distinguishes „mám v hledáčku" od „reálně přihlášen" — což
    je klíčové pro sharing přes public profile: „jaké závody běžím
    2027" (status=registered/waitlist) je jiná otázka než „co plánuju"
    (status=interested/waiting_registration).

    Public profile na `/u/<slug>` může tento plán publikovat (pokud
    user povolí — do budoucna field visibility) — atlet pošle URL
    kamkoli a lidi vidí jeho sezónní plán jako race resume.
    """

    STATUS_INTERESTED = "interested"
    STATUS_WAITING = "waiting_registration"
    STATUS_REGISTERED = "registered"
    STATUS_WAITLIST = "waitlist"
    STATUS_COMPLETED = "completed"
    STATUS_CHOICES = [
        (STATUS_INTERESTED, "Zajímá mě"),
        (STATUS_WAITING, "Čekám na registraci"),
        (STATUS_REGISTERED, "Registrován"),
        (STATUS_WAITLIST, "Na waitlistu"),
        (STATUS_COMPLETED, "Absolvoval"),
    ]

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
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default=STATUS_INTERESTED,
        db_index=True,
        help_text="Vztah uživatele k závodu (interested → completed).",
    )
    note = models.CharField(
        max_length=280,
        blank=True,
        default="",
        help_text='Osobní poznámka (např. „jedu s Martou, letenka koupená").',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "races_favorite"
        unique_together = [("user", "race")]
        ordering = ["-updated_at"]
        verbose_name = "Race plán"
        verbose_name_plural = "Race plány"

    def __str__(self) -> str:
        return f"{self.user_id} {self.status} {self.race_id}"
