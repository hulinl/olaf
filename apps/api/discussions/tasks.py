"""Celery tasks for discussion notifications."""
from __future__ import annotations

from celery import shared_task

from .emails import send_comment_notification, send_topic_announce
from .models import Comment, Topic


@shared_task(name="discussions.send_comment_notification")
def send_comment_notification_task(comment_id: int) -> None:
    try:
        comment = Comment.objects.select_related(
            "topic", "topic__author", "author"
        ).get(pk=comment_id)
    except Comment.DoesNotExist:
        return
    send_comment_notification(comment)


@shared_task(name="discussions.send_topic_announce")
def send_topic_announce_task(topic_id: int) -> None:
    try:
        topic = Topic.objects.select_related("author").get(pk=topic_id)
    except Topic.DoesNotExist:
        return
    send_topic_announce(topic)
