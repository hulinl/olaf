"""Daily sync agent — re-syncuje race records z reference datasetu.

Data sources (priorita):
1. `--source remote` → fetch z GitHub raw URL (živý reference dataset,
   updatuje se když maintainer commituje). Default URL:
   `https://raw.githubusercontent.com/hulinl/ultra-kalendar/main/data/events.json`
2. `--source local` → static `apps/api/races/seed_data.json` snapshot.
   Použij pro offline / dev / pokud remote je down.
3. Default (bez `--source`) → remote s automatickým fallbackem na local
   pokud fetch selže (HTTP error / timeout / parse error).

Každý běh loguje výsledek do `SyncRun` modelu (visibility v Django
admin): created/updated/skipped counts + changes list + duration +
error message. Beat scheduler ho spouští denně.

Idempotentní: matcha podle slug, updatuje jen změněné pole. Manuální
admin edity (highlight, custom fields) preservuje pokud user nezvolí
`--force`.

Server-side contradiction detection: pokud registration_status je
v konfliktu s registration_detail (např. sold_out ale detail říká
„otevírá se v prosinci"), autoflagne `has_warning=True` + přidá
změnu do audit trailu.

Manuální spuštění:
    python manage.py sync_races                     # auto (remote + fallback)
    python manage.py sync_races --source local      # static seed
    python manage.py sync_races --source remote     # remote only
    python manage.py sync_races --dry-run
    python manage.py sync_races --force             # přepíše admin edity
"""
from __future__ import annotations

import contextlib
import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from races.models import Race, SyncRun

SEED_PATH = Path(__file__).resolve().parent.parent.parent / "seed_data.json"
REMOTE_URL = (
    "https://raw.githubusercontent.com/hulinl/ultra-kalendar/main/data/events.json"
)

TYPE_MAP = {
    "V": Race.REG_OPEN,
    "L": Race.REG_LOTTERY,
    "S": Race.REG_SOLD_OUT,
    "K": Race.REG_CLOSED,
    "Q": Race.REG_UNKNOWN,
}
SPORT_MAP = {"beh": Race.SPORT_TRAIL, "skialp": Race.SPORT_SKIALP}
REGION_MAP = {
    "CZ": Race.REGION_CZ,
    "ALP": Race.REGION_ALP,
    "SKPL": Race.REGION_SK,  # legacy — default na SK, real split via 0006
    "SEV": Race.REGION_SEV,
    "IBE": Race.REGION_IBE,
    "BAL": Race.REGION_BAL,
    "OST": Race.REGION_OST,
    "SVET": Race.REGION_SVET,
}
TERRAIN_MAP = {
    "h": "hory",
    "t": "trail",
    "k": "lidový",
    "m": "maratonský",
    "e": "etapový",
    "s": "skialp",
    "z": "silniční / MTB",
}

# Server-side contradiction patterns — identical logic jako frontend
# isStatusContradicted, aby detection byla konzistentní. Když detail
# popírá deklarovaný status, flagne has_warning=True.
_OPENS_SOON = re.compile(
    r"otev[řír][eíaá]?|opens?\b|spouští"
    r"|start\s+(registrac|přihláš)"
    r"|(od|v)\s+\d"
    r"|(od|v)\s+(led|úno|břez|dub|květ|červ|srp|zář|říj|list|pros)"
    r"|(v\s+)?(listopad|prosin|led|únor)"
    r"|nejdřív|nejpozděj|registrac[eíi]\s+(od|v)",
    re.IGNORECASE,
)
_SOLD_OUT_KW = re.compile(
    r"vyprodán|sold\s?out|los\b|loterie|waitlist|kvalifik",
    re.IGNORECASE,
)


def _detect_contradiction(reg_status: str, detail: str) -> bool:
    if not detail:
        return False
    d = detail.lower()
    return (
        (
            reg_status
            in {Race.REG_SOLD_OUT, Race.REG_CLOSED, Race.REG_QUALIFIER}
            and bool(_OPENS_SOON.search(d))
        )
        or (reg_status == Race.REG_OPEN and bool(_SOLD_OUT_KW.search(d)))
    )


def _map_series(raw: str) -> str:
    if not raw:
        return Race.SERIES_INDEP
    lower = raw.lower()
    if "utmb" in lower:
        return Race.SERIES_UTMB
    if "world trail majors" in lower or "wtm" in lower:
        return Race.SERIES_WTM
    if "skyrunning" in lower or "skyrunner" in lower:
        return Race.SERIES_SKY
    if "sky" in lower and "trail" not in lower and "skialp" not in lower:
        return Race.SERIES_SKY
    if "la grande course" in lower or "grand course" in lower:
        return Race.SERIES_MAJOR
    if lower == "itra" or "itra pts" in lower:
        return Race.SERIES_MAJOR
    return Race.SERIES_INDEP


def _fetch_remote(url: str, timeout: float = 10.0) -> list[dict]:
    """HTTP GET → parse JSON → return events list. Raises on any error
    (caller rozhodne o fallbacku)."""
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "olaf-race-sync/1.0",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8")
    payload = json.loads(raw)
    events = payload.get("events", [])
    if not isinstance(events, list):
        raise ValueError("Payload doesn't contain events list")
    return events


def _load_local() -> list[dict]:
    if not SEED_PATH.exists():
        return []
    with open(SEED_PATH, encoding="utf-8") as f:
        payload = json.load(f)
    return payload.get("events", []) or []


class Command(BaseCommand):
    help = "Sync race records ze reference datasetu (remote or local)."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--source",
            choices=["remote", "local", "auto"],
            default="auto",
            help="Data source. auto=remote s fallbackem na local (default).",
        )
        parser.add_argument(
            "--remote-url",
            default=REMOTE_URL,
            help="Override remote URL.",
        )
        parser.add_argument("--dry-run", action="store_true")
        parser.add_argument(
            "--force",
            action="store_true",
            help="Přepíše i admin edity (highlight, is_visible).",
        )
        parser.add_argument(
            "--triggered-by",
            default="manual",
            help="Kdo tenhle běh vyvolal (beat / manual / signal).",
        )

    def handle(self, *args, **options) -> None:
        start = time.monotonic()
        source_flag = options["source"]
        remote_url = options["remote_url"]
        dry = options["dry_run"]
        force = options["force"]
        triggered_by = options["triggered_by"]

        # Fetch data
        source_used = SyncRun.SOURCE_LOCAL
        source_url = ""
        events: list[dict] = []
        error_msg = ""

        if source_flag in {"remote", "auto"}:
            try:
                events = _fetch_remote(remote_url)
                source_used = SyncRun.SOURCE_REMOTE
                source_url = remote_url
                self.stdout.write(
                    self.style.SUCCESS(
                        f"→ Remote fetch OK: {len(events)} events z {remote_url}"
                    )
                )
            except (
                urllib.error.URLError,
                urllib.error.HTTPError,
                json.JSONDecodeError,
                ValueError,
                TimeoutError,
            ) as exc:
                error_msg = f"Remote fetch failed: {exc}"
                self.stdout.write(self.style.WARNING(error_msg))
                if source_flag == "remote":
                    # Explicit remote → don't fallback
                    self._log_run(
                        source_used=SyncRun.SOURCE_REMOTE,
                        source_url=remote_url,
                        status=SyncRun.STATUS_ERROR,
                        error_message=error_msg,
                        triggered_by=triggered_by,
                        start=start,
                    )
                    return

        if not events:
            events = _load_local()
            source_used = SyncRun.SOURCE_LOCAL
            source_url = ""
            self.stdout.write(
                self.style.WARNING(
                    f"→ Local fallback: {len(events)} events z seed_data.json"
                )
            )

        if not events:
            self._log_run(
                source_used=source_used,
                source_url=source_url,
                status=SyncRun.STATUS_ERROR,
                error_message=error_msg or "No events available in any source.",
                triggered_by=triggered_by,
                start=start,
            )
            return

        # Sync
        created = updated = skipped = flagged = 0
        changes: list[dict[str, Any]] = []

        with transaction.atomic():
            for e in events:
                slug = e.get("id")
                if not slug:
                    continue

                fields = self._extract_fields(e)

                # Server-side contradiction detection — pokud detail
                # popírá status, flagne has_warning + zaloguje.
                if (
                    _detect_contradiction(
                        fields["registration_status"],
                        fields["registration_detail"],
                    )
                    and not fields["has_warning"]
                ):
                    fields["has_warning"] = True
                    # Nezvyšovat flagged pro každý běh — jen když
                    # se to fakt změnilo (viz apply_updates).

                existing = Race.objects.filter(slug=slug).first()
                if existing:
                    diff = self._diff_updates(existing, fields, force=force)
                    if diff:
                        if not dry:
                            for k, (_old, new) in diff.items():
                                setattr(existing, k, new)
                            existing.save()
                        updated += 1
                        for field, (old_v, new_v) in diff.items():
                            changes.append(
                                {
                                    "slug": slug,
                                    "field": field,
                                    "old": _safe(old_v),
                                    "new": _safe(new_v),
                                }
                            )
                            if field == "has_warning" and new_v:
                                flagged += 1
                    else:
                        skipped += 1
                else:
                    if not dry:
                        Race.objects.create(slug=slug, **fields)
                    created += 1
                    if fields["has_warning"]:
                        flagged += 1

        status = SyncRun.STATUS_OK
        self._log_run(
            source_used=source_used,
            source_url=source_url,
            status=status,
            created_count=created,
            updated_count=updated,
            skipped_count=skipped,
            flagged_count=flagged,
            changes=changes[:200],  # cap
            triggered_by=triggered_by,
            start=start,
        )

        self.stdout.write(
            self.style.SUCCESS(
                f"sync_races: +{created} nových, ~{updated} updatů, "
                f"={skipped} beze změny, ⚠{flagged} flagged"
                + (" [DRY]" if dry else "")
            )
        )

    def _extract_fields(self, e: dict) -> dict:
        km = e.get("km") or 0
        if not km or km < 1:
            km = 1
        return {
            "name": (e.get("name") or "").strip()[:200],
            "distance_km": int(round(km)),
            "distances_note": (e.get("distances") or "")[:200],
            "elevation_m": e.get("dplus") or None,
            "terrain": TERRAIN_MAP.get(e.get("terrain", ""), ""),
            "sport": SPORT_MAP.get(e.get("sport", "beh"), Race.SPORT_TRAIL),
            "location": (e.get("place") or "").strip()[:200],
            "country": (e.get("country") or "").strip()[:200],
            "region": REGION_MAP.get(e.get("region", ""), ""),
            "url": e.get("web") or "",
            "series": _map_series(e.get("series", "")),
            "registration_status": TYPE_MAP.get(
                (e.get("registration") or {}).get("type", "V"), Race.REG_OPEN
            ),
            "registration_detail": (
                (e.get("registration") or {}).get("detail", "") or ""
            )[:2000],
            "highlight": (e.get("highlight") or "")[:280],
            "is_top": bool(e.get("top", False)),
            "has_warning": bool(e.get("warn", False)),
            "next_label": ((e.get("next") or {}).get("label") or "")[:100],
            "next_year": int((e.get("next") or {}).get("year") or 2027),
        }

    def _diff_updates(
        self, race: Race, fields: dict, *, force: bool
    ) -> dict[str, tuple[Any, Any]]:
        """Vrátí dict field → (old_value, new_value) pro každou reálnou
        změnu. Když je race admin-edited (updated_at > created_at) a
        force=False, preservuje highlight."""
        admin_touched = race.updated_at > race.created_at
        skip_fields: set[str] = set()
        if admin_touched and not force:
            skip_fields = {"highlight"}

        diff: dict[str, tuple[Any, Any]] = {}
        for key, new_val in fields.items():
            if key in skip_fields:
                continue
            old_val = getattr(race, key)
            if old_val != new_val:
                diff[key] = (old_val, new_val)
        return diff

    def _log_run(
        self,
        *,
        source_used: str,
        source_url: str,
        status: str,
        triggered_by: str,
        start: float,
        error_message: str = "",
        created_count: int = 0,
        updated_count: int = 0,
        skipped_count: int = 0,
        flagged_count: int = 0,
        changes: list | None = None,
    ) -> None:
        duration_ms = int((time.monotonic() - start) * 1000)
        with contextlib.suppress(Exception):
            SyncRun.objects.create(
                source=source_used,
                source_url=source_url,
                status=status,
                created_count=created_count,
                updated_count=updated_count,
                skipped_count=skipped_count,
                flagged_count=flagged_count,
                error_message=error_message,
                changes=changes or [],
                duration_ms=duration_ms,
                triggered_by=triggered_by,
                created_at=timezone.now(),
            )


def _safe(value: Any) -> Any:
    """JSON-serializable snapshot hodnoty pro audit trail."""
    if value is None:
        return None
    if isinstance(value, str | int | float | bool):
        return value
    return str(value)[:200]
