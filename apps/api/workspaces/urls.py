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
    path(
        "<slug:slug>/members.csv",
        views.workspace_members_csv,
        name="members-csv",
    ),
    path("<slug:slug>/tags/", views.person_tags, name="tags"),
    path(
        "<slug:slug>/tags/<int:tag_id>/",
        views.person_tag_detail,
        name="tag-detail",
    ),
    path(
        "<slug:slug>/members/<int:user_id>/note/",
        views.person_note,
        name="member-note",
    ),
    path(
        "<slug:slug>/members/<int:user_id>/tags/<int:tag_id>/",
        views.person_tag_assignment,
        name="member-tag",
    ),
    path(
        "<slug:slug>/payments/reconcile/",
        views.workspace_payments_reconcile,
        name="payments-reconcile",
    ),
]
