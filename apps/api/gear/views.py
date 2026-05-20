"""User-scoped gear catalog + lists."""
from __future__ import annotations

import contextlib

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from .models import GearItem, GearList, GearListItem
from .serializers import (
    GearItemSerializer,
    GearListEntrySerializer,
    GearListSerializer,
)

# ---------------------------------------------------------------------------
# Items
# ---------------------------------------------------------------------------


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def gear_items(request: Request) -> Response:
    if request.method == "GET":
        qs = GearItem.objects.filter(user=request.user)
        return Response(GearItemSerializer(qs, many=True).data)
    serializer = GearItemSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    item = serializer.save(user=request.user)
    return Response(
        GearItemSerializer(item).data, status=status.HTTP_201_CREATED
    )


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def gear_item_detail(request: Request, item_id: int) -> Response:
    try:
        item = GearItem.objects.get(pk=item_id, user=request.user)
    except GearItem.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if request.method == "DELETE":
        item.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    if request.method == "GET":
        return Response(GearItemSerializer(item).data)
    serializer = GearItemSerializer(item, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


# ---------------------------------------------------------------------------
# Lists
# ---------------------------------------------------------------------------


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def gear_lists(request: Request) -> Response:
    if request.method == "GET":
        qs = (
            GearList.objects.filter(user=request.user)
            .prefetch_related("entries__item")
        )
        return Response(GearListSerializer(qs, many=True).data)
    name = (request.data.get("name") or "").strip()
    if not name:
        return Response(
            {"name": "Vyplň název."}, status=status.HTTP_400_BAD_REQUEST
        )
    glist = GearList.objects.create(
        user=request.user,
        name=name[:200],
        description=(request.data.get("description") or "").strip(),
    )
    return Response(
        GearListSerializer(glist).data, status=status.HTTP_201_CREATED
    )


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def gear_list_detail(request: Request, list_id: int) -> Response:
    try:
        glist = GearList.objects.prefetch_related("entries__item").get(
            pk=list_id, user=request.user
        )
    except GearList.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if request.method == "DELETE":
        glist.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    if request.method == "GET":
        return Response(GearListSerializer(glist).data)
    if "name" in request.data:
        n = str(request.data["name"]).strip()
        if n:
            glist.name = n[:200]
    if "description" in request.data:
        glist.description = str(request.data["description"]).strip()
    glist.save()
    return Response(GearListSerializer(glist).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def gear_list_add_item(request: Request, list_id: int) -> Response:
    """Add an item to a list. Body: {item_id, quantity?, note?}.

    If the item is already in the list, just bumps the quantity (no
    duplicate row — enforced by the unique constraint anyway)."""
    try:
        glist = GearList.objects.get(pk=list_id, user=request.user)
    except GearList.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    item_id = request.data.get("item_id")
    if not item_id:
        return Response(
            {"item_id": "Vyber položku."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        item = GearItem.objects.get(pk=item_id, user=request.user)
    except GearItem.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    next_sort = (
        glist.entries.order_by("-sort_order")
        .values_list("sort_order", flat=True)
        .first()
        or 0
    ) + 1
    entry, created = GearListItem.objects.get_or_create(
        gear_list=glist,
        item=item,
        defaults={
            "quantity": int(request.data.get("quantity") or 1),
            "sort_order": next_sort,
            "note": str(request.data.get("note") or "").strip()[:200],
        },
    )
    if not created:
        entry.quantity += int(request.data.get("quantity") or 1)
        entry.save(update_fields=["quantity"])
    return Response(
        GearListEntrySerializer(entry).data,
        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
    )


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def gear_list_entry_detail(
    request: Request, list_id: int, entry_id: int
) -> Response:
    try:
        entry = GearListItem.objects.select_related("gear_list").get(
            pk=entry_id, gear_list__pk=list_id, gear_list__user=request.user
        )
    except GearListItem.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if request.method == "DELETE":
        entry.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    if "quantity" in request.data:
        try:
            q = int(request.data["quantity"])
            entry.quantity = max(1, q)
        except (TypeError, ValueError):
            pass
    if "note" in request.data:
        entry.note = str(request.data["note"]).strip()[:200]
    if "sort_order" in request.data:
        with contextlib.suppress(TypeError, ValueError):
            entry.sort_order = int(request.data["sort_order"])
    entry.save()
    return Response(GearListEntrySerializer(entry).data)
