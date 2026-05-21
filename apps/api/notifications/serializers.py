"""Serializers for the user-facing notification feed."""
from __future__ import annotations

from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    is_read = serializers.ReadOnlyField()

    class Meta:
        model = Notification
        fields = (
            "id",
            "kind",
            "title",
            "body",
            "link",
            "payload",
            "read_at",
            "is_read",
            "created_at",
        )
        read_only_fields = fields
