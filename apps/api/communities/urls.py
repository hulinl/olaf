from django.urls import path

from . import views

app_name = "communities"

urlpatterns = [
    path(
        "workspaces/<slug:workspace_slug>/",
        views.workspace_communities,
        name="workspace-communities",
    ),
    path(
        "workspaces/<slug:workspace_slug>/<slug:community_slug>/",
        views.community_detail,
        name="detail",
    ),
    path(
        "workspaces/<slug:workspace_slug>/<slug:community_slug>/members/",
        views.community_members,
        name="members",
    ),
    path(
        "workspaces/<slug:workspace_slug>/<slug:community_slug>/members/<int:member_id>/",
        views.community_member_detail,
        name="member-detail",
    ),
    path(
        "workspaces/<slug:workspace_slug>/<slug:community_slug>/members/<int:member_id>/role/",
        views.community_member_role,
        name="member-role",
    ),
]
