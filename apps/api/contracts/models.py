"""Contracts — smlouvy s digi-podpisem přes Signi.cz.

Tři vrstvy:

* `ContractTemplate` — workspace-scoped šablona. Body je HTML
  s placeholdery typu `{{ucastnik_jmeno}}` co se vyplňují
  per-RSVP. Notion sync naplní body z Notion stránky (Claude
  parse → HTML), owner si ho pak ručně doupraví v editoru.

* `EventContract` — per-event konfigurace. „Tento event vyžaduje
  smlouvu z této šablony, posílat účastníkům automaticky po RSVP."

* `RSVPContract` — per-účastník instance smlouvy. Drží reference
  na Signi document_id, podpisovou URL, stažený podepsaný PDF.

PDF se generuje přes WeasyPrint (stejný stack jako faktury).
Signi.cz API odešle účastníkovi e-mail s podpisovým linkem,
webhook nám pak po podpisu vrátí signed PDF URL.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils import timezone


class ContractTemplate(models.Model):
    """Smlouva-šablona scoped na workspace.

    `body_html` drží HTML s placeholdery `{{key}}`. Render přes
    Django template engine (`Template(body_html).render(Context(...))`)
    s pre-defined contextem (účastník + event + workspace).

    `notion_url` je optional — když je nastavený, owner může klik
    „Sync z Notion" znovu naplnit body z čerstvé Notion stránky.
    `last_synced_at` ukazuje kdy se to naposled stalo.
    """

    workspace = models.ForeignKey(
        "workspaces.Workspace",
        on_delete=models.CASCADE,
        related_name="contract_templates",
    )
    name = models.CharField(
        max_length=200,
        help_text='Lidové jméno šablony — „Smlouva o účasti", "Souhlas s riziky", …',
    )
    description = models.TextField(
        blank=True,
        help_text="Interní poznámka pro tvůrce — kdy tuhle šablonu použít.",
    )
    body_html = models.TextField(
        blank=True,
        help_text=(
            "HTML šablony s placeholdery {{ucastnik_jmeno}} apod. "
            "Render přes Django Template engine."
        ),
    )
    notion_url = models.URLField(
        blank=True,
        help_text=(
            'Volitelně — Notion stránka co drží zdroj. „Sync z Notion" '
            "ji znovu načte přes Claude a přepíše body_html."
        ),
    )
    last_synced_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="contract_templates_created",
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "contracts_template"
        ordering = ["name"]
        indexes = [models.Index(fields=["workspace", "name"])]

    def __str__(self) -> str:
        return f"{self.workspace.slug}/{self.name}"


class EventContract(models.Model):
    """Per-event konfigurace smlouvy."""

    event = models.OneToOneField(
        "events.Event",
        on_delete=models.CASCADE,
        related_name="contract",
    )
    template = models.ForeignKey(
        ContractTemplate,
        on_delete=models.PROTECT,
        related_name="event_contracts",
    )
    auto_send_after_rsvp = models.BooleanField(
        default=False,
        help_text=(
            "True = po každém novém RSVP backend vygeneruje smlouvu a "
            "pošle účastníkovi podpisový link. False = owner pošle "
            "ručně z rosteru."
        ),
    )
    require_before_payment = models.BooleanField(
        default=False,
        help_text=(
            "True = účastník nemůže označit platbu dokud nepodepíše "
            "(V1.5 — zatím jen flag, vynucení později)."
        ),
    )
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "contracts_event"

    def __str__(self) -> str:
        return f"Smlouva pro {self.event.slug}"


class RSVPContract(models.Model):
    """Per-účastník instance smlouvy."""

    STATUS_PENDING = "pending"
    STATUS_SENT = "sent"
    STATUS_SIGNED = "signed"
    STATUS_REJECTED = "rejected"
    STATUS_EXPIRED = "expired"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_SENT, "Posláno k podpisu"),
        (STATUS_SIGNED, "Podepsáno"),
        (STATUS_REJECTED, "Odmítnuto účastníkem"),
        (STATUS_EXPIRED, "Vypršelo"),
    ]

    rsvp = models.ForeignKey(
        "events.RSVP",
        on_delete=models.CASCADE,
        related_name="contracts",
    )
    event_contract = models.ForeignKey(
        EventContract,
        on_delete=models.CASCADE,
        related_name="rsvp_contracts",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
        db_index=True,
    )
    generated_pdf = models.FileField(
        upload_to="contracts/generated/",
        blank=True,
        null=True,
    )
    # Signi.cz reference — document_id z jejich API.
    signy_document_id = models.CharField(max_length=120, blank=True, default="")
    signing_url = models.URLField(blank=True, default="")
    signed_pdf = models.FileField(
        upload_to="contracts/signed/",
        blank=True,
        null=True,
    )
    sent_at = models.DateTimeField(null=True, blank=True)
    signed_at = models.DateTimeField(null=True, blank=True)
    rejected_at = models.DateTimeField(null=True, blank=True)
    expired_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "contracts_rsvp"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["rsvp"]),
            models.Index(fields=["signy_document_id"]),
        ]

    def __str__(self) -> str:
        return f"RSVPContract(rsvp={self.rsvp_id}, status={self.status})"
