from django.urls import path

from . import views

app_name = "personal_calendar"

urlpatterns = [
    path("sources/", views.sources_list, name="sources-list"),
    path("sources/<int:source_id>/", views.source_detail, name="source-detail"),
    path(
        "sources/<int:source_id>/sync/",
        views.source_sync,
        name="source-sync",
    ),
    path("busy-days/", views.busy_days, name="busy-days"),
]
