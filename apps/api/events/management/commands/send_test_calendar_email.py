"""Odešle ukázkový RSVP-potvrzovací e-mail s .ics přílohou a add-to-
calendar linky. Slouží k manuálnímu testu — user si potvrdí, jak
příloha + linky vypadají v jeho Outlook mobile / Gmail / Apple Mail.

Použití:
    python manage.py send_test_calendar_email hulin@bifactory.cz

Chování:
    * Přednostně sáhne po první published akci (nebo `--event-slug`).
    * Fallback — pokud v DB žádná není (typicky lokální dev bez seed),
      poskládá in-memory Event + Workspace jen pro render. Nic se
      neukládá do DB.
    * FROM = DEFAULT_FROM_EMAIL. TO = adresa z CLI.
    * V dev backendu jde přes MailHog (viz EMAIL_HOST env), v prodě
      přes ACS.
"""
from __future__ import annotations

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from accounts.models import User
from events.emails import send_rsvp_confirmation
from events.models import RSVP, Event


def _sample_event() -> Event:
    """In-memory Event pro render sample mailu. Bez .save() — nechceme
    tímhle commandem znečistit DB. Workspace je taky jen in-memory,
    ale musí mít slug + name kvůli template referencím."""
    from workspaces.models import Workspace

    workspace = Workspace(
        slug="olafadventures",
        name="Olaf Adventures",
        payment_iban="CZ00 0000 0000 0000 0000 0000",
        payment_bank_name="Fio banka",
        payment_due_days=14,
    )
    starts_at = timezone.now() + timedelta(days=14)
    ends_at = starts_at + timedelta(days=3)
    return Event(
        workspace=workspace,
        slug="sample-akce",
        title="Sample akce — test kalendáře",
        description=(
            "Testovací mail — nic reálného, jen ukázka, jak přijde přílohu "
            ".ics a jak fungují add-to-calendar linky."
        ),
        starts_at=starts_at,
        ends_at=ends_at,
        tz="Europe/Prague",
        location_text="Beskydy — chata Salajka",
        meeting_point_text="parkoviště Bílá 9:00",
        public_id="sample01",
        status=Event.STATUS_PUBLISHED,
        visibility=Event.VISIBILITY_PUBLIC,
    )


class Command(BaseCommand):
    help = "Send a sample RSVP confirmation email (with .ics + add-to-calendar links) to a chosen address."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "recipient",
            help="E-mail, na který přijde testovací zpráva.",
        )
        parser.add_argument(
            "--event-slug",
            default=None,
            help="Slug konkrétní akce; jinak se vezme první published event.",
        )

    def handle(self, *args, **options) -> None:
        recipient = options["recipient"]
        event_slug = options.get("event_slug")

        qs = Event.objects.filter(
            status=Event.STATUS_PUBLISHED, deleted_at__isnull=True
        ).select_related("workspace")
        if event_slug:
            qs = qs.filter(slug=event_slug)
        event = qs.order_by("-starts_at").first()

        source = "seed z DB"
        if event is None:
            event = _sample_event()
            source = "in-memory fallback (v DB žádná published akce)"

        user = User.objects.filter(email__iexact=recipient).first()
        if user is None:
            user = User(
                email=recipient, first_name="Testovací", last_name="Uživatel"
            )

        rsvp = RSVP(event=event, user=user, status=RSVP.STATUS_YES)

        send_rsvp_confirmation(rsvp)
        when = event.starts_at.strftime("%Y-%m-%d")
        self.stdout.write(
            self.style.SUCCESS(
                f"Sample kalendárový mail odeslán na {recipient} "
                f"(zdrojová akce: {event.title!r}, {when}; {source})."
            )
        )
