"""Seed race calendar s klasikami z Ultra kalendář 2027 reference.

Idempotentní: pokud závod se stejným slugem už existuje, nic neudělá.
Idempotent pro dev + prod (můžeme volat opakovaně). Bootstrap 2027
season aby /kalendar nebyl prázdný na startu.
"""
from __future__ import annotations

from datetime import date

from django.core.management.base import BaseCommand
from django.db import transaction

from races.models import Race

SEED_RACES: list[dict] = [
    # České ultramaratony
    {
        "name": "Beskydská 7",
        "date_start": date(2027, 5, 22),
        "distance_km": 100,
        "elevation_m": 5400,
        "location": "Frenštát pod Radhoštěm",
        "country": "Česko",
        "terrain": "mountain trail",
        "url": "https://www.beskydska7.cz",
        "series": Race.SERIES_INDEP,
        "registration_status": Race.REG_OPEN,
        "highlight": "Klasika v Beskydech — 7 vrcholů v jednom dni, přes 5 000 D+.",
    },
    {
        "name": "Šumava ultramaraton",
        "date_start": date(2027, 6, 5),
        "distance_km": 80,
        "elevation_m": 2600,
        "location": "Kašperské Hory",
        "country": "Česko",
        "terrain": "trail",
        "url": "",
        "series": Race.SERIES_INDEP,
        "registration_status": Race.REG_OPEN,
        "highlight": "Klasika napříč národním parkem, měkký terén.",
    },
    {
        "name": "Jeseníky ultra trail",
        "date_start": date(2027, 7, 3),
        "distance_km": 110,
        "elevation_m": 4800,
        "location": "Karlova Studánka",
        "country": "Česko",
        "terrain": "mountain",
        "url": "",
        "series": Race.SERIES_INDEP,
        "registration_status": Race.REG_OPEN,
        "highlight": "Kolem Pradědu, hřebenovka nad 1 400 m po celé délce.",
    },
    # Slovensko
    {
        "name": "Vysoké Tatry ultra",
        "date_start": date(2027, 8, 14),
        "distance_km": 100,
        "elevation_m": 6200,
        "location": "Poprad",
        "country": "Slovensko",
        "terrain": "high mountain",
        "url": "",
        "series": Race.SERIES_INDEP,
        "registration_status": Race.REG_OPEN,
        "highlight": "Nejvyšší převýšení sezóny na V4, tvrdá kamenná trail.",
    },
    # Evropa / UTMB / WTM
    {
        "name": "UTMB Mont-Blanc",
        "date_start": date(2027, 8, 27),
        "date_end": date(2027, 8, 29),
        "distance_km": 171,
        "elevation_m": 10000,
        "location": "Chamonix",
        "country": "Francie",
        "terrain": "high mountain",
        "url": "https://utmbmontblanc.com",
        "series": Race.SERIES_UTMB,
        "registration_status": Race.REG_LOTTERY,
        "highlight": "Královna ultramaratonů — kolem Mont Blancu, 3 země.",
    },
    {
        "name": "Lavaredo Ultra Trail",
        "date_start": date(2027, 6, 24),
        "date_end": date(2027, 6, 26),
        "distance_km": 120,
        "elevation_m": 5850,
        "location": "Cortina d'Ampezzo",
        "country": "Itálie",
        "terrain": "high mountain",
        "url": "https://ultratrail.it",
        "series": Race.SERIES_UTMB,
        "registration_status": Race.REG_OPEN,
        "highlight": "Dolomity — Tre Cime, noc pod hvězdami.",
    },
    {
        "name": "Transgrancanaria",
        "date_start": date(2027, 3, 5),
        "date_end": date(2027, 3, 7),
        "distance_km": 128,
        "elevation_m": 7500,
        "location": "Las Palmas",
        "country": "Španělsko",
        "terrain": "trail",
        "url": "https://transgrancanaria.net",
        "series": Race.SERIES_UTMB,
        "registration_status": Race.REG_OPEN,
        "highlight": "Kanárské ostrovy, přes celý ostrov od severu na jih.",
    },
    {
        "name": "Madeira Island Ultra Trail",
        "date_start": date(2027, 4, 22),
        "date_end": date(2027, 4, 24),
        "distance_km": 115,
        "elevation_m": 7100,
        "location": "Machico",
        "country": "Portugalsko",
        "terrain": "trail",
        "url": "https://www.miut.pt",
        "series": Race.SERIES_UTMB,
        "registration_status": Race.REG_OPEN,
        "highlight": "Sopečný ostrov, oceán z obou stran, levadas.",
    },
    {
        "name": "Eiger Ultra Trail",
        "date_start": date(2027, 7, 17),
        "distance_km": 101,
        "elevation_m": 6700,
        "location": "Grindelwald",
        "country": "Švýcarsko",
        "terrain": "high mountain",
        "url": "https://eigerultratrail.ch",
        "series": Race.SERIES_UTMB,
        "registration_status": Race.REG_OPEN,
        "highlight": "Pod severní stěnou Eigeru — Bernese Oberland classic.",
    },
    {
        "name": "Ultra Pirineu",
        "date_start": date(2027, 9, 25),
        "date_end": date(2027, 9, 26),
        "distance_km": 100,
        "elevation_m": 6800,
        "location": "Bagà, Katalánsko",
        "country": "Španělsko",
        "terrain": "high mountain",
        "url": "https://ultrapirineu.com",
        "series": Race.SERIES_SKY,
        "registration_status": Race.REG_OPEN,
        "highlight": "Skyrunner Series — hřebeny Cadí-Moixeró.",
    },
    {
        "name": "Grand Raid Réunion (Diagonale des Fous)",
        "date_start": date(2027, 10, 21),
        "date_end": date(2027, 10, 24),
        "distance_km": 165,
        "elevation_m": 10000,
        "location": "Cilaos",
        "country": "Réunion",
        "terrain": "high mountain",
        "url": "https://www.grandraid-reunion.com",
        "series": Race.SERIES_MAJOR,
        "registration_status": Race.REG_LOTTERY,
        "highlight": '„Blázni diagonály" — nejtvrdší 100mi na světě.',
    },
    {
        "name": "Western States 100",
        "date_start": date(2027, 6, 26),
        "date_end": date(2027, 6, 27),
        "distance_km": 161,
        "elevation_m": 5500,
        "location": "Olympic Valley, CA",
        "country": "USA",
        "terrain": "trail",
        "url": "https://www.wser.org",
        "series": Race.SERIES_WTM,
        "registration_status": Race.REG_LOTTERY,
        "highlight": "Nejslavnější stovka na světě, Sierra Nevada.",
    },
]


class Command(BaseCommand):
    help = "Seed race calendar s klasikami sezóny 2027 (idempotentní)."

    def handle(self, *args, **options) -> None:
        created = 0
        skipped = 0
        with transaction.atomic():
            for data in SEED_RACES:
                # Slug se dogeneruje v save() — pokud už existuje závod
                # stejného jména + roku, save() by hodil unique
                # violation. Idempotency zajistíme lookup přes name +
                # date_start.
                if Race.objects.filter(
                    name=data["name"], date_start=data["date_start"]
                ).exists():
                    skipped += 1
                    continue
                Race.objects.create(**data)
                created += 1
        self.stdout.write(
            self.style.SUCCESS(
                f"seed_races: vytvořeno {created}, přeskočeno {skipped}"
            )
        )
