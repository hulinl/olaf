"""Email helpers for the event registration flow."""
from __future__ import annotations

from django.conf import settings

from notifications.email_sender import send_branded_email
from notifications.formatters import format_event_dt

from .models import RSVP, Event


def _frontend_event_url(event: Event) -> str:
    base = getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")
    return f"{base}/{event.workspace.slug}/e/{event.slug}"


def send_rsvp_confirmation(rsvp: RSVP) -> None:
    """Email a participant that their RSVP was recorded."""
    event = rsvp.event
    if rsvp.status == RSVP.STATUS_WAITLIST:
        subject = f"Jsi na waitlistu — {event.title}"
    elif rsvp.status == RSVP.STATUS_PENDING_APPROVAL:
        subject = f"Tvoje registrace čeká na schválení — {event.title}"
    else:
        subject = f"Tvoje registrace potvrzena — {event.title}"

    send_branded_email(
        subject=subject,
        template_base="emails/rsvp_confirmation",
        context={
            "user": rsvp.user,
            "event": event,
            "rsvp": rsvp,
            "status": rsvp.status,
            "event_url": _frontend_event_url(event),
            "workspace": event.workspace,
            "event_when": format_event_dt(event.starts_at),
        },
        recipient_list=[rsvp.user.email],
    )


def send_waitlist_promotion(rsvp: RSVP) -> None:
    """Notify a participant that they've been promoted from the waitlist."""
    event = rsvp.event
    send_branded_email(
        subject=f"Místo se uvolnilo — jedeš s námi na {event.title}",
        template_base="emails/rsvp_promoted",
        context={
            "user": rsvp.user,
            "event": event,
            "event_url": _frontend_event_url(event),
            "workspace": event.workspace,
            "event_when": format_event_dt(event.starts_at),
        },
        recipient_list=[rsvp.user.email],
    )


def send_event_cancellation(rsvp: RSVP, reason: str = "") -> None:
    """Notify a participant that the event they RSVP-ed to was cancelled."""
    event = rsvp.event
    send_branded_email(
        subject=f"Akce zrušena — {event.title}",
        template_base="emails/event_cancelled",
        context={
            "user": rsvp.user,
            "event": event,
            "reason": reason,
            "workspace": event.workspace,
            "event_when": format_event_dt(event.starts_at),
        },
        recipient_list=[rsvp.user.email],
    )
