from django.apps import AppConfig


class EventsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "events"

    def ready(self) -> None:
        # Register signals — pre_save handler pro slug rename (viz
        # signals.create_slug_alias_on_rename).
        from . import signals  # noqa: F401
