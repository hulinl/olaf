"""Scheduled reminder e-mails for checklist items.

Creators set `remind_at` on a checklist item and choose an audience:
- creator     → only workspace owners get the mail
- participants → all RSVP'd users + workspace owners

Dispatch happens via the Celery periodic task in events.tasks.
"""
from __future__ import annotations

from django.conf import settings
from django.utils import timezone

from accounts.models import User
from notifications.email_sender import send_branded_email
from workspaces.models import WorkspaceMember

from .models import RSVP, EventChecklistItem


def _frontend_url(path: str) -> str:
    base = getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")
    return f"{base}{path}"


def _event_cockpit_url(item: EventChecklistItem) -> str:
    event = item.event
    return _frontend_url(
        f"/admin/komunity/{event.workspace.slug}/akce/{event.slug}/checklist"
    )


def _audience_for_item(item: EventChecklistItem) -> list[User]:
    event = item.event
    user_ids: set[int] = set()

    owner_ids = WorkspaceMember.objects.filter(
        workspace=event.workspace,
    ).values_list("user_id", flat=True)
    user_ids.update(owner_ids)

    if item.remind_audience == EventChecklistItem.REMIND_AUDIENCE_PARTICIPANTS:
        rsvp_ids = (
            RSVP.objects.filter(event=event)
            .exclude(status=RSVP.STATUS_CANCELLED)
            .values_list("user_id", flat=True)
        )
        user_ids.update(rsvp_ids)

    return list(User.objects.filter(id__in=user_ids))


def send_checklist_reminder(item: EventChecklistItem) -> int:
    """Send one reminder per recipient. Returns count sent."""
    audience = _audience_for_item(item)
    if not audience:
        return 0

    event = item.event
    cockpit_url = _event_cockpit_url(item)
    is_participants = (
        item.remind_audience == EventChecklistItem.REMIND_AUDIENCE_PARTICIPANTS
    )
    subject = (
        f"Připomínka — {event.title}: {item.title}"
        if is_participants
        else f"[Checklist] {event.title}: {item.title}"
    )

    from notifications.push import send_push_to_user

    sent = 0
    for user in audience:
        send_branded_email(
            subject=subject,
            template_base="events/checklist_reminder",
            context={
                "item": item,
                "event": event,
                "recipient": user,
                "cockpit_url": cockpit_url,
                "is_participants": is_participants,
            },
            recipient_list=[user.email],
            fail_silently=True,
        )
        send_push_to_user(
            user,
            title=subject,
            body=item.description[:140] if item.description else item.title,
            url=cockpit_url,
            tag=f"reminder-{item.pk}",
        )
        sent += 1

    item.remind_sent_at = timezone.now()
    item.save(update_fields=["remind_sent_at", "updated_at"])
    return sent
