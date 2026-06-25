"""Celery tasks pro contracts."""
from __future__ import annotations

import logging

from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name="contracts.auto_send_for_rsvp")
def auto_send_contract_for_rsvp_task(rsvp_id: int) -> dict:
    """Spustí generate+send pipeline pro daný RSVP, pokud event má
    nakonfigurovanou EventContract s `auto_send_after_rsvp=True`.

    Volá se z `RSVP.create_for_event()` přes `apply_async()` po commitu
    transakce. Idempotentní vůči stávajícím RSVPContract — pokud už
    existuje a je sent/signed, no-op.
    """
    from events.models import RSVP

    from .models import EventContract
    from .services import ContractError, generate_and_send_contract

    try:
        rsvp = RSVP.objects.select_related(
            "user", "event__contract__template"
        ).get(pk=rsvp_id)
    except RSVP.DoesNotExist:
        logger.info("RSVP %s missing — auto-send task skipped.", rsvp_id)
        return {"ok": False, "reason": "rsvp_missing"}

    try:
        ec: EventContract = rsvp.event.contract
    except EventContract.DoesNotExist:
        return {"ok": False, "reason": "no_event_contract"}

    if not ec.auto_send_after_rsvp:
        return {"ok": False, "reason": "auto_send_disabled"}

    try:
        rc = generate_and_send_contract(rsvp)
    except ContractError as exc:
        logger.warning(
            "auto-send contract failed for rsvp %s: %s", rsvp_id, exc
        )
        return {"ok": False, "reason": exc.code or "contract_error"}

    return {"ok": True, "rsvp_contract_id": rc.pk, "status": rc.status}
