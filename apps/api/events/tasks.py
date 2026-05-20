"""Celery tasks for the events app."""
from __future__ import annotations

from celery import shared_task
from django.utils import timezone

from .emails import (
    send_event_cancellation,
    send_rsvp_confirmation,
    send_waitlist_promotion,
)
from .models import RSVP, Event, EventChecklistItem
from .reminder_emails import send_checklist_reminder


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


@shared_task(name="events.fan_out_event_cancellation")
def fan_out_event_cancellation_task(event_id: int, reason: str = "") -> None:
    """Send cancellation email to every active RSVP for an event."""
    try:
        event = Event.objects.select_related("workspace").get(pk=event_id)
    except Event.DoesNotExist:
        return
    affected = event.rsvps.select_related("user").exclude(
        status__in=[RSVP.STATUS_NO, RSVP.STATUS_CANCELLED]
    )
    for rsvp in affected:
        send_event_cancellation(rsvp, reason)


@shared_task(name="events.dispatch_due_reminders")
def dispatch_due_reminders_task() -> dict[str, int]:
    """Periodic dispatcher for checklist reminders.

    Runs from Celery beat every minute. Picks up items where
    `remind_at` has passed and `remind_sent_at` is still null, and
    fires off the reminder. We deliberately don't skip items marked
    `done=True` — owners often want a "did you actually do this?"
    nudge.
    """
    now = timezone.now()
    due = EventChecklistItem.objects.select_related(
        "event", "event__workspace"
    ).filter(remind_at__lte=now, remind_sent_at__isnull=True)

    dispatched = 0
    recipients_total = 0
    for item in due:
        recipients_total += send_checklist_reminder(item)
        dispatched += 1
    return {"items": dispatched, "recipients": recipients_total}


@shared_task(name="events.complete_finished_events")
def complete_finished_events_task() -> dict[str, int]:
    """Flip published events to "completed" once their end-time passes.

    The model has STATUS_COMPLETED documented as "auto-transition after
    end" but until now nothing actually did the flip — events stayed
    "published" forever, which confused the dashboard's "moje pořádané
    akce" split and meant past camps showed up as upcoming.

    Runs every 15 minutes from Celery beat.
    """
    now = timezone.now()
    qs = Event.objects.filter(status=Event.STATUS_PUBLISHED, ends_at__lt=now)
    flipped = qs.update(status=Event.STATUS_COMPLETED, updated_at=now)
    return {"flipped": flipped}


@shared_task(name="events.send_checklist_reminder_now")
def send_checklist_reminder_now_task(item_id: int) -> int:
    """Force-send a reminder for a single item (owner override).

    Used by the "Připomenout teď" button in the cockpit. Bypasses the
    schedule and clears any previous sent stamp so the periodic task
    won't re-fire it.
    """
    try:
        item = EventChecklistItem.objects.select_related(
            "event", "event__workspace"
        ).get(pk=item_id)
    except EventChecklistItem.DoesNotExist:
        return 0
    return send_checklist_reminder(item)
