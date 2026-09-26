"""Public race calendar API — list, favorite toggle.

Endpoints:
- GET  /api/races/               — list visible races (default: from today onward)
- POST /api/races/<slug>/favorite/    — toggle ★ (auth required)

Filtry přes query params:
- ?past=1 — include past races (default excluded)
- ?month=YYYY-MM — jen daný měsíc
- ?country=Česko — přesná země
- ?series=utmb — série (utmb/wtm/sky/major/indep)
- ?q=Beskyd — full-text v name/location/highlight
- ?fav=1 — jen moje oblíbené (auth required)
"""
from __future__ import annotations

from datetime import date

from django.db.models import Q, QuerySet
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from .models import Race, RaceFavorite
from .serializers import RaceSerializer


def _apply_filters(qs: QuerySet[Race], request: Request) -> QuerySet[Race]:
    """Aplikuje query-param filtry na queryset. Extrahované, ať list/mine
    endpointy sdílejí logiku bez duplicity."""

    # Default: od dneška dál. Explicit `past=1` opt-in pro archive view.
    if request.query_params.get("past") != "1":
        qs = qs.filter(date_start__gte=date.today())

    year = request.query_params.get("year")
    if year and year.isdigit():
        y_int = int(year)
        qs = qs.filter(date_start__year=y_int)

    month = request.query_params.get("month")
    if month:
        # Formát YYYY-MM. Interpretujeme jako datum ve tvaru YYYY-MM-01 do
        # last-day-of-month.
        try:
            year, mnum = month.split("-")
            year_i, m_i = int(year), int(mnum)
            if 1 <= m_i <= 12:
                start = date(year_i, m_i, 1)
                # Next month first day — přes 12 wraparound roku.
                end = (
                    date(year_i + 1, 1, 1)
                    if m_i == 12
                    else date(year_i, m_i + 1, 1)
                )
                qs = qs.filter(date_start__gte=start, date_start__lt=end)
        except (ValueError, TypeError):
            # Silent no-op na malformed month — endpoint zůstává funkční.
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

    q = request.query_params.get("q")
    if q:
        qs = qs.filter(
            Q(name__icontains=q)
            | Q(location__icontains=q)
            | Q(country__icontains=q)
            | Q(highlight__icontains=q)
        )

    # Min/max distance filtr — např. ?min_km=40 pro „jen ultramaraton"
    min_km = request.query_params.get("min_km")
    if min_km and min_km.isdigit():
        qs = qs.filter(distance_km__gte=int(min_km))
    max_km = request.query_params.get("max_km")
    if max_km and max_km.isdigit():
        qs = qs.filter(distance_km__lte=int(max_km))

    return qs


@api_view(["GET"])
@permission_classes([AllowAny])
def race_list(request: Request) -> Response:
    """Public list. Anonymní request dostane `is_favorite=false` pro
    všechny. Autentizovaný dostane spočtené per-race.
    """
    qs = Race.objects.filter(is_visible=True)
    qs = _apply_filters(qs, request)

    # `fav=1` — jen moje oblíbené. Vyžaduje login (jinak vrací prázdno).
    if request.query_params.get("fav") == "1":
        if not request.user.is_authenticated:
            return Response({"detail": "Login required for favorites filter."}, status=status.HTTP_401_UNAUTHORIZED)
        qs = qs.filter(favorites__user=request.user)

    # Prefetch user favorites pro batch is_favorite computation (1 SQL
    # místo N).
    user_favorite_ids: set[int] = set()
    if request.user.is_authenticated:
        user_favorite_ids = set(
            RaceFavorite.objects.filter(user=request.user).values_list(
                "race_id", flat=True
            )
        )

    serializer = RaceSerializer(
        qs,
        many=True,
        context={"request": request, "user_favorite_ids": user_favorite_ids},
    )
    return Response({"count": qs.count(), "results": serializer.data})


@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated])
def race_favorite_toggle(request: Request, slug: str) -> Response:
    """POST = přidat ★, DELETE = odebrat. Idempotentní — dvakrát POST
    neselže, dvakrát DELETE taky ne."""
    race = get_object_or_404(Race, slug=slug, is_visible=True)

    if request.method == "POST":
        RaceFavorite.objects.get_or_create(user=request.user, race=race)
        return Response(
            {"is_favorite": True, "race_id": race.id},
            status=status.HTTP_200_OK,
        )

    # DELETE
    RaceFavorite.objects.filter(user=request.user, race=race).delete()
    return Response(
        {"is_favorite": False, "race_id": race.id},
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def race_countries(request: Request) -> Response:
    """Distinct list zemí, které mají alespoň jeden viditelný závod od
    dneška dál. Frontend to používá pro country filter chip."""
    countries = (
        Race.objects.filter(is_visible=True, date_start__gte=date.today())
        .exclude(country="")
        .values_list("country", flat=True)
        .distinct()
        .order_by("country")
    )
    return Response({"countries": list(countries)})
