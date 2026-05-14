"""Email helpers for the event registration flow."""
from __future__ import annotations

from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string

from .models import RSVP, Event


def _frontend_event_url(event: Event) -> str:
    base = getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")
    return f"{base}/{event.workspace.slug}/e/{event.slug}"


def send_rsvp_confirmation(rsvp: RSVP) -> None:
    """Email a participant that their RSVP was recorded."""
    event = rsvp.event
    context = {
        "user": rsvp.user,
        "event": event,
        "rsvp": rsvp,
        "status": rsvp.status,
        "event_url": _frontend_event_url(event),
        "workspace": event.workspace,
    }
    body = render_to_string("emails/rsvp_confirmation.txt", context)

    if rsvp.status == RSVP.STATUS_WAITLIST:
        subject = f"You're on the waitlist for {event.title}"
    elif rsvp.status == RSVP.STATUS_PENDING_APPROVAL:
        subject = f"Registration received — pending approval ({event.title})"
    else:
        subject = f"You're in! {event.title}"

    send_mail(
        subject=subject,
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[rsvp.user.email],
        fail_silently=False,
    )


def send_waitlist_promotion(rsvp: RSVP) -> None:
    """Notify a participant that they've been promoted from the waitlist."""
    event = rsvp.event
    context = {
        "user": rsvp.user,
        "event": event,
        "event_url": _frontend_event_url(event),
        "workspace": event.workspace,
    }
    body = render_to_string("emails/rsvp_promoted.txt", context)
    send_mail(
        subject=f"A spot opened up — you're in for {event.title}",
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[rsvp.user.email],
        fail_silently=False,
    )


def send_event_cancellation(rsvp: RSVP, reason: str = "") -> None:
    """Notify a participant that the event they RSVP-ed to was cancelled."""
    event = rsvp.event
    context = {
        "user": rsvp.user,
        "event": event,
        "reason": reason,
        "workspace": event.workspace,
    }
    body = render_to_string("emails/event_cancelled.txt", context)
    send_mail(
        subject=f"Cancelled: {event.title}",
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[rsvp.user.email],
        fail_silently=False,
    )
