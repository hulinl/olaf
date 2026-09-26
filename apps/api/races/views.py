"""Public race calendar API — list, favorite toggle, user race plan.

Endpoints:
- GET    /api/races/                          — list visible races
- GET    /api/races/countries/                — distinct countries
- POST   /api/races/<slug>/favorite/          — add ★, optional {status, note}
- PATCH  /api/races/<slug>/favorite/          — update status/note
- DELETE /api/races/<slug>/favorite/          — remove ★
- GET    /api/races/mine/                     — my race plan (auth)
- GET    /api/races/plan/<user_slug>/         — public race plan per user

Filtry přes query params (list):
- ?past=1 — include past races
- ?from=YYYY-MM-DD&to=YYYY-MM-DD — date range
- ?year=YYYY, ?month=YYYY-MM — legacy single-year/month picks
- ?country=Česko, ?region=CZ, ?sport=trail
- ?series=utmb, ?min_km=40&max_km=200
- ?q=Beskyd — full-text
- ?fav=1 — jen moje oblíbené (auth)
- ?top=1 — jen top výběr
"""
from __future__ import annotations

import contextlib
from datetime import date

from django.db.models import Q, QuerySet
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from .models import Race, RaceFavorite
from .serializers import RaceFavoriteSerializer, RaceSerializer


def _apply_filters(qs: QuerySet[Race], request: Request) -> QuerySet[Race]:
    if request.query_params.get("past") != "1":
        qs = qs.filter(date_start__gte=date.today())

    year = request.query_params.get("year")
    if year and year.isdigit():
        qs = qs.filter(date_start__year=int(year))

    date_from = request.query_params.get("from")
    if date_from:
        with contextlib.suppress(ValueError):
            qs = qs.filter(date_start__gte=date.fromisoformat(date_from))
    date_to = request.query_params.get("to")
    if date_to:
        with contextlib.suppress(ValueError):
            qs = qs.filter(date_start__lte=date.fromisoformat(date_to))

    month = request.query_params.get("month")
    if month:
        try:
            year_s, mnum = month.split("-")
            year_i, m_i = int(year_s), int(mnum)
            if 1 <= m_i <= 12:
                start = date(year_i, m_i, 1)
                end = (
                    date(year_i + 1, 1, 1)
                    if m_i == 12
                    else date(year_i, m_i + 1, 1)
                )
                qs = qs.filter(date_start__gte=start, date_start__lt=end)
        except (ValueError, TypeError):
            pass

    country = request.query_params.get("country")
    if country:
        qs = qs.filter(country__iexact=country)

    series = request.query_params.get("series")
    if series:
        qs = qs.filter(series=series)

    sport = request.query_params.get("sport")
    if sport:
        qs = qs.filter(sport=sport)

    region = request.query_params.get("region")
    if region:
        qs = qs.filter(region=region)

    if request.query_params.get("top") == "1":
        qs = qs.filter(is_top=True)

    q = request.query_params.get("q")
    if q:
        qs = qs.filter(
            Q(name__icontains=q)
            | Q(location__icontains=q)
            | Q(country__icontains=q)
            | Q(highlight__icontains=q)
        )

    min_km = request.query_params.get("min_km")
    if min_km and min_km.isdigit():
        qs = qs.filter(distance_km__gte=int(min_km))
    max_km = request.query_params.get("max_km")
    if max_km and max_km.isdigit():
        qs = qs.filter(distance_km__lte=int(max_km))

    return qs


def _user_fav_status(user) -> dict[int, dict[str, str]]:
    """Vrátí dict race_id → {status, note} pro bulk lookup v seriálu."""
    if not user or not user.is_authenticated:
        return {}
    return {
        row["race_id"]: {"status": row["status"], "note": row["note"]}
        for row in RaceFavorite.objects.filter(user=user).values(
            "race_id", "status", "note"
        )
    }


@api_view(["GET"])
@permission_classes([AllowAny])
def race_list(request: Request) -> Response:
    qs = Race.objects.filter(is_visible=True)
    qs = _apply_filters(qs, request)

    if request.query_params.get("fav") == "1":
        if not request.user.is_authenticated:
            return Response(
                {"detail": "Login required for favorites filter."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        qs = qs.filter(favorites__user=request.user)

    lookup = _user_fav_status(request.user)
    serializer = RaceSerializer(
        qs,
        many=True,
        context={"request": request, "user_favorite_status": lookup},
    )
    return Response({"count": qs.count(), "results": serializer.data})


@api_view(["POST", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def race_favorite_toggle(request: Request, slug: str) -> Response:
    """POST — add/replace ★ s optional status/note.
    PATCH — update pouze status/note bez re-create.
    DELETE — remove ★.
    """
    race = get_object_or_404(Race, slug=slug, is_visible=True)

    valid_statuses = {v for v, _ in RaceFavorite.STATUS_CHOICES}

    if request.method in {"POST", "PATCH"}:
        payload_status = request.data.get("status")
        payload_note = request.data.get("note")

        if payload_status is not None and payload_status not in valid_statuses:
            return Response(
                {"status": f"Neznámý status. Povolené: {sorted(valid_statuses)}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if request.method == "POST":
            fav, created = RaceFavorite.objects.get_or_create(
                user=request.user, race=race
            )
            # POST bez status → default `interested` na new, keep na existing
            if payload_status:
                fav.status = payload_status
            elif created:
                # already default from model
                pass
            if payload_note is not None:
                fav.note = payload_note[:280]
            fav.save()
        else:
            # PATCH — musí existovat
            fav = RaceFavorite.objects.filter(user=request.user, race=race).first()
            if not fav:
                return Response(
                    {"detail": "Race není v tvém plánu — nejdřív POST."},
                    status=status.HTTP_404_NOT_FOUND,
                )
            if payload_status is not None:
                fav.status = payload_status
            if payload_note is not None:
                fav.note = payload_note[:280]
            fav.save()

        return Response(
            RaceFavoriteSerializer(
                fav, context={"request": request}
            ).data
        )

    # DELETE
    RaceFavorite.objects.filter(user=request.user, race=race).delete()
    return Response({"deleted": True}, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def race_plan_mine(request: Request) -> Response:
    """Vrátí kompletní race plán aktuálního usera. Filtry přes:
    - ?status=interested / registered / … (single)
    - ?year=YYYY (odpovídá race.next_year)
    - ?sport=trail / skialp
    """
    qs = RaceFavorite.objects.filter(user=request.user).select_related("race")
    st = request.query_params.get("status")
    if st:
        qs = qs.filter(status=st)
    year = request.query_params.get("year")
    if year and year.isdigit():
        qs = qs.filter(race__next_year=int(year))
    sport = request.query_params.get("sport")
    if sport:
        qs = qs.filter(race__sport=sport)

    qs = qs.order_by("race__date_start")

    serializer = RaceFavoriteSerializer(
        qs, many=True, context={"request": request}
    )
    return Response({"count": qs.count(), "results": serializer.data})


@api_view(["GET"])
@permission_classes([AllowAny])
def race_plan_public(request: Request, user_slug: str) -> Response:
    """Public race plan per user slug — pro sdílení („mrkni na můj
    race plán 2027"). Vrátí jen non-private records (do budoucna
    per-entry visibility field). Zatím vše viditelné.

    Filtry stejné jako mine/: ?status, ?year, ?sport.
    """
    from accounts.models import User

    user = User.objects.filter(profile_slug=user_slug).first()
    if not user:
        return Response(
            {"detail": "Profil nenalezen."}, status=status.HTTP_404_NOT_FOUND
        )

    qs = RaceFavorite.objects.filter(user=user).select_related("race")
    st = request.query_params.get("status")
    if st:
        qs = qs.filter(status=st)
    year = request.query_params.get("year")
    if year and year.isdigit():
        qs = qs.filter(race__next_year=int(year))
    sport = request.query_params.get("sport")
    if sport:
        qs = qs.filter(race__sport=sport)

    qs = qs.order_by("race__date_start")

    serializer = RaceFavoriteSerializer(
        qs, many=True, context={"request": request}
    )
    return Response(
        {
            "user": {
                "slug": user_slug,
                "display_name": user.get_full_name() or user_slug,
            },
            "count": qs.count(),
            "results": serializer.data,
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def race_sync_status(request: Request) -> Response:
    """Vrátí info o posledním úspěšném sync běhu — pro veřejný display
    „aktualizováno před X hodinami" na kalendáři. Buduje důvěru
    v aktuálnost dat.
    """
    from .models import SyncRun

    latest_ok = (
        SyncRun.objects.filter(status=SyncRun.STATUS_OK)
        .order_by("-created_at")
        .first()
    )
    latest_any = SyncRun.objects.order_by("-created_at").first()

    return Response(
        {
            "last_success": (
                {
                    "at": latest_ok.created_at.isoformat(),
                    "source": latest_ok.source,
                    "created": latest_ok.created_count,
                    "updated": latest_ok.updated_count,
                    "flagged": latest_ok.flagged_count,
                }
                if latest_ok
                else None
            ),
            "last_run": (
                {
                    "at": latest_any.created_at.isoformat(),
                    "status": latest_any.status,
                }
                if latest_any
                else None
            ),
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def race_countries(request: Request) -> Response:
    countries = (
        Race.objects.filter(is_visible=True, date_start__gte=date.today())
        .exclude(country="")
        .values_list("country", flat=True)
        .distinct()
        .order_by("country")
    )
    return Response({"countries": list(countries)})
