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

from django.db.models import Count, Exists, OuterRef
from rest_framework import status
from rest_framework.decorators import (
    api_view,
    parser_classes,
    permission_classes,
)
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from .models import Comment, Topic, TopicLike
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

_COMMENT_IMAGE_MAX_BYTES = 6 * 1024 * 1024  # 6 MB


def _annotate_likes(qs, user):
    """Annotate topics with _like_count + _i_liked for serializer use.
    Cuts the N+1 the SerializerMethodField would otherwise produce."""
    qs = qs.annotate(_like_count=Count("likes", distinct=True))
    if user.is_authenticated:
        qs = qs.annotate(
            _i_liked=Exists(
                TopicLike.objects.filter(topic=OuterRef("pk"), user=user)
            )
        )
    return qs


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
        qs = _annotate_likes(
            Topic.objects.filter(
                parent_type=Topic.PARENT_WORKSPACE, parent_id=workspace.id
            ),
            request.user,
        )
        return Response(
            TopicSerializer(qs, many=True, context={"request": request}).data
        )

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
    from .tasks import send_topic_announce_task

    send_topic_announce_task.delay(topic.pk)
    return Response(
        TopicDetailSerializer(topic, context={"request": request}).data,
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
        return Response(
            TopicDetailSerializer(topic, context={"request": request}).data
        )

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
    return Response(
        TopicDetailSerializer(topic, context={"request": request}).data
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser, MultiPartParser, FormParser])
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
    # Accept both legacy "image" and new "attachment" form field names —
    # the renamed UI sends `attachment` but a stale client could still
    # send `image`.
    attachment = request.FILES.get("attachment") or request.FILES.get("image")
    # Allow attachment-only comments (e.g. quick photo reply); require
    # body only when there's no file to upload.
    if not body and not attachment:
        return Response(
            {"body": "Napiš zprávu nebo přilož soubor."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if attachment is not None and attachment.size > _COMMENT_IMAGE_MAX_BYTES:
        return Response(
            {"attachment": "Soubor je moc velký (max 6 MB)."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    # Reply-to handling: only one level deep. If the requested parent
    # is itself a reply, climb to its root so we never grow trees.
    parent = None
    parent_id = request.data.get("parent")
    if parent_id:
        try:
            candidate = Comment.objects.get(pk=parent_id, topic=topic)
            parent = candidate.parent or candidate
        except Comment.DoesNotExist:
            pass
    comment = Comment.objects.create(
        topic=topic, body=body, author=request.user, parent=parent, image=attachment
    )
    from .tasks import send_comment_notification_task

    send_comment_notification_task.delay(comment.pk)
    return Response(
        CommentSerializer(comment, context={"request": request}).data, status=status.HTTP_201_CREATED
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
        qs = _annotate_likes(
            Topic.objects.filter(
                parent_type=Topic.PARENT_EVENT, parent_id=event.id
            ),
            request.user,
        )
        return Response(
            TopicSerializer(qs, many=True, context={"request": request}).data
        )

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
    from .tasks import send_topic_announce_task

    send_topic_announce_task.delay(topic.pk)
    return Response(
        TopicDetailSerializer(topic, context={"request": request}).data,
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
        return Response(
            TopicDetailSerializer(topic, context={"request": request}).data
        )

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
    return Response(
        TopicDetailSerializer(topic, context={"request": request}).data
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
@parser_classes([JSONParser, MultiPartParser, FormParser])
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
    # Accept both legacy "image" and new "attachment" form field names.
    attachment = request.FILES.get("attachment") or request.FILES.get("image")
    if not body and not attachment:
        return Response(
            {"body": "Napiš zprávu nebo přilož soubor."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if attachment is not None and attachment.size > _COMMENT_IMAGE_MAX_BYTES:
        return Response(
            {"attachment": "Soubor je moc velký (max 6 MB)."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    parent = None
    parent_id = request.data.get("parent")
    if parent_id:
        try:
            candidate = Comment.objects.get(pk=parent_id, topic=topic)
            parent = candidate.parent or candidate
        except Comment.DoesNotExist:
            pass
    comment = Comment.objects.create(
        topic=topic, body=body, author=request.user, parent=parent, image=attachment
    )
    from .tasks import send_comment_notification_task

    send_comment_notification_task.delay(comment.pk)
    return Response(
        CommentSerializer(comment, context={"request": request}).data, status=status.HTTP_201_CREATED
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


# ---------------------------------------------------------------------------
# Likes (shared toggle endpoint — works for both scopes)
# ---------------------------------------------------------------------------


def _toggle_like(request, topic: Topic) -> Response:
    """POST = like, DELETE = unlike. Idempotent both ways. Returns the
    updated like_count + i_liked so the client can refresh without
    re-listing."""
    if request.method == "POST":
        TopicLike.objects.get_or_create(topic=topic, user=request.user)
    else:
        TopicLike.objects.filter(topic=topic, user=request.user).delete()
    return Response(
        {
            "topic_id": topic.id,
            "like_count": topic.likes.count(),
            "i_liked": request.method == "POST",
        }
    )


@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated])
def workspace_topic_like(
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
    return _toggle_like(request, topic)


@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated])
def event_topic_like(
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
    return _toggle_like(request, topic)


def _toggle_comment_like(request, comment) -> Response:
    """Mirror of _toggle_like for Comment. Returns updated count + i_liked
    so the UI can refresh in place."""
    from .models import CommentLike

    if request.method == "POST":
        CommentLike.objects.get_or_create(comment=comment, user=request.user)
    else:
        CommentLike.objects.filter(
            comment=comment, user=request.user
        ).delete()
    return Response(
        {
            "comment_id": comment.id,
            "like_count": comment.likes.count(),
            "i_liked": request.method == "POST",
        }
    )


@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated])
def workspace_comment_like(
    request: Request, slug: str, topic_id: int, comment_id: int
) -> Response:
    workspace = _resolve_workspace(slug)
    if workspace is None:
        return Response(status=status.HTTP_404_NOT_FOUND)
    if not can_access_workspace_wall(request.user, workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)
    try:
        comment = Comment.objects.select_related("topic").get(
            pk=comment_id,
            topic_id=topic_id,
            topic__parent_type=Topic.PARENT_WORKSPACE,
            topic__parent_id=workspace.id,
        )
    except Comment.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    return _toggle_comment_like(request, comment)


@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated])
def event_comment_like(
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
            pk=comment_id,
            topic_id=topic_id,
            topic__parent_type=Topic.PARENT_EVENT,
            topic__parent_id=event.id,
        )
    except Comment.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    return _toggle_comment_like(request, comment)

