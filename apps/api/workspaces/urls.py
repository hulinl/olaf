from django.urls import path

from . import views

app_name = "workspaces"

urlpatterns = [
    path("mine/", views.my_workspaces, name="mine"),
    path("<slug:slug>/", views.public_workspace, name="public"),
    path("<slug:slug>/detail/", views.workspace_detail, name="detail"),
    path("<slug:slug>/events/", views.workspace_events, name="events"),
]
