"""Service vrstva pro contracts — reusable pro endpoint i Celery task."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from django.core.files.base import ContentFile
from django.utils import timezone

from .models import EventContract, RSVPContract

if TYPE_CHECKING:
    from events.models import RSVP

logger = logging.getLogger(__name__)


class ContractError(Exception):
    """Generic error pro vyšší vrstvy — endpoint ho překládá do 400/500."""

    def __init__(self, message: str, *, code: str = "") -> None:
        super().__init__(message)
        self.code = code


def generate_and_send_contract(rsvp: RSVP) -> RSVPContract:
    """Vygeneruje PDF smlouvy pro daný RSVP + pošle na Signi.

    Idempotent: pokud RSVPContract pro tento RSVP existuje ve stavech
    `sent` nebo `signed`, vrátíme ho beze změny. Pokud je `pending`,
    znovu vygenerujeme PDF a pošleme.

    Vyhazuje `ContractError`, když:
      - event nemá EventContract nakonfigurovaný
      - účastník nemá platný e-mail
      - PDF generování spadne
    """
    event = rsvp.event
    try:
        ec: EventContract = event.contract
    except EventContract.DoesNotExist as exc:
        raise ContractError(
            "Tento event nemá nakonfigurovanou smlouvu.",
            code="no_event_contract",
        ) from exc

    if rsvp.user is None or not rsvp.user.email:
        raise ContractError(
            "Účastník nemá platný e-mail.",
            code="no_email",
        )

    rc, _created = RSVPContract.objects.get_or_create(
        rsvp=rsvp,
        event_contract=ec,
    )

    if rc.status in (
        RSVPContract.STATUS_SENT,
        RSVPContract.STATUS_SIGNED,
    ):
        return rc

    from .pdf_generator import render_contract_pdf
    from .signi_client import is_configured, send_for_signing

    try:
        pdf_bytes = render_contract_pdf(rc)
    except Exception as e:
        logger.exception("PDF render failed for rsvp_contract %s", rc.pk)
        raise ContractError(
            f"Generování PDF selhalo: {e!s}",
            code="pdf_render",
        ) from e

    rc.generated_pdf.save(
        f"contract-{event.slug}-{rsvp.pk}.pdf",
        ContentFile(pdf_bytes),
        save=False,
    )

    document = send_for_signing(
        pdf_bytes=pdf_bytes,
        pdf_filename=f"contract-{event.slug}-{rsvp.pk}.pdf",
        signer_name=rsvp.user.get_full_name() or rsvp.user.email,
        signer_email=rsvp.user.email,
        document_title=f"{event.title} — smlouva",
    )

    rc.signy_document_id = document.document_id
    rc.signing_url = document.signing_url
    rc.status = (
        RSVPContract.STATUS_SENT
        if is_configured()
        else RSVPContract.STATUS_PENDING
    )
    rc.sent_at = timezone.now()
    rc.save()
    return rc
