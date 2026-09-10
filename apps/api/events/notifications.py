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

    # Pull RSVPed user IDs, then filter by per-user opt-out
    # (notify_on_event_update). Joining at the SQL layer keeps this
    # cheap even with hundreds of participants.
    from accounts.models import User

    recipient_ids = list(
        User.objects.filter(
            id__in=RSVP.objects.filter(event=event)
            .exclude(status=RSVP.STATUS_CANCELLED)
            .values_list("user_id", flat=True),
            notify_on_event_update=True,
        )
        .values_list("id", flat=True)
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

    # Branded e-mail vedle bell notifikace. Přítelkyně-tester 2026-09-04:
    # bell v aplikaci nestačí, chce aby účastníci na PATCH klíčových polí
    # (Termín / Místo / Cena / …) dostali normální e-mail. Task se v prod
    # spouští EAGER (žádný Celery worker) — dopad na PATCH latency je
    # ~300 ms krát počet recipients. Owner úprava akce není hot-path RSVP,
    # takže zpomalení akceptovatelné; při větších komunitách zvážit
    # thread-defer patern (viz project_olaf_perf_celery_eager memory).
    from .tasks import fan_out_event_update_task

    fan_out_event_update_task.delay(event.pk, recipient_ids, labels)
    return len(notifs)


def notify_event_available_in_workspaces(
    event: Event,
    workspace_ids: list[int],
    *,
    actor=None,
) -> int:
    """Fan-out „nová akce v komunitě" — mail + bell + push všem
    aktivním WorkspaceMemberům každé z daných workspace, kterým akce
    ještě notifikaci pro tuto (event, workspace) kombinaci nedostala.
    Triggery: (1) event přejde do published a je propojen s
    komunitami — pošleme primary + shared. (2) published event dostane
    nový community share — pošleme jen nově-added members.

    Skip: event není published, workspace ids prázdné, actor je sám
    sobě, opt-out (`notify_on_event_update`), už-doručeno (dedup přes
    Notification.payload). User request 2026-09-10.
    """
    if event.status != Event.STATUS_PUBLISHED:
        return 0
    if not workspace_ids:
        return 0

    from accounts.models import User
    from workspaces.models import WorkspaceMember

    # Kandidáti = active WorkspaceMembers napříč všech target workspace
    # ids, dedup přes user_id + respekt opt-out. Vyloučíme aktora.
    candidate_user_ids = list(
        WorkspaceMember.objects.filter(
            workspace_id__in=workspace_ids,
            status=WorkspaceMember.STATUS_ACTIVE,
        )
        .values_list("user_id", flat=True)
        .distinct()
    )
    if actor is not None:
        candidate_user_ids = [
            uid for uid in candidate_user_ids if uid != actor.id
        ]
    if not candidate_user_ids:
        return 0

    users = list(
        User.objects.filter(
            id__in=candidate_user_ids,
            notify_on_event_update=True,
        ).only("id", "email", "first_name", "last_name")
    )
    if not users:
        return 0

    # Dedup: kdo už dostal event_available pro tenhle event, přeskočit.
    # payload obsahuje event_id, kind je fix. Query jednou, klientský
    # filter.
    already_notified = set(
        Notification.objects.filter(
            recipient_id__in=[u.id for u in users],
            kind=Notification.KIND_EVENT_AVAILABLE,
            payload__event_id=event.pk,
        ).values_list("recipient_id", flat=True)
    )
    target_users = [u for u in users if u.id not in already_notified]
    if not target_users:
        return 0

    title = f"Nová akce: {event.title}"
    body = "V komunitě je nová akce, kterou můžeš navštívit — přihlas se."
    link = _event_link(event)

    Notification.objects.bulk_create(
        [
            Notification(
                recipient_id=u.id,
                kind=Notification.KIND_EVENT_AVAILABLE,
                title=title,
                body=body,
                link=link,
                payload={
                    "event_id": event.pk,
                    "event_slug": event.slug,
                    "workspace_slug": event.workspace.slug,
                    "workspace_ids": workspace_ids,
                },
            )
            for u in target_users
        ]
    )

    # E-mail + push fan-out přes Celery task (v prod běží EAGER, viz
    # perf memory). Nechme nejde-selhat, notifikace v bellu už dorazila.
    from .tasks import fan_out_event_available_task

    fan_out_event_available_task.delay(
        event.pk, [u.id for u in target_users]
    )
    return len(target_users)


def notify_rsvp_approved(rsvp: RSVP) -> Notification | None:
    """Owner approved a pending registration — let the participant
    know directly in the bell. Returns the created row or None when
    the RSVP has no user (light account / placeholder) or the user
    opted out of RSVP-status notifications."""
    if rsvp.user_id is None:
        return None
    if rsvp.user and not rsvp.user.notify_on_rsvp_status:
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
    if rsvp.user and not rsvp.user.notify_on_rsvp_status:
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
