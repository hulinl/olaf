from django.urls import path

from . import views

app_name = "notifications"

urlpatterns = [
    path("", views.notification_list, name="list"),
    path("count/", views.notification_count, name="count"),
    path("read-all/", views.notification_mark_all_read, name="read-all"),
    path(
        "<int:notification_id>/read/",
        views.notification_mark_read,
        name="read",
    ),
]
