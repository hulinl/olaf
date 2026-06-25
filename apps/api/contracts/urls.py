from django.urls import path

from . import views

app_name = "contracts"

urlpatterns = [
    # Template katalog scoped na workspace.
    path(
        "<slug:workspace_slug>/templates/",
        views.workspace_templates,
        name="templates",
    ),
    path(
        "<slug:workspace_slug>/templates/<int:template_id>/",
        views.template_detail,
        name="template-detail",
    ),
    path(
        "<slug:workspace_slug>/templates/<int:template_id>/sync-notion/",
        views.template_sync_notion,
        name="template-sync-notion",
    ),

    # Event-level smlouva config.
    path(
        "<slug:workspace_slug>/events/<slug:event_slug>/contract/",
        views.event_contract_config,
        name="event-contract",
    ),
    path(
        "<slug:workspace_slug>/events/<slug:event_slug>/rsvp-contracts/",
        views.event_rsvp_contracts,
        name="event-rsvp-contracts",
    ),
    path(
        "<slug:workspace_slug>/events/<slug:event_slug>/rsvp-contracts/<int:rsvp_id>/send/",
        views.rsvp_contract_send,
        name="rsvp-contract-send",
    ),

    # Webhook ze Signi.cz.
    path(
        "_/webhook/signy/",
        views.signy_webhook,
        name="signy-webhook",
    ),
]
