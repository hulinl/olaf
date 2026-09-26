from django.urls import path

from . import views

app_name = "races"

urlpatterns = [
    path("", views.race_list, name="list"),
    path("countries/", views.race_countries, name="countries"),
    path("<slug:slug>/favorite/", views.race_favorite_toggle, name="favorite-toggle"),
]
