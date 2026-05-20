"""User-scoped gear catalog + lists."""
from __future__ import annotations

import contextlib
import hashlib

from django.http import HttpResponseRedirect
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from .imports import import_notion_gear_csv
from .models import GearItem, GearLinkClick, GearList, GearListItem
from .serializers import (
    GearItemSerializer,
    GearListEntrySerializer,
    GearListSerializer,
    PublicGearListSerializer,
    _apply_affiliate_partners,
)

_BOT_HINTS = ("bot", "crawler", "spider", "preview", "fetch", "monitor", "scrape")

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
    if "visibility" in request.data:
        v = str(request.data["visibility"]).strip()
        valid = {c for c, _ in GearList.VISIBILITY_CHOICES}
        if v in valid:
            glist.visibility = v
    glist.save()
    return Response(GearListSerializer(glist).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def public_gear_list(request: Request, slug: str) -> Response:
    """Public landing for a shared gear list.

    Anyone with the URL can view if visibility is unlisted OR public.
    Private lists 404 to non-owners (no existence leak)."""
    try:
        glist = GearList.objects.select_related("user").prefetch_related(
            "entries__item"
        ).get(slug=slug)
    except GearList.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    is_owner = (
        request.user.is_authenticated and request.user.id == glist.user_id
    )
    if glist.visibility == GearList.VISIBILITY_PRIVATE and not is_owner:
        return Response(status=status.HTTP_404_NOT_FOUND)
    return Response(PublicGearListSerializer(glist).data)


@api_view(["GET"])
@permission_classes([AllowAny])
def gear_link_click(request: Request, slug: str, entry_id: int):
    """Redirect endpoint that logs an outbound click then 302s to the
    item's affiliate-rewritten URL. Mounted under /api/gear/g/ so the
    path stays short for human-visible status bars.

    Owner clicks are tracked but easy to filter out later via ip_hash
    if needed. Obvious bots are skipped so counts reflect humans."""
    try:
        entry = (
            GearListItem.objects.select_related(
                "gear_list", "item", "item__user"
            )
            .get(pk=entry_id, gear_list__slug=slug)
        )
    except GearListItem.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    glist = entry.gear_list
    is_owner = (
        request.user.is_authenticated and request.user.id == glist.user_id
    )
    if glist.visibility == GearList.VISIBILITY_PRIVATE and not is_owner:
        return Response(status=status.HTTP_404_NOT_FOUND)

    partners = getattr(entry.item.user, "affiliate_partners", None) or []
    target = _apply_affiliate_partners(entry.item.url, partners)
    if not target:
        return Response(status=status.HTTP_404_NOT_FOUND)

    # Best-effort logging — never let tracking break the redirect.
    ua = request.META.get("HTTP_USER_AGENT", "")[:300]
    if not any(b in ua.lower() for b in _BOT_HINTS):
        ip = (
            request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip()
            or request.META.get("REMOTE_ADDR", "")
        )
        ip_hash = (
            hashlib.sha256(f"{ip}:gear".encode()).hexdigest()[:32]
            if ip
            else ""
        )
        with contextlib.suppress(Exception):
            GearLinkClick.objects.create(
                entry=entry,
                ip_hash=ip_hash,
                user_agent=ua,
                referer=request.META.get("HTTP_REFERER", "")[:600],
            )

    return HttpResponseRedirect(target)


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


# ---------------------------------------------------------------------------
# Import — Notion CSV upload
# ---------------------------------------------------------------------------


# Conservative cap. Notion exports are KBs, not MBs — anything bigger is
# almost certainly the wrong file. Keeps the parser from chewing on huge
# user-uploaded blobs.
_MAX_CSV_BYTES = 2 * 1024 * 1024  # 2 MB


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser])
def gear_import_csv(request: Request) -> Response:
    """Upload a Notion gear-database CSV and import into the caller's catalog.

    Idempotent — re-uploading the same export updates nothing (items
    upserted by name, list edges deduped). Field name: `file`. Returns
    counts so the UI can confirm what landed."""
    upload = request.FILES.get("file")
    if upload is None:
        return Response(
            {"file": "Vyber CSV soubor exportovaný z Notion."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if upload.size > _MAX_CSV_BYTES:
        return Response(
            {"file": "Soubor je moc velký (max 2 MB)."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        result = import_notion_gear_csv(
            user=request.user, csv_content=upload.read()
        )
    except UnicodeDecodeError:
        return Response(
            {"file": "Soubor není v UTF-8. Otevři a ulož jako UTF-8 CSV."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except Exception as e:
        return Response(
            {"file": f"Soubor se nepodařilo zpracovat: {e}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Response(
        {
            "rows": result.rows,
            "items_created": result.items_created,
            "items_backfilled": result.items_backfilled,
            "lists_total": result.lists_total,
            "edges_created": result.edges_created,
        }
    )
