from django.urls import path

from . import views

app_name = "events"

urlpatterns = [
    path("mine/", views.my_events, name="mine"),
    path("owner/", views.owner_events, name="owner"),
    path(
        "<slug:workspace_slug>/<slug:event_slug>/",
        views.public_event,
        name="public",
    ),
    path(
        "<slug:workspace_slug>/<slug:event_slug>/rsvp/",
        views.rsvp_event,
        name="rsvp",
    ),
    path(
        "<slug:workspace_slug>/<slug:event_slug>/rsvp/cancel/",
        views.cancel_my_rsvp,
        name="rsvp-cancel",
    ),
    path(
        "<slug:workspace_slug>/<slug:event_slug>/rsvps/",
        views.event_rsvps,
        name="rsvps",
    ),
]
