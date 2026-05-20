from django.urls import path

from . import views

app_name = "discussions"

urlpatterns = [
    # Workspace wall
    path(
        "workspace/<slug:slug>/topics/",
        views.workspace_topics,
        name="workspace-topics",
    ),
    path(
        "workspace/<slug:slug>/topics/<int:topic_id>/",
        views.workspace_topic_detail,
        name="workspace-topic-detail",
    ),
    path(
        "workspace/<slug:slug>/topics/<int:topic_id>/comments/",
        views.workspace_topic_comments,
        name="workspace-topic-comments",
    ),
    path(
        "workspace/<slug:slug>/topics/<int:topic_id>/comments/<int:comment_id>/",
        views.workspace_comment_detail,
        name="workspace-comment-detail",
    ),
    path(
        "workspace/<slug:slug>/topics/<int:topic_id>/like/",
        views.workspace_topic_like,
        name="workspace-topic-like",
    ),
    path(
        "workspace/<slug:slug>/topics/<int:topic_id>/comments/<int:comment_id>/like/",
        views.workspace_comment_like,
        name="workspace-comment-like",
    ),
    # Event wall
    path(
        "event/<slug:workspace_slug>/<slug:event_slug>/topics/",
        views.event_topics,
        name="event-topics",
    ),
    path(
        "event/<slug:workspace_slug>/<slug:event_slug>/topics/<int:topic_id>/",
        views.event_topic_detail,
        name="event-topic-detail",
    ),
    path(
        "event/<slug:workspace_slug>/<slug:event_slug>/topics/<int:topic_id>/comments/",
        views.event_topic_comments,
        name="event-topic-comments",
    ),
    path(
        "event/<slug:workspace_slug>/<slug:event_slug>/topics/<int:topic_id>/comments/<int:comment_id>/",
        views.event_comment_detail,
        name="event-comment-detail",
    ),
    path(
        "event/<slug:workspace_slug>/<slug:event_slug>/topics/<int:topic_id>/like/",
        views.event_topic_like,
        name="event-topic-like",
    ),
    path(
        "event/<slug:workspace_slug>/<slug:event_slug>/topics/<int:topic_id>/comments/<int:comment_id>/like/",
        views.event_comment_like,
        name="event-comment-like",
    ),
]
