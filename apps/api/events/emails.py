"""Email helpers for the event registration flow."""
from __future__ import annotations

from django.conf import settings

from notifications.email_sender import send_branded_email
from notifications.formatters import format_event_dt, format_payment_due

from .models import RSVP, Event


def _frontend_event_url(event: Event) -> str:
    base = getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")
    return f"{base}/{event.workspace.slug}/e/{event.slug}"


def _frontend_cancel_url(rsvp: RSVP) -> str:
    """Magic-link URL pro guest cancel — `rsvp.cancel_token` jako query
    param. Tu URL posíláme do confirmation e-mailu, aby anon registrant
    mohl registraci zrušit bez přihlášení do aplikace."""
    base = getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")
    return (
        f"{base}/{rsvp.event.workspace.slug}/e/{rsvp.event.slug}"
        f"/rsvp/cancel?token={rsvp.cancel_token}"
    )


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
            "cancel_url": _frontend_cancel_url(rsvp),
            "workspace": event.workspace,
            "event_when": format_event_dt(event.starts_at, event.tz),
            "payment_due_str": format_payment_due(
                rsvp.created_at, event.workspace.payment_due_days
            ),
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
            "rsvp": rsvp,
            "event_url": _frontend_event_url(event),
            "cancel_url": _frontend_cancel_url(rsvp),
            "workspace": event.workspace,
            "event_when": format_event_dt(event.starts_at, event.tz),
            "payment_due_str": format_payment_due(
                rsvp.created_at, event.workspace.payment_due_days
            ),
        },
        recipient_list=[rsvp.user.email],
    )


def send_rsvp_cancellation(rsvp: RSVP, *, cancelled_by_owner: bool = False) -> None:
    """Po zrušení RSVP (ať už uživatelem nebo ownerem) pošleme
    informativní mail — user měl předtím confirmation, teď ho chceme
    zavřít smyčku. `cancelled_by_owner=True` mění copy ("zrušení udělal
    pořadatel") aby user věděl proč mu zmizela registrace.

    Best-effort: pokud user nemá usable e-mail (např. ACS odmítne),
    necháme to spadnout silently uvnitř send_branded_email; cancel sám
    už proběhl."""
    # Legacy / collaborator RSVPs můžou mít `user=None` (gear-list FK
    # nebo ručně vložené row přes admin). Bez recipient-u nemá smysl
    # mail posílat — ticho ven.
    if rsvp.user is None or not rsvp.user.email:
        return
    event = rsvp.event
    send_branded_email(
        subject=f"Registrace zrušena — {event.title}",
        template_base="emails/rsvp_cancelled",
        context={
            "user": rsvp.user,
            "event": event,
            "rsvp": rsvp,
            "cancelled_by_owner": cancelled_by_owner,
            "event_url": _frontend_event_url(event),
            "workspace": event.workspace,
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
            "event_when": format_event_dt(event.starts_at, event.tz),
        },
        recipient_list=[rsvp.user.email],
    )
