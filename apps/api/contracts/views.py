"""Contracts views — workspace-scoped CRUD na šablony + per-event
config + per-RSVP smlouvy."""
from __future__ import annotations

import contextlib
import logging

from django.core.files.base import ContentFile
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from workspaces.models import Workspace, WorkspaceMember

from .models import ContractTemplate, EventContract, RSVPContract
from .serializers import (
    ContractTemplateSerializer,
    EventContractSerializer,
    RSVPContractSerializer,
)

logger = logging.getLogger(__name__)


def _is_workspace_owner(user, workspace: Workspace) -> bool:
    if not user or not user.is_authenticated:
        return False
    return WorkspaceMember.objects.filter(
        workspace=workspace,
        user=user,
        role__in=[WorkspaceMember.ROLE_OWNER, WorkspaceMember.ROLE_ADMIN],
    ).exists()


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def workspace_templates(
    request: Request, workspace_slug: str
) -> Response:
    """List nebo vytvoř šablony pro workspace."""
    try:
        workspace = Workspace.objects.get(slug=workspace_slug)
    except Workspace.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not _is_workspace_owner(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    if request.method == "GET":
        qs = ContractTemplate.objects.filter(workspace=workspace)
        return Response(ContractTemplateSerializer(qs, many=True).data)

    # POST
    name = (request.data.get("name") or "").strip()
    if not name:
        return Response(
            {"name": "Pojmenuj šablonu."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    template = ContractTemplate.objects.create(
        workspace=workspace,
        name=name[:200],
        description=(request.data.get("description") or "").strip(),
        body_html=request.data.get("body_html") or "",
        notion_url=(request.data.get("notion_url") or "").strip(),
        created_by=request.user,
    )
    return Response(
        ContractTemplateSerializer(template).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def template_detail(
    request: Request, workspace_slug: str, template_id: int
) -> Response:
    try:
        template = ContractTemplate.objects.select_related("workspace").get(
            pk=template_id, workspace__slug=workspace_slug
        )
    except ContractTemplate.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not _is_workspace_owner(request.user, template.workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    if request.method == "GET":
        return Response(ContractTemplateSerializer(template).data)

    if request.method == "DELETE":
        if EventContract.objects.filter(template=template).exists():
            return Response(
                {
                    "detail": (
                        "Šablonu nelze smazat — používá ji aspoň jedna "
                        "akce. Nejdřív ji odpoj v sekci Smlouva u eventu."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # PATCH
    for field in ("name", "description", "body_html", "notion_url"):
        if field in request.data:
            value = request.data[field]
            if isinstance(value, str) and field != "body_html":
                value = value.strip()
            setattr(template, field, value)
    template.save()
    return Response(ContractTemplateSerializer(template).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def template_sync_notion(
    request: Request, workspace_slug: str, template_id: int
) -> Response:
    """Stáhne body_html z Notion stránky."""
    try:
        template = ContractTemplate.objects.select_related("workspace").get(
            pk=template_id, workspace__slug=workspace_slug
        )
    except ContractTemplate.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not _is_workspace_owner(request.user, template.workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    if not template.notion_url:
        return Response(
            {"detail": "Šablona nemá uložený Notion URL."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    notion_token = getattr(request.user, "notion_token", "")
    anthropic_key = getattr(request.user, "anthropic_api_key", "")
    if not notion_token or not anthropic_key:
        return Response(
            {
                "detail": (
                    "Pro sync z Notion potřebuješ vyplnit Notion + "
                    "Anthropic API klíče v sekci Integrace."
                ),
                "missing": "notion" if not notion_token else "anthropic",
            },
            status=status.HTTP_412_PRECONDITION_FAILED,
        )

    from events.notion_ingest import IngestError

    from .notion_sync import sync_template_from_notion_url

    try:
        result = sync_template_from_notion_url(
            notion_url=template.notion_url,
            notion_token=notion_token,
            anthropic_api_key=anthropic_key,
        )
    except IngestError as e:
        return Response(
            {"detail": str(e), "missing": getattr(e, "code", "")},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except Exception as e:
        logger.exception("Notion sync failed for template %s", template.pk)
        return Response(
            {"detail": f"Sync selhal: {e!s}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    template.body_html = result["body_html"]
    template.last_synced_at = timezone.now()
    template.save(update_fields=["body_html", "last_synced_at", "updated_at"])
    return Response(ContractTemplateSerializer(template).data)


def _event_or_403(request, workspace_slug, event_slug):
    from events.models import Event

    try:
        event = Event.objects.select_related("workspace").get(
            workspace__slug=workspace_slug, slug=event_slug
        )
    except Event.DoesNotExist:
        return None, Response(status=status.HTTP_404_NOT_FOUND)
    if not _is_workspace_owner(request.user, event.workspace):
        return None, Response(status=status.HTTP_403_FORBIDDEN)
    return event, None


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def event_contract_config(
    request: Request, workspace_slug: str, event_slug: str
) -> Response:
    """GET — jak je event nakonfigurován; PUT — nastav; DELETE — odpoj."""
    event, err = _event_or_403(request, workspace_slug, event_slug)
    if err:
        return err

    try:
        existing = event.contract
    except EventContract.DoesNotExist:
        existing = None

    if request.method == "GET":
        if not existing:
            return Response({"configured": False})
        return Response(EventContractSerializer(existing).data)

    if request.method == "DELETE":
        if existing:
            existing.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    template_id = request.data.get("template")
    if not template_id:
        return Response(
            {"template": "Vyber šablonu smlouvy."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        template = ContractTemplate.objects.get(
            pk=template_id, workspace=event.workspace
        )
    except ContractTemplate.DoesNotExist:
        return Response(
            {"template": "Šablona neexistuje v této komunitě."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    auto_send = bool(request.data.get("auto_send_after_rsvp"))
    require_before_payment = bool(request.data.get("require_before_payment"))

    if existing:
        existing.template = template
        existing.auto_send_after_rsvp = auto_send
        existing.require_before_payment = require_before_payment
        existing.save()
        return Response(EventContractSerializer(existing).data)
    contract = EventContract.objects.create(
        event=event,
        template=template,
        auto_send_after_rsvp=auto_send,
        require_before_payment=require_before_payment,
    )
    return Response(
        EventContractSerializer(contract).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def event_rsvp_contracts(
    request: Request, workspace_slug: str, event_slug: str
) -> Response:
    """List všech RSVPContract pro daný event."""
    event, err = _event_or_403(request, workspace_slug, event_slug)
    if err:
        return err
    qs = (
        RSVPContract.objects.filter(rsvp__event=event)
        .select_related("rsvp__user", "event_contract__template")
        .order_by("-created_at")
    )
    return Response(
        RSVPContractSerializer(qs, many=True, context={"request": request}).data
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def rsvp_contract_send(
    request: Request,
    workspace_slug: str,
    event_slug: str,
    rsvp_id: int,
) -> Response:
    """Vygeneruje PDF smlouvy + pošle ji na Signi."""
    from events.models import RSVP

    from .services import ContractError, generate_and_send_contract

    event, err = _event_or_403(request, workspace_slug, event_slug)
    if err:
        return err

    try:
        rsvp = RSVP.objects.select_related("user", "event").get(
            pk=rsvp_id, event=event
        )
    except RSVP.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    try:
        rc = generate_and_send_contract(rsvp)
    except ContractError as exc:
        http_status = (
            status.HTTP_500_INTERNAL_SERVER_ERROR
            if exc.code == "pdf_render"
            else status.HTTP_400_BAD_REQUEST
        )
        return Response({"detail": str(exc), "code": exc.code}, status=http_status)

    return Response(
        RSVPContractSerializer(rc, context={"request": request}).data
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def signy_webhook(request: Request) -> Response:
    """Webhook příjem ze Signi.cz."""
    import os

    expected = os.environ.get("SIGNY_WEBHOOK_SECRET", "")
    if expected:
        header = request.headers.get("X-Signy-Secret", "")
        if not header or header != expected:
            return Response(status=status.HTTP_401_UNAUTHORIZED)

    document_id = (request.data.get("document_id") or "").strip()
    new_status = (request.data.get("status") or "").strip()
    if not document_id or not new_status:
        return Response(
            {"detail": "document_id + status povinné."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        rc = RSVPContract.objects.get(signy_document_id=document_id)
    except RSVPContract.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    now = timezone.now()
    status_map = {
        "signed": (RSVPContract.STATUS_SIGNED, "signed_at"),
        "rejected": (RSVPContract.STATUS_REJECTED, "rejected_at"),
        "expired": (RSVPContract.STATUS_EXPIRED, "expired_at"),
    }
    mapped = status_map.get(new_status)
    if mapped:
        new_db_status, timestamp_field = mapped
        rc.status = new_db_status
        setattr(rc, timestamp_field, now)

        if new_db_status == RSVPContract.STATUS_SIGNED:
            from .signi_client import download_signed_pdf

            with contextlib.suppress(Exception):
                signed_bytes = download_signed_pdf(document_id)
                if signed_bytes:
                    rc.signed_pdf.save(
                        f"signed-{rc.pk}.pdf",
                        ContentFile(signed_bytes),
                        save=False,
                    )

    rc.save()
    return Response({"ok": True})
