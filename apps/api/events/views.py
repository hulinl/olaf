"""Event + RSVP views."""
from __future__ import annotations

import secrets

from django.contrib.auth import login
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from accounts.models import User
from workspaces.models import Workspace

from .models import RSVP, Event
from .permissions import is_workspace_owner
from .serializers import (
    EventPublicSerializer,
    EventSummarySerializer,
    MyRSVPSerializer,
    RSVPCreateSerializer,
    RSVPSerializer,
)
from .tasks import send_rsvp_confirmation_task


def _load_published_event(workspace_slug: str, event_slug: str):
    """Return the event if it's visible publicly, else None."""
    try:
        return Event.objects.select_related("workspace").get(
            workspace__slug=workspace_slug, slug=event_slug
        )
    except Event.DoesNotExist:
        return None


@api_view(["GET"])
@permission_classes([AllowAny])
def public_event(request: Request, workspace_slug: str, event_slug: str) -> Response:
    """Public event landing-page data (PRD §4.5)."""
    event = _load_published_event(workspace_slug, event_slug)
    if event is None:
        return Response(
            {"detail": "Event not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    # Draft events visible only to the creator (workspace owner).
    if event.status == Event.STATUS_DRAFT and not is_workspace_owner(
        request.user, event.workspace
    ):
        return Response(
            {"detail": "Event not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    serializer = EventPublicSerializer(event)
    payload = serializer.data

    # If the requester is authenticated and has an RSVP, include it.
    if request.user.is_authenticated:
        my_rsvp = (
            RSVP.objects.filter(event=event, user=request.user).first()
        )
        payload["my_rsvp"] = (
            MyRSVPSerializer(my_rsvp).data if my_rsvp else None
        )

    return Response(payload)


def _create_light_user(account_payload: dict) -> User | None:
    """Create a verified light-registration user for the public RSVP flow.

    The user is auto-verified (no email confirmation) because the RSVP itself
    is the proof of email — a confirmation lands in their inbox right after.
    A random password is set; the user is prompted to use password reset to
    pick their own.
    """
    email = (account_payload.get("email") or "").strip().lower()
    first_name = (account_payload.get("first_name") or "").strip()
    last_name = (account_payload.get("last_name") or "").strip()
    phone = (account_payload.get("phone") or "").strip()

    if not (email and first_name and last_name):
        return None

    user, created = User.objects.get_or_create(
        email=email,
        defaults={
            "first_name": first_name,
            "last_name": last_name,
            "phone": phone,
            "email_verified": True,
        },
    )
    if created:
        user.set_password(secrets.token_urlsafe(24))
        user.save(update_fields=["password"])
    elif not user.email_verified:
        user.email_verified = True
        if phone and not user.phone:
            user.phone = phone
        user.save(update_fields=["email_verified", "phone"])
    return user


@api_view(["POST"])
@permission_classes([AllowAny])
def rsvp_event(request: Request, workspace_slug: str, event_slug: str) -> Response:
    """Public RSVP submission (PRD §4.6)."""
    event = _load_published_event(workspace_slug, event_slug)
    if event is None:
        return Response(
            {"detail": "Event not found."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if not event.is_open_for_rsvp:
        return Response(
            {
                "detail": (
                    "This event is not currently accepting registrations."
                )
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    serializer = RSVPCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    user = request.user if request.user.is_authenticated else None
    if user is None:
        account = data.get("account") or {}
        user = _create_light_user(account)
        if user is None:
            return Response(
                {
                    "account": (
                        "Email, first_name, and last_name are required when "
                        "registering without an account."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Log them in so subsequent edits to their RSVP work without a
        # separate password flow.
        login(request, user, backend="django.contrib.auth.backends.ModelBackend")

    try:
        rsvp = RSVP.create_for_event(
            event=event,
            user=user,
            questionnaire_answers=data["answers"],
        )
    except DjangoValidationError as e:
        return Response(
            {"detail": e.messages[0] if e.messages else str(e)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Fire-and-forget confirmation email. Slight race vs. DB commit is fine:
    # the Celery broker latency is longer than the request commit.
    send_rsvp_confirmation_task.delay(rsvp.pk)

    return Response(
        MyRSVPSerializer(rsvp).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cancel_my_rsvp(request: Request, workspace_slug: str, event_slug: str) -> Response:
    event = _load_published_event(workspace_slug, event_slug)
    if event is None:
        return Response(status=status.HTTP_404_NOT_FOUND)

    try:
        rsvp = RSVP.objects.get(event=event, user=request.user)
    except RSVP.DoesNotExist:
        return Response(
            {"detail": "You have no RSVP for this event."},
            status=status.HTTP_404_NOT_FOUND,
        )

    rsvp.cancel()
    return Response(MyRSVPSerializer(rsvp).data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def my_events(request: Request) -> Response:
    """Events the current user is RSVP-ed to (any non-cancelled status)."""
    rsvps = (
        RSVP.objects.filter(user=request.user)
        .exclude(status=RSVP.STATUS_CANCELLED)
        .select_related("event", "event__workspace")
        .order_by("event__starts_at")
    )
    serializer = EventSummarySerializer([r.event for r in rsvps], many=True)
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def owner_events(request: Request) -> Response:
    """Events the current user owns (workspace-Owner-scoped)."""
    workspaces = (
        Workspace.objects.filter(
            members__user=request.user,
            members__role="owner",
        )
        .distinct()
    )
    events = (
        Event.objects.filter(workspace__in=workspaces)
        .select_related("workspace")
        .order_by("-starts_at")
    )
    serializer = EventSummarySerializer(events, many=True)
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def event_rsvps(request: Request, workspace_slug: str, event_slug: str) -> Response:
    """Owner-only list of RSVPs for an event (with questionnaire answers)."""
    try:
        event = Event.objects.select_related("workspace").get(
            workspace__slug=workspace_slug, slug=event_slug
        )
    except Event.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if not is_workspace_owner(request.user, event.workspace):
        return Response(status=status.HTTP_403_FORBIDDEN)

    rsvps = (
        RSVP.objects.filter(event=event)
        .exclude(status=RSVP.STATUS_CANCELLED)
        .select_related("user")
        .order_by("status", "waitlist_position", "created_at")
    )
    return Response(RSVPSerializer(rsvps, many=True).data)
