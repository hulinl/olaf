from django.urls import path

from . import views

app_name = "workspaces"

urlpatterns = [
    # Token-based public lookups MUST come before `<slug:slug>/...` routes
    # — slug regex includes `_`, so otherwise `_/invitations/abc/` would
    # match workspace_invitations(slug="_").
    path(
        "_/invitations/<str:token>/",
        views.invitation_lookup,
        name="invitation-lookup",
    ),
    path(
        "_/invitations/<str:token>/accept/",
        views.invitation_accept,
        name="invitation-accept",
    ),
    path(
        "_/join/<str:token>/",
        views.public_invite_lookup,
        name="public-invite-lookup",
    ),
    path(
        "_/join/<str:token>/accept/",
        views.public_invite_accept,
        name="public-invite-accept",
    ),
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
        "<slug:slug>/participants/",
        views.workspace_participants,
        name="participants",
    ),
    path(
        "<slug:slug>/removed-members/",
        views.workspace_removed_members,
        name="removed-members",
    ),
    path(
        "<slug:slug>/members/<int:user_id>/",
        views.workspace_member_detail,
        name="member-detail",
    ),
    path(
        "<slug:slug>/members/<int:user_id>/remove/",
        views.workspace_member_remove,
        name="member-remove",
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
    path(
        "<slug:slug>/members/add/",
        views.workspace_add_existing_member,
        name="add-existing-member",
    ),
    path(
        "<slug:slug>/invitations/",
        views.workspace_invitations,
        name="invitations",
    ),
    path(
        "<slug:slug>/invitations/<int:invitation_id>/",
        views.workspace_invitation_detail,
        name="invitation-detail",
    ),
    path(
        "<slug:slug>/invitations/bulk/",
        views.workspace_invitations_bulk,
        name="invitations-bulk",
    ),
    path(
        "<slug:slug>/invite-link/",
        views.workspace_invite_link,
        name="invite-link",
    ),
    path(
        "<slug:slug>/members/bulk-email/",
        views.workspace_members_bulk_email,
        name="members-bulk-email",
    ),
]
