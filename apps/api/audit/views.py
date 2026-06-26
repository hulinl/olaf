"""Audit list endpoint for the /admin/audit page.

Workspace-scoped read. Anyone the user can `manage` (owner/admin on
the workspace) can see the workspace's audit feed. No global feed —
audit is per-tenant by design.
"""
from __future__ import annotations

from django.db.models import Q
from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from workspaces.models import Workspace, WorkspaceMember

from .models import AuditLog

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200


def _can_view_workspace_audit(user, workspace: Workspace) -> bool:
    return WorkspaceMember.objects.filter(
        workspace=workspace,
        user=user,
        role__in=[
            WorkspaceMember.ROLE_OWNER,
            WorkspaceMember.ROLE_ADMIN,
        ],
    ).exists()


def _serialize_row(row: AuditLog) -> dict:
    return {
        "id": row.pk,
        "action": row.action,
        "summary": row.summary,
        "target_type": row.target_type,
        "target_id": row.target_id,
        "payload": row.payload,
        "created_at": row.created_at.isoformat(),
        "actor": (
            {
                "id": row.actor.pk,
                "full_name": row.actor.get_full_name(),
                "email": row.actor.email,
            }
            if row.actor
            else None
        ),
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_audit_log(request: Request) -> Response:
    """Filter axes:
      - workspace (slug, required) — tenant scoping
      - action (optional) — exact match on dotted code
      - target_type / target_id (optional) — when drilling into one row
      - after / before (ISO datetimes) — time window
      - q (optional) — full-text-ish search (actor name/email + summary)
      - page / page_size (default 50, max 200)
    """
    workspace_slug = (request.query_params.get("workspace") or "").strip()
    if not workspace_slug:
        return Response(
            {"workspace": "Workspace slug je povinný."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        workspace = Workspace.objects.get(slug=workspace_slug)
    except Workspace.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not _can_view_workspace_audit(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    qs = AuditLog.objects.filter(workspace=workspace).select_related("actor")

    action = (request.query_params.get("action") or "").strip()
    if action:
        qs = qs.filter(action=action)

    target_type = (request.query_params.get("target_type") or "").strip()
    if target_type:
        qs = qs.filter(target_type=target_type)
    target_id = (request.query_params.get("target_id") or "").strip()
    if target_id:
        qs = qs.filter(target_id=target_id)

    after = request.query_params.get("after")
    if after:
        dt = parse_datetime(after)
        if dt is not None:
            qs = qs.filter(created_at__gte=dt)
    before = request.query_params.get("before")
    if before:
        dt = parse_datetime(before)
        if dt is not None:
            qs = qs.filter(created_at__lt=dt)

    # Free-text search — používáme to když uživatel zadá jméno
    # osoby nebo slovo z popisu („kdo schválil Mahdala"). icontains
    # je pro V1 dost rychlé (audit feed má desítky/stovky řádků
    # per workspace).
    q_term = (request.query_params.get("q") or "").strip()
    if q_term:
        qs = qs.filter(
            Q(summary__icontains=q_term)
            | Q(actor__first_name__icontains=q_term)
            | Q(actor__last_name__icontains=q_term)
            | Q(actor__email__icontains=q_term)
        )

    # Lightweight cursor: page + page_size. Audit feeds are append-only
    # so plain offset paging is fine — no risk of mid-scan shifts.
    try:
        page = max(1, int(request.query_params.get("page", "1")))
    except ValueError:
        page = 1
    try:
        page_size = int(request.query_params.get("page_size", DEFAULT_PAGE_SIZE))
    except ValueError:
        page_size = DEFAULT_PAGE_SIZE
    page_size = max(1, min(page_size, MAX_PAGE_SIZE))

    total = qs.count()
    start = (page - 1) * page_size
    end = start + page_size
    rows = qs[start:end]

    return Response(
        {
            "total": total,
            "page": page,
            "page_size": page_size,
            "results": [_serialize_row(r) for r in rows],
        }
    )
