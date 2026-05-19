"""Discussion wall API views.

URL shape mirrors the parent:
    /workspace/<slug>/topics/                       — list + create
    /workspace/<slug>/topics/<id>/                  — detail + edit + delete
    /workspace/<slug>/topics/<id>/comments/         — add
    /workspace/<slug>/topics/<id>/comments/<id>/    — delete (author or owner)
    /event/<ws_slug>/<event_slug>/...               — same shape

Permissions are centralised in .permissions (members/RSVPs only).
"""
from __future__ import annotations

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from .models import Comment, Topic
from .permissions import (
    can_access_event_wall,
    can_access_workspace_wall,
    can_moderate_event,
    can_moderate_workspace,
)
from .serializers import (
    CommentSerializer,
    TopicDetailSerializer,
    TopicSerializer,
)


def _resolve_workspace(slug):
    from workspaces.models import Workspace

    try:
        return Workspace.objects.get(slug=slug)
    except Workspace.DoesNotExist:
        return None


def _resolve_event(ws_slug, event_slug):
    from events.models import Event

    try:
        return Event.objects.select_related("workspace").get(
            workspace__slug=ws_slug, slug=event_slug
        )
    except Event.DoesNotExist:
        return None


# ---------------------------------------------------------------------------
# Workspace wall
# ---------------------------------------------------------------------------


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def workspace_topics(request: Request, slug: str) -> Response:
    workspace = _resolve_workspace(slug)
    if workspace is None:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not can_access_workspace_wall(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    if request.method == "GET":
        qs = Topic.objects.filter(
            parent_type=Topic.PARENT_WORKSPACE, parent_id=workspace.id
        )
        return Response(TopicSerializer(qs, many=True).data)

    title = (request.data.get("title") or "").strip()
    body = (request.data.get("body") or "").strip()
    if not title:
        return Response(
            {"title": "Vyplň titulek."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    pinned = bool(request.data.get("pinned")) and can_moderate_workspace(
        request.user, workspace
    )
    topic = Topic.objects.create(
        parent_type=Topic.PARENT_WORKSPACE,
        parent_id=workspace.id,
        title=title[:200],
        body=body,
        author=request.user,
        pinned=pinned,
    )
    return Response(
        TopicDetailSerializer(topic).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def workspace_topic_detail(
    request: Request, slug: str, topic_id: int
) -> Response:
    workspace = _resolve_workspace(slug)
    if workspace is None:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not can_access_workspace_wall(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    try:
        topic = Topic.objects.get(
            pk=topic_id,
            parent_type=Topic.PARENT_WORKSPACE,
            parent_id=workspace.id,
        )
    except Topic.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    is_mod = can_moderate_workspace(request.user, workspace)
    is_author = topic.author_id == request.user.id

    if request.method == "GET":
        return Response(TopicDetailSerializer(topic).data)

    if not (is_mod or is_author):
        return Response(status=status.HTTP_403_FORBIDDEN)

    if request.method == "DELETE":
        topic.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    title = request.data.get("title")
    body = request.data.get("body")
    if title is not None:
        topic.title = str(title).strip()[:200] or topic.title
    if body is not None:
        topic.body = str(body)
    if is_mod:
        if "pinned" in request.data:
            topic.pinned = bool(request.data["pinned"])
        if "locked" in request.data:
            topic.locked = bool(request.data["locked"])
    topic.save()
    return Response(TopicDetailSerializer(topic).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def workspace_topic_comments(
    request: Request, slug: str, topic_id: int
) -> Response:
    workspace = _resolve_workspace(slug)
    if workspace is None:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not can_access_workspace_wall(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    try:
        topic = Topic.objects.get(
            pk=topic_id,
            parent_type=Topic.PARENT_WORKSPACE,
            parent_id=workspace.id,
        )
    except Topic.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if topic.locked:
        return Response(
            {"detail": "Téma je zamčené, nové komentáře nelze přidat."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    body = (request.data.get("body") or "").strip()
    if not body:
        return Response(
            {"body": "Napiš zprávu."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    comment = Comment.objects.create(
        topic=topic, body=body, author=request.user
    )
    return Response(
        CommentSerializer(comment).data, status=status.HTTP_201_CREATED
    )


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def workspace_comment_detail(
    request: Request, slug: str, topic_id: int, comment_id: int
) -> Response:
    workspace = _resolve_workspace(slug)
    if workspace is None:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not can_access_workspace_wall(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)
    try:
        comment = Comment.objects.select_related("topic").get(
            pk=comment_id, topic_id=topic_id
        )
    except Comment.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if (
        comment.author_id != request.user.id
        and not can_moderate_workspace(request.user, workspace)
    ):
        return Response(status=status.HTTP_403_FORBIDDEN)
    comment.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# Event wall (same shape, different parent)
# ---------------------------------------------------------------------------


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def event_topics(
    request: Request, workspace_slug: str, event_slug: str
) -> Response:
    event = _resolve_event(workspace_slug, event_slug)
    if event is None:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not can_access_event_wall(request.user, event):
        return Response(status=status.HTTP_403_FORBIDDEN)

    if request.method == "GET":
        qs = Topic.objects.filter(
            parent_type=Topic.PARENT_EVENT, parent_id=event.id
        )
        return Response(TopicSerializer(qs, many=True).data)

    title = (request.data.get("title") or "").strip()
    body = (request.data.get("body") or "").strip()
    if not title:
        return Response(
            {"title": "Vyplň titulek."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    pinned = bool(request.data.get("pinned")) and can_moderate_event(
        request.user, event
    )
    topic = Topic.objects.create(
        parent_type=Topic.PARENT_EVENT,
        parent_id=event.id,
        title=title[:200],
        body=body,
        author=request.user,
        pinned=pinned,
    )
    return Response(
        TopicDetailSerializer(topic).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def event_topic_detail(
    request: Request,
    workspace_slug: str,
    event_slug: str,
    topic_id: int,
) -> Response:
    event = _resolve_event(workspace_slug, event_slug)
    if event is None:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not can_access_event_wall(request.user, event):
        return Response(status=status.HTTP_403_FORBIDDEN)

    try:
        topic = Topic.objects.get(
            pk=topic_id,
            parent_type=Topic.PARENT_EVENT,
            parent_id=event.id,
        )
    except Topic.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    is_mod = can_moderate_event(request.user, event)
    is_author = topic.author_id == request.user.id

    if request.method == "GET":
        return Response(TopicDetailSerializer(topic).data)

    if not (is_mod or is_author):
        return Response(status=status.HTTP_403_FORBIDDEN)

    if request.method == "DELETE":
        topic.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    title = request.data.get("title")
    body = request.data.get("body")
    if title is not None:
        topic.title = str(title).strip()[:200] or topic.title
    if body is not None:
        topic.body = str(body)
    if is_mod:
        if "pinned" in request.data:
            topic.pinned = bool(request.data["pinned"])
        if "locked" in request.data:
            topic.locked = bool(request.data["locked"])
    topic.save()
    return Response(TopicDetailSerializer(topic).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def event_topic_comments(
    request: Request,
    workspace_slug: str,
    event_slug: str,
    topic_id: int,
) -> Response:
    event = _resolve_event(workspace_slug, event_slug)
    if event is None:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not can_access_event_wall(request.user, event):
        return Response(status=status.HTTP_403_FORBIDDEN)

    try:
        topic = Topic.objects.get(
            pk=topic_id,
            parent_type=Topic.PARENT_EVENT,
            parent_id=event.id,
        )
    except Topic.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if topic.locked:
        return Response(
            {"detail": "Téma je zamčené, nové komentáře nelze přidat."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    body = (request.data.get("body") or "").strip()
    if not body:
        return Response(
            {"body": "Napiš zprávu."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    comment = Comment.objects.create(
        topic=topic, body=body, author=request.user
    )
    return Response(
        CommentSerializer(comment).data, status=status.HTTP_201_CREATED
    )


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def event_comment_detail(
    request: Request,
    workspace_slug: str,
    event_slug: str,
    topic_id: int,
    comment_id: int,
) -> Response:
    event = _resolve_event(workspace_slug, event_slug)
    if event is None:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not can_access_event_wall(request.user, event):
        return Response(status=status.HTTP_403_FORBIDDEN)
    try:
        comment = Comment.objects.select_related("topic").get(
            pk=comment_id, topic_id=topic_id
        )
    except Comment.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if (
        comment.author_id != request.user.id
        and not can_moderate_event(request.user, event)
    ):
        return Response(status=status.HTTP_403_FORBIDDEN)
    comment.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)
