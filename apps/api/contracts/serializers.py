from __future__ import annotations

from rest_framework import serializers

from .models import ContractTemplate, EventContract, RSVPContract


class ContractTemplateSerializer(serializers.ModelSerializer):
    workspace_slug = serializers.CharField(
        source="workspace.slug", read_only=True
    )
    created_by_name = serializers.SerializerMethodField()

    def get_created_by_name(self, obj: ContractTemplate) -> str:
        if not obj.created_by:
            return ""
        return obj.created_by.get_full_name() or obj.created_by.email

    class Meta:
        model = ContractTemplate
        fields = (
            "id",
            "workspace_slug",
            "name",
            "description",
            "body_html",
            "notion_url",
            "last_synced_at",
            "created_by_name",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "workspace_slug",
            "last_synced_at",
            "created_by_name",
            "created_at",
            "updated_at",
        )


class EventContractSerializer(serializers.ModelSerializer):
    template_name = serializers.CharField(
        source="template.name", read_only=True
    )

    class Meta:
        model = EventContract
        fields = (
            "id",
            "template",
            "template_name",
            "auto_send_after_rsvp",
            "require_before_payment",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "template_name", "created_at", "updated_at")


class RSVPContractSerializer(serializers.ModelSerializer):
    user_full_name = serializers.SerializerMethodField()
    user_email = serializers.SerializerMethodField()
    generated_pdf_url = serializers.SerializerMethodField()
    signed_pdf_url = serializers.SerializerMethodField()

    def get_user_full_name(self, obj: RSVPContract) -> str:
        return obj.rsvp.user.get_full_name() if obj.rsvp.user else ""

    def get_user_email(self, obj: RSVPContract) -> str:
        return obj.rsvp.user.email if obj.rsvp.user else ""

    def _abs(self, file_field) -> str:
        if not file_field:
            return ""
        request = self.context.get("request")
        url = file_field.url
        if request and url.startswith("/"):
            return request.build_absolute_uri(url)
        return url

    def get_generated_pdf_url(self, obj: RSVPContract) -> str:
        return self._abs(obj.generated_pdf)

    def get_signed_pdf_url(self, obj: RSVPContract) -> str:
        return self._abs(obj.signed_pdf)

    class Meta:
        model = RSVPContract
        fields = (
            "id",
            "rsvp",
            "user_full_name",
            "user_email",
            "status",
            "generated_pdf_url",
            "signed_pdf_url",
            "signing_url",
            "signy_document_id",
            "sent_at",
            "signed_at",
            "rejected_at",
            "expired_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields
