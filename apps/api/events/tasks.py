"""Celery tasks for the events app."""
from __future__ import annotations

from celery import shared_task

from .emails import send_rsvp_confirmation, send_waitlist_promotion
from .models import RSVP


@shared_task(name="events.send_rsvp_confirmation")
def send_rsvp_confirmation_task(rsvp_id: int) -> None:
    try:
        rsvp = RSVP.objects.select_related("event", "event__workspace", "user").get(
            pk=rsvp_id
        )
    except RSVP.DoesNotExist:
        return
    send_rsvp_confirmation(rsvp)


@shared_task(name="events.send_waitlist_promotion")
def send_waitlist_promotion_task(rsvp_id: int) -> None:
    try:
        rsvp = RSVP.objects.select_related("event", "event__workspace", "user").get(
            pk=rsvp_id
        )
    except RSVP.DoesNotExist:
        return
    send_waitlist_promotion(rsvp)
