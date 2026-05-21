"""User-facing notification feed endpoints.

Slice 1 surface — read-only for the bell dropdown + mark-read
actions. No fan-out triggers yet; those come in slice 2 once we
wire signals from discussions / events / payments.
"""
from __future__ import annotations

from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from .models import Notification
from .serializers import NotificationSerializer


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def notification_list(request: Request) -> Response:
    """List notifications for the calling user, newest first.

    Query params:
      - `unread_only=1` — only items where read_at is null.
      - `limit=N` — default 50, capped at 200. The bell dropdown
        only renders a few; admin view (V1.5) can paginate.
    """
    qs = Notification.objects.filter(recipient=request.user)
    if request.query_params.get("unread_only") in ("1", "true"):
        qs = qs.filter(read_at__isnull=True)
    try:
        limit = int(request.query_params.get("limit", 50))
    except ValueError:
        limit = 50
    limit = max(1, min(limit, 200))
    return Response(
        NotificationSerializer(qs[:limit], many=True).data,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def notification_count(request: Request) -> Response:
    """Unread badge count. Lightweight — bell polls this every minute.

    Polled often, so it intentionally returns just the integer so
    the response stays tiny.
    """
    unread = Notification.objects.filter(
        recipient=request.user, read_at__isnull=True
    ).count()
    return Response({"unread": unread})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def notification_mark_read(request: Request, notification_id: int) -> Response:
    """Mark a single notification read. Idempotent — re-marking a
    read row is a no-op."""
    try:
        notif = Notification.objects.get(
            pk=notification_id, recipient=request.user
        )
    except Notification.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    notif.mark_read()
    return Response(NotificationSerializer(notif).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def notification_mark_all_read(request: Request) -> Response:
    """Clear the bell — mark every unread notification of the caller
    as read in a single update()."""
    flipped = Notification.objects.filter(
        recipient=request.user, read_at__isnull=True
    ).update(read_at=timezone.now())
    return Response({"flipped": flipped})
