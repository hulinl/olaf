"""Personal calendar API — CRUD sources + aggregated busy-days query.

Endpointy (all auth):
- GET  /api/personal-calendar/sources/        — list mých sources
- POST /api/personal-calendar/sources/        — přidat source
- PATCH  /api/personal-calendar/sources/<id>/ — update name/enabled/color
- DELETE /api/personal-calendar/sources/<id>/ — smazat
- POST /api/personal-calendar/sources/<id>/sync/ — manual re-fetch
- GET  /api/personal-calendar/busy-days/?from=YYYY-MM-DD&to=YYYY-MM-DD
       — aggregated {'YYYY-MM-DD': True}
"""
from __future__ import annotations

import datetime as dt

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from .models import UserCalendarSource
from .services import aggregate_busy_days, sync_source


def _serialize_source(source: UserCalendarSource) -> dict:
    return {
        "id": source.id,
        "name": source.name,
        "ical_url": source.ical_url,
        "enabled": source.enabled,
        "color": source.color,
        "last_synced_at": (
            source.last_synced_at.isoformat() if source.last_synced_at else None
        ),
        "last_error": source.last_error,
        "block_count": len(source.busy_blocks or []),
        "created_at": source.created_at.isoformat(),
    }


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def sources_list(request: Request) -> Response:
    if request.method == "GET":
        rows = request.user.calendar_sources.all()
        return Response(
            {"sources": [_serialize_source(s) for s in rows]}
        )

    # POST
    name = (request.data.get("name") or "").strip()
    ical_url = (request.data.get("ical_url") or "").strip()
    color = (request.data.get("color") or "#0284c7").strip()
    if not name or not ical_url:
        return Response(
            {"detail": "Chybí `name` nebo `ical_url`."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not (ical_url.startswith("http://") or ical_url.startswith("https://")):
        return Response(
            {"detail": "URL musí začínat http:// nebo https://."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    source = UserCalendarSource.objects.create(
        user=request.user,
        name=name[:100],
        ical_url=ical_url[:1000],
        color=color[:7] or "#0284c7",
    )
    # Immediate sync — user by měl hned vidět jestli funguje.
    sync_source(source)
    source.refresh_from_db()
    return Response(_serialize_source(source), status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def source_detail(request: Request, source_id: int) -> Response:
    source = get_object_or_404(
        UserCalendarSource, pk=source_id, user=request.user
    )
    if request.method == "DELETE":
        source.delete()
        return Response({"deleted": True})

    # PATCH — allow name / enabled / color
    if "name" in request.data:
        source.name = (request.data["name"] or "").strip()[:100]
    if "enabled" in request.data:
        source.enabled = bool(request.data["enabled"])
    if "color" in request.data:
        source.color = (request.data["color"] or "#0284c7")[:7]
    source.save(update_fields=["name", "enabled", "color", "updated_at"])
    return Response(_serialize_source(source))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def source_sync(request: Request, source_id: int) -> Response:
    source = get_object_or_404(
        UserCalendarSource, pk=source_id, user=request.user
    )
    ok, message = sync_source(source)
    source.refresh_from_db()
    return Response(
        {
            **_serialize_source(source),
            "sync_ok": ok,
            "sync_message": message,
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def busy_days(request: Request) -> Response:
    """Vrátí busy-day set pro user's canvas view.

    Params:
    - from=YYYY-MM-DD (default: dnes)
    - to=YYYY-MM-DD (default: dnes + 365 dní)
    """
    today = dt.date.today()
    default_from = today
    default_to = today + dt.timedelta(days=365)
    try:
        from_date = (
            dt.date.fromisoformat(request.query_params["from"])
            if "from" in request.query_params
            else default_from
        )
        to_date = (
            dt.date.fromisoformat(request.query_params["to"])
            if "to" in request.query_params
            else default_to
        )
    except ValueError:
        return Response(
            {"detail": "Neplatný formát datumu, použij YYYY-MM-DD."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if to_date < from_date:
        return Response(
            {"detail": "`to` musí být >= `from`."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    days = aggregate_busy_days(request.user, from_date, to_date)
    return Response(
        {
            "from": from_date.isoformat(),
            "to": to_date.isoformat(),
            "busy_days": sorted(days.keys()),
        }
    )
