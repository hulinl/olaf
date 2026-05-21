"""@-mention parsing + fan-out from discussion comments.

Slack-style mentions: write `@firstname` or `@firstname.lastname` in
a comment body and the named user gets a bell-feed notification with
kind=`discussion_mention`. Resolution is scoped to people who can
already see the topic — you can't mention a stranger into an event
they're not RSVPed to.

Skipped:
- the comment author (no self-pings)
- the topic author (they already get a reply notification)
- users who opted out via notify_on_discussion_reply (we treat
  mentions as a stronger reply signal)
- ambiguous mentions (two users match) — silently drop, no UX yet
  for "did you mean X or Y"
"""
from __future__ import annotations

import re

from accounts.models import User
from events.models import RSVP, Event
from notifications.models import Notification
from workspaces.models import Workspace, WorkspaceMember

from .models import Comment, Topic

# `@` followed by a name-ish token. Allows latin + diacritics + the
# usual handle separators. The trailing punctuation `.,;:!?)` is
# excluded so "@Marta," doesn't capture the comma.
_MENTION_RE = re.compile(
    r"@([A-Za-zÀ-ž][A-Za-zÀ-ž0-9._\-]+)",
)


def extract_mention_candidates(body: str) -> list[str]:
    """Pull out every `@name` token from the body, deduped + ordered
    by first occurrence so the response stays stable."""
    if not body:
        return []
    seen: set[str] = set()
    out: list[str] = []
    for m in _MENTION_RE.finditer(body):
        token = m.group(1).strip(".-_")
        key = token.lower()
        if key in seen or not token:
            continue
        seen.add(key)
        out.append(token)
    return out


def _eligible_user_ids_for_topic(topic: Topic) -> set[int]:
    """The pool of users we're willing to fire a mention notification
    to. Scoped to "people who can already see the topic" — never
    arbitrary platform users."""
    if topic.parent_type == Topic.PARENT_WORKSPACE:
        return set(
            WorkspaceMember.objects.filter(workspace_id=topic.parent_id)
            .values_list("user_id", flat=True)
        )
    # Event scope: RSVPed users + workspace members (the latter are
    # the owners + admins).
    try:
        event = Event.objects.select_related("workspace").get(pk=topic.parent_id)
    except Event.DoesNotExist:
        return set()
    rsvped = set(
        RSVP.objects.filter(event=event)
        .exclude(status=RSVP.STATUS_CANCELLED)
        .values_list("user_id", flat=True)
    )
    ws_members = set(
        WorkspaceMember.objects.filter(workspace=event.workspace)
        .values_list("user_id", flat=True)
    )
    return rsvped | ws_members


def _resolve_mention(token: str, eligible_ids: set[int]) -> User | None:
    """Find a User whose display_name / first_name / last_name
    matches the token, within the eligible pool. Returns None when
    no unambiguous match is found.

    Matching is case-insensitive and tries several normalisations:
    - `@firstname.lastname` → first_name + last_name (dot-separated)
    - `@firstname` → first_name only (only when unique in pool)
    - `@displayname` → display_name verbatim
    """
    if not eligible_ids:
        return None

    base_qs = User.objects.filter(id__in=eligible_ids)

    # 1. Try the dotted form `firstname.lastname`.
    if "." in token:
        first, _, last = token.partition(".")
        candidates = list(
            base_qs.filter(
                first_name__iexact=first.strip(),
                last_name__iexact=last.strip(),
            )
        )
        if len(candidates) == 1:
            return candidates[0]
        if len(candidates) > 1:
            return None  # ambiguous → bail out

    # 2. Try display_name verbatim.
    candidates = list(base_qs.filter(display_name__iexact=token.strip()))
    if len(candidates) == 1:
        return candidates[0]

    # 3. Fall back to first_name only — must be unique in the pool.
    candidates = list(base_qs.filter(first_name__iexact=token.strip()))
    if len(candidates) == 1:
        return candidates[0]

    return None


def _topic_link(topic: Topic) -> str:
    """Mirror discussions.emails._topic_url. Kept here to avoid
    cross-importing private helpers."""
    if topic.parent_type == Topic.PARENT_WORKSPACE:
        try:
            ws = Workspace.objects.get(pk=topic.parent_id)
            return f"/admin/komunity/{ws.slug}"
        except Workspace.DoesNotExist:
            return "/"
    try:
        event = Event.objects.select_related("workspace").get(pk=topic.parent_id)
        return f"/events/{event.workspace.slug}/{event.slug}"
    except Event.DoesNotExist:
        return "/"


def notify_mentions(comment: Comment) -> int:
    """Create a `discussion_mention` notification for each unique
    eligible user named in the comment body. Returns the number of
    notifications created."""
    tokens = extract_mention_candidates(comment.body or "")
    if not tokens:
        return 0

    topic = comment.topic
    eligible = _eligible_user_ids_for_topic(topic)
    # Don't ping the author or the topic owner — they have their own
    # signals (self-reply skipped + reply notification respectively).
    if comment.author_id:
        eligible.discard(comment.author_id)
    if topic.author_id:
        eligible.discard(topic.author_id)

    if not eligible:
        return 0

    author_name = (
        comment.author.get_full_name()
        if comment.author
        else "[smazaný uživatel]"
    )
    link = _topic_link(topic)
    body_excerpt = (comment.body or "")[:280]

    created = 0
    notified_ids: set[int] = set()
    for token in tokens:
        user = _resolve_mention(token, eligible)
        if user is None or user.id in notified_ids:
            continue
        if not user.notify_on_discussion_reply:
            # Mention falls under the same opt-out as reply for V1 —
            # easier than a third toggle. Refine later if users ask.
            continue
        Notification.objects.create(
            recipient=user,
            kind=Notification.KIND_DISCUSSION_MENTION,
            title=f'{author_name} tě zmínil v „{topic.title}"',
            body=body_excerpt,
            link=link,
            payload={
                "topic_id": topic.pk,
                "comment_id": comment.pk,
                "parent_type": topic.parent_type,
                "parent_id": topic.parent_id,
                "mention_token": token,
            },
        )
        notified_ids.add(user.id)
        created += 1
    return created
