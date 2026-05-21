"""Event-side fan-out into the bell feed.

Three triggers:
- `notify_event_updated` — owner saved changes that participants
  should know about (date / location / status / price / capacity).
- `notify_rsvp_approved` — owner approved a pending registration.
- `notify_rsvp_rejected` — owner rejected a pending registration.

All three are best-effort: a DB error in the notification path must
not unwind the underlying save. Callers ignore the return value.
"""
from __future__ import annotations

from notifications.models import Notification

from .models import RSVP, Event

# Fields whose change is worth pinging every active RSVPed user
# about. Owner-internal fields (blocks layout, risk_checklist, etc.)
# don't qualify — those are edits to the cockpit, not to the event
# as participants experience it.
PARTICIPANT_VISIBLE_FIELDS: dict[str, str] = {
    "starts_at": "Termín",
    "ends_at": "Termín",
    "location_text": "Místo",
    "meeting_point_text": "Sraz",
    "location_url": "Mapa",
    "description": "Popis",
    "status": "Status",
    "price_amount": "Cena",
    "capacity": "Kapacita",
}


def snapshot_event_for_diff(event: Event) -> dict:
    """Capture the values of participant-visible fields in a dict
    so we can compare pre/post update."""
    return {field: getattr(event, field) for field in PARTICIPANT_VISIBLE_FIELDS}


def diff_changed_fields(before: dict, after: dict) -> list[str]:
    """Return the field-names whose value differs between snapshots.
    Order follows PARTICIPANT_VISIBLE_FIELDS insertion."""
    return [
        field
        for field in PARTICIPANT_VISIBLE_FIELDS
        if before.get(field) != after.get(field)
    ]


def _event_link(event: Event) -> str:
    return f"/events/{event.workspace.slug}/{event.slug}"


def notify_event_updated(event: Event, changed_fields: list[str], *, actor=None) -> int:
    """Bulk-create one Notification per active RSVPed user (minus
    the actor) when meaningful fields changed.

    Skip cases:
    - changed_fields empty (nothing relevant to announce)
    - event is still a draft (no participants to ping)
    """
    if not changed_fields or event.status != Event.STATUS_PUBLISHED:
        return 0

    # Dedupe labels for the body — "starts_at" + "ends_at" both map
    # to "Termín"; show it once.
    labels: list[str] = []
    seen: set[str] = set()
    for field in changed_fields:
        label = PARTICIPANT_VISIBLE_FIELDS.get(field, field)
        if label in seen:
            continue
        seen.add(label)
        labels.append(label)

    title = f"Změna v akci: {event.title}"
    body = f"Pořadatel upravil: {', '.join(labels)}."
    link = _event_link(event)

    recipient_ids = list(
        RSVP.objects.filter(event=event)
        .exclude(status=RSVP.STATUS_CANCELLED)
        .values_list("user_id", flat=True)
        .distinct()
    )
    if actor is not None:
        recipient_ids = [uid for uid in recipient_ids if uid != actor.id]

    if not recipient_ids:
        return 0

    notifs = [
        Notification(
            recipient_id=uid,
            kind=Notification.KIND_EVENT_UPDATE,
            title=title,
            body=body,
            link=link,
            payload={
                "event_slug": event.slug,
                "workspace_slug": event.workspace.slug,
                "changed_fields": changed_fields,
            },
        )
        for uid in recipient_ids
    ]
    Notification.objects.bulk_create(notifs)
    return len(notifs)


def notify_rsvp_approved(rsvp: RSVP) -> Notification | None:
    """Owner approved a pending registration — let the participant
    know directly in the bell. Returns the created row or None when
    the RSVP has no user (light account / placeholder)."""
    if rsvp.user_id is None:
        return None
    event = rsvp.event
    return Notification.objects.create(
        recipient_id=rsvp.user_id,
        kind=Notification.KIND_RSVP_APPROVED,
        title=f'Schváleno: „{event.title}"',
        body="Tvoje přihláška byla potvrzena. Vidíme se na akci.",
        link=_event_link(event),
        payload={
            "event_slug": event.slug,
            "workspace_slug": event.workspace.slug,
            "rsvp_id": rsvp.id,
        },
    )


def notify_rsvp_rejected(rsvp: RSVP, *, reason: str = "") -> Notification | None:
    """Owner rejected a pending registration. Notification mirrors
    the e-mail the participant also receives."""
    if rsvp.user_id is None:
        return None
    event = rsvp.event
    body = (
        f"Pořadatel zamítl tvoji přihlášku: {reason}"
        if reason
        else "Pořadatel zamítl tvoji přihlášku."
    )
    return Notification.objects.create(
        recipient_id=rsvp.user_id,
        kind=Notification.KIND_RSVP_REJECTED,
        title=f'Zamítnuto: „{event.title}"',
        body=body,
        link=_event_link(event),
        payload={
            "event_slug": event.slug,
            "workspace_slug": event.workspace.slug,
            "rsvp_id": rsvp.id,
        },
    )
