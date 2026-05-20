from django.urls import path

from . import views

app_name = "workspaces"

urlpatterns = [
    path("", views.create_workspace, name="create"),
    path("mine/", views.my_workspaces, name="mine"),
    path("personal/", views.my_personal_workspace, name="personal"),
    path("<slug:slug>/", views.public_workspace, name="public"),
    path("<slug:slug>/detail/", views.workspace_detail, name="detail"),
    path("<slug:slug>/events/", views.workspace_events, name="events"),
    path("<slug:slug>/logo/", views.workspace_logo, name="logo"),
    path("<slug:slug>/cover/", views.workspace_cover, name="cover"),
    path("<slug:slug>/members/", views.workspace_members, name="members"),
    path(
        "<slug:slug>/members/<int:user_id>/",
        views.workspace_member_detail,
        name="member-detail",
    ),
    path(
        "<slug:slug>/members/<int:user_id>/promote/",
        views.workspace_member_promote,
        name="member-promote",
    ),
    path(
        "<slug:slug>/members/<int:user_id>/demote/",
        views.workspace_member_demote,
        name="member-demote",
    ),
    path(
        "<slug:slug>/members/<int:user_id>/handover/",
        views.workspace_member_handover,
        name="member-handover",
    ),
]
