"""Email helpers for discussion-wall notifications.

Two cases in V1:
- Comment added → email the topic author (unless they're the commenter).
- New topic on a workspace or event → email everyone who can see it.

Both respect the recipient's `notify_on_discussion_*` opt-out toggles.
"""
from __future__ import annotations

from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string

from accounts.models import User
from events.models import RSVP, Event
from workspaces.models import Workspace, WorkspaceMember

from .models import Comment, Topic


def _frontend_url(path: str) -> str:
    base = getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")
    return f"{base}{path}"


def _topic_url(topic: Topic) -> str:
    if topic.parent_type == Topic.PARENT_WORKSPACE:
        ws = Workspace.objects.filter(pk=topic.parent_id).first()
        if not ws:
            return _frontend_url("/")
        return _frontend_url(f"/admin/komunity/{ws.slug}")
    event = Event.objects.select_related("workspace").filter(
        pk=topic.parent_id
    ).first()
    if not event:
        return _frontend_url("/")
    return _frontend_url(f"/events/{event.workspace.slug}/{event.slug}")


def _parent_label(topic: Topic) -> str:
    if topic.parent_type == Topic.PARENT_WORKSPACE:
        ws = Workspace.objects.filter(pk=topic.parent_id).first()
        return ws.name if ws else "Komunita"
    event = Event.objects.filter(pk=topic.parent_id).first()
    return event.title if event else "Akce"


def send_comment_notification(comment: Comment) -> None:
    """Email the topic author when someone replies. Skips when:
    - the comment author IS the topic author (no self-pings),
    - the topic author opted out,
    - the topic author is missing.
    """
    topic = comment.topic
    if topic.author_id is None or topic.author_id == comment.author_id:
        return
    if not topic.author.notify_on_discussion_reply:
        return

    context = {
        "topic": topic,
        "comment": comment,
        "topic_url": _topic_url(topic),
        "parent_label": _parent_label(topic),
        "author_name": (
            comment.author.get_full_name()
            if comment.author
            else "[smazaný uživatel]"
        ),
    }
    body = render_to_string("discussions/comment_added.txt", context)
    send_mail(
        subject=f"Nová odpověď: {topic.title}",
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[topic.author.email],
        fail_silently=False,
    )


def _audience_for_topic(topic: Topic) -> list[User]:
    """Who should get an announce email for this topic.

    Workspace topics → all WorkspaceMembers (including the owner).
    Event topics → all users with a non-cancelled RSVP + the workspace owner.
    The author is excluded so they don't get their own announcement.
    """
    recipients: set[int] = set()

    if topic.parent_type == Topic.PARENT_WORKSPACE:
        recipients.update(
            WorkspaceMember.objects.filter(workspace_id=topic.parent_id)
            .values_list("user_id", flat=True)
        )
    else:
        event = (
            Event.objects.select_related("workspace")
            .filter(pk=topic.parent_id)
            .first()
        )
        if event is None:
            return []
        recipients.update(
            RSVP.objects.filter(event=event)
            .exclude(status=RSVP.STATUS_CANCELLED)
            .values_list("user_id", flat=True)
        )
        recipients.update(
            WorkspaceMember.objects.filter(workspace=event.workspace)
            .values_list("user_id", flat=True)
        )

    if topic.author_id:
        recipients.discard(topic.author_id)

    return list(
        User.objects.filter(
            id__in=recipients,
            notify_on_discussion_announce=True,
        )
    )


def send_topic_announce(topic: Topic) -> None:
    """Broadcast a new topic to its audience. Sends individual emails so
    recipients don't see each other's addresses (no CC/BCC plumbing yet)."""
    audience = _audience_for_topic(topic)
    if not audience:
        return

    parent_label = _parent_label(topic)
    topic_url = _topic_url(topic)

    for user in audience:
        context = {
            "topic": topic,
            "topic_url": topic_url,
            "parent_label": parent_label,
            "recipient": user,
            "author_name": (
                topic.author.get_full_name()
                if topic.author
                else "[smazaný uživatel]"
            ),
        }
        body = render_to_string("discussions/topic_announced.txt", context)
        send_mail(
            subject=f"Nové téma v {parent_label}: {topic.title}",
            message=body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=True,  # one bad address shouldn't drop the rest
        )
