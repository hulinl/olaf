from django.urls import path

from . import views

app_name = "workspaces"

urlpatterns = [
    path("mine/", views.my_workspaces, name="mine"),
    path("<slug:slug>/", views.public_workspace, name="public"),
]
