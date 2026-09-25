"""Email helpers for the event registration flow."""
from __future__ import annotations

from django.conf import settings

from notifications.email_sender import send_branded_email
from notifications.formatters import format_event_dt, format_payment_due

from .models import RSVP, Event


def _frontend_event_url(event: Event) -> str:
    """Canonical share URL (2026-09-11) — krátký `/e/<public_id>` alias
    resolvuje se 308 redirectem na plný landing. Fallback na staré
    `/{ws}/e/{slug}` jen kdyby event z nějakého důvodu neměl public_id
    (mělo by být vždy vyplněné dle save() overloadu)."""
    base = getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")
    if event.public_id:
        return f"{base}/e/{event.public_id}"
    return f"{base}/{event.workspace.slug}/e/{event.slug}"


def _frontend_cancel_url(rsvp: RSVP) -> str:
    """Magic-link URL pro guest cancel — `rsvp.cancel_token` jako query
    param. Tu URL posíláme do confirmation e-mailu, aby anon registrant
    mohl registraci zrušit bez přihlášení do aplikace.

    RSVP cancel je vázán na fully-qualified landing URL (chce hostname
    workspace pro breadcrumbs). Aliasy resolvují na backendu i tady
    díky `_load_published_event` fallback logic."""
    base = getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")
    return (
        f"{base}/{rsvp.event.workspace.slug}/e/{rsvp.event.slug}"
        f"/rsvp/cancel?token={rsvp.cancel_token}"
    )


def _frontend_feedback_url(rsvp: RSVP) -> str:
    """Magic-link URL pro post-event feedback formulář. Otevře se
    veřejná stránka `/feedback/<token>` bez loginu, submit z ní jde
    přímo na `POST /api/events/feedback/<token>/`."""
    base = getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")
    return f"{base}/feedback/{rsvp.feedback_token}"


def send_rsvp_new_to_organizers(
    rsvp: RSVP, recipient_ids: list[int]
) -> None:
    """E-mail + push všem organizátorům (owner + `EventCollaborator`ky)
    dané akce o nové přihlášce. Bell entry se stará `notify_rsvp_created`;
    tady jen mirror mail + push kanály.

    Skip bez dalšího zpracování:
    - `recipient_ids` prázdný (nikdo k notifikaci)
    - RSVP je organizer auto-registrace (double-check; caller už filtruje)
    """
    if rsvp.is_organizer or not recipient_ids:
        return

    from accounts.models import User
    from notifications.push import send_push_to_user

    event = rsvp.event
    display_name = (
        rsvp.user.get_full_name() if rsvp.user else "Neznámý účastník"
    )
    participant_email = (
        rsvp.user.email if rsvp.user else ""
    )
    participant_phone = (
        (rsvp.user.phone or "") if rsvp.user else ""
    )
    event_when = format_event_dt(event.starts_at, event.tz)
    admin_url = (
        f"{getattr(settings, 'FRONTEND_URL', 'http://localhost:3000').rstrip('/')}"
        f"/tvurce/akce/{event.workspace.slug}/{event.slug}"
    )

    if rsvp.status == RSVP.STATUS_PENDING_APPROVAL:
        subject = f"Nová přihláška ke schválení: {event.title}"
        push_title = "Nová přihláška ke schválení"
        status_label = "Čeká na tvoje schválení"
    elif rsvp.status == RSVP.STATUS_WAITLIST:
        subject = f"Nový záznam na waitlistu: {event.title}"
        push_title = "Nový záznam na waitlistu"
        status_label = "Kapacita je plná, přidán na waitlist"
    else:
        subject = f"Nová přihláška: {event.title}"
        push_title = "Nová přihláška"
        status_label = "Přihláška potvrzena"

    push_body = f"{display_name} — {event.title}"

    recipients = list(
        User.objects.filter(id__in=recipient_ids).only(
            "id", "email", "first_name", "last_name"
        )
    )
    if not recipients:
        return

    for recipient in recipients:
        # Per-adresát render, aby v šabloně mohl být osobní oslovení.
        send_branded_email(
            subject=subject,
            template_base="emails/rsvp_new_for_organizer",
            context={
                "recipient": recipient,
                "participant_name": display_name,
                "participant_email": participant_email,
                "participant_phone": participant_phone,
                "event": event,
                "event_when": event_when,
                "workspace": event.workspace,
                "status": rsvp.status,
                "status_label": status_label,
                "admin_url": admin_url,
            },
            recipient_list=[recipient.email],
            fail_silently=True,  # jeden špatný adresát nesmí položit ostatní
        )
        send_push_to_user(
            recipient,
            title=push_title,
            body=push_body,
            url=admin_url,
            tag=f"rsvp-{rsvp.pk}",
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

    # .ics + „Přidat do kalendáře" tlačítka posíláme jen pro confirmed
    # RSVP. Waitlist/pending ještě nemají jistou účast, kalendárový
    # event by tam byl matoucí.
    attachments = None
    cal_links: dict[str, str] = {}
    if rsvp.status == RSVP.STATUS_YES:
        from .calendar import build_ics, calendar_links

        attachments = [
            (
                "event.ics",
                build_ics(event, rsvp),
                'text/calendar; method=REQUEST; charset="utf-8"',
            )
        ]
        cal_links = calendar_links(event)

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
            "calendar_google_url": cal_links.get("google", ""),
            "calendar_outlook_url": cal_links.get("outlook", ""),
            "calendar_download_url": cal_links.get("download", ""),
        },
        recipient_list=[rsvp.user.email],
        attachments=attachments,
    )


def send_waitlist_promotion(rsvp: RSVP) -> None:
    """Notify a participant that they've been promoted from the waitlist."""
    event = rsvp.event
    from .calendar import build_ics, calendar_links

    ics_bytes = build_ics(event, rsvp)
    cal_links = calendar_links(event)
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
            "calendar_google_url": cal_links.get("google", ""),
            "calendar_outlook_url": cal_links.get("outlook", ""),
            "calendar_download_url": cal_links.get("download", ""),
        },
        recipient_list=[rsvp.user.email],
        attachments=[
            (
                "event.ics",
                ics_bytes,
                'text/calendar; method=REQUEST; charset="utf-8"',
            )
        ],
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
            "event_when": format_event_dt(event.starts_at, event.tz),
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


def send_event_update_notification(user, event: Event, changed_labels: list[str]) -> None:
    """Notify a single participant that owner-visible fields of an event
    were changed. `changed_labels` is the deduplicated list of human
    labels — same values that appear on the bell notification
    (Termín, Místo, Cena, …). The template renders each with the
    corresponding CURRENT value pulled off `event`, so the participant
    sees not just „změněn Termín" but also new starts_at + ends_at.

    Best-effort: fail_silently=True so a single bad address doesn't
    block the fan-out loop upstream.
    """
    if user is None or not user.email:
        return
    event_url = _frontend_event_url(event)
    send_branded_email(
        subject=f"Změna v akci: {event.title}",
        template_base="emails/event_updated",
        context={
            "user": user,
            "event": event,
            "workspace": event.workspace,
            "event_url": event_url,
            "changed_labels": changed_labels,
            "event_when": format_event_dt(event.starts_at, event.tz),
            "cta_url": event_url,
            "cta_label": "Zkontrolovat akci",
        },
        recipient_list=[user.email],
        fail_silently=True,
    )


def send_event_available_notification(user, event: Event) -> None:
    """Notify workspace member že se v jejich komunitě objevila nová
    (published) akce. Trigger: (a) event publish + community shares,
    (b) přidání do komunity už-published eventu. Volá fan_out task,
    dedup na caller straně (Notification.payload). User request
    2026-09-10.
    """
    if user is None or not user.email:
        return
    event_url = _frontend_event_url(event)
    send_branded_email(
        subject=f"Nová akce v komunitě: {event.title}",
        template_base="emails/event_available",
        context={
            "user": user,
            "event": event,
            "workspace": event.workspace,
            "event_url": event_url,
            "event_when": format_event_dt(event.starts_at, event.tz),
            "cta_url": event_url,
            "cta_label": "Podívat se na akci",
        },
        recipient_list=[user.email],
        fail_silently=True,
    )


def send_feedback_request(rsvp: RSVP) -> None:
    """Pošle jednomu účastníkovi mail s magic-linkem na feedback form.
    Best-effort — pokud user nemá usable e-mail, ticho ven; caller (fan-
    out) pokračuje s dalšími.

    Skip pravidla:
    - `user is None` (legacy RSVP bez usera) → nic neposílá
    - `user.email` prázdný → nic
    - status ≠ YES → nic (waitlist/pending/cancelled sem nespadá)
    - `is_organizer=True` → nic (organizátoři nejsou účastníci)
    Gate se aplikuje uvnitř helper-u, aby caller nemusel filtrovat
    pořád stejná pravidla."""
    if rsvp.user is None or not rsvp.user.email:
        return
    if rsvp.status != RSVP.STATUS_YES or rsvp.is_organizer:
        return
    event = rsvp.event
    send_branded_email(
        subject=f"Zpětná vazba — {event.title}",
        template_base="emails/feedback_request",
        context={
            "user": rsvp.user,
            "event": event,
            "rsvp": rsvp,
            "feedback_url": _frontend_feedback_url(rsvp),
            "workspace": event.workspace,
            "event_when": format_event_dt(event.starts_at, event.tz),
        },
        recipient_list=[rsvp.user.email],
        fail_silently=True,  # jeden špatný adresát nesmí spadnout celý fan-out
    )


def send_rsvp_document_rejected(doc) -> None:
    """Notify participant that owner rejected a previously uploaded
    document — typicky scan / fotka byla nečitelná nebo chyběl podpis.
    User dostane reason + odkaz na re-upload, takže může okamžitě
    nahrát nový soubor."""
    rsvp = doc.rsvp
    event = rsvp.event
    if rsvp.user is None or not rsvp.user.email:
        return
    label = doc.key
    for entry in event.required_documents or []:
        if entry.get("key") == doc.key:
            label = entry.get("label") or doc.key
            break
    send_branded_email(
        subject=f"Dokument vyžaduje opravu — {event.title}",
        template_base="emails/rsvp_document_rejected",
        context={
            "user": rsvp.user,
            "event": event,
            "workspace": event.workspace,
            "label": label,
            "reason": doc.reject_reason,
            "event_url": _frontend_event_url(event),
        },
        recipient_list=[rsvp.user.email],
    )
