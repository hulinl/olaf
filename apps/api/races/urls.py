from django.urls import path

from . import views

app_name = "races"

urlpatterns = [
    path("", views.race_list, name="list"),
    path("countries/", views.race_countries, name="countries"),
    path("sync-status/", views.race_sync_status, name="sync-status"),
    path("mine/", views.race_plan_mine, name="plan-mine"),
    path("my-communities/", views.race_my_communities, name="my-communities"),
    path(
        "my-community-people/",
        views.race_my_community_people,
        name="my-community-people",
    ),
    path("plan/<slug:user_slug>/", views.race_plan_public, name="plan-public"),
    path("<slug:slug>/favorite/", views.race_favorite_toggle, name="favorite-toggle"),
]
