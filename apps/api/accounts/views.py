from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from .emails import send_password_reset_email, send_verification_email
from .models import EmailVerificationToken, PasswordResetToken, User
from .serializers import (
    LoginSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    SignupSerializer,
    UserSerializer,
    VerifyEmailSerializer,
)
from .throttles import LoginThrottle, PasswordResetThrottle, RegisterThrottle


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([RegisterThrottle])
def signup(request: Request) -> Response:
    """Create a new user. Sends an email verification link. PRD §4.1."""
    serializer = SignupSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    user = User.objects.create_user(
        email=data["email"],
        password=data["password"],
        first_name=data["first_name"],
        last_name=data["last_name"],
        phone=data.get("phone", ""),
    )
    token = EmailVerificationToken.objects.create(user=user)
    send_verification_email(user, token)

    return Response(
        {"detail": "Account created. Check your email to verify your address."},
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def verify_email(request: Request) -> Response:
    """Confirm an email verification token. PRD §4.1."""
    serializer = VerifyEmailSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        token = EmailVerificationToken.objects.select_related("user").get(
            token=serializer.validated_data["token"]
        )
    except EmailVerificationToken.DoesNotExist:
        return Response(
            {"detail": "Invalid or expired verification link."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not token.is_usable:
        return Response(
            {"detail": "Invalid or expired verification link."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    token.user.email_verified = True
    token.user.save(update_fields=["email_verified"])
    token.mark_used()

    return Response({"detail": "Email verified. You can now log in."})


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([LoginThrottle])
def login_view(request: Request) -> Response:
    """Authenticate and start a session. PRD §4.1."""
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    email = serializer.validated_data["email"].lower().strip()
    password = serializer.validated_data["password"]

    user = authenticate(request, username=email, password=password)
    if user is None:
        return Response(
            {"detail": "Invalid email or password."},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    if not user.email_verified:
        return Response(
            {"detail": "Please verify your email address before signing in."},
            status=status.HTTP_403_FORBIDDEN,
        )

    login(request, user)
    return Response(UserSerializer(user).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request: Request) -> Response:
    """End the session."""
    logout(request)
    return Response({"detail": "Logged out."})


@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def me(request: Request) -> Response:
    """Return or update the current authenticated user.

    PATCH respects the serializer's read_only fields (id, email,
    email_verified, date_joined cannot be changed here).
    """
    if request.method == "GET":
        return Response(UserSerializer(request.user).data)

    serializer = UserSerializer(request.user, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([AllowAny])
def csrf(request: Request) -> Response:
    """Issue a CSRF token cookie. SPA hits this once on app boot.

    Calling get_token() marks the response for a CSRF cookie set.
    """
    get_token(request)
    return Response({"detail": "ok"})


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetThrottle])
def password_reset_request(request: Request) -> Response:
    """Send a password-reset email. Always returns 200 to avoid leaking emails."""
    serializer = PasswordResetRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    email = serializer.validated_data["email"].lower().strip()
    try:
        user = User.objects.get(email=email, is_active=True)
    except User.DoesNotExist:
        user = None

    if user is not None:
        token = PasswordResetToken.objects.create(user=user)
        send_password_reset_email(user, token)

    return Response(
        {"detail": "If an account exists for that email, a reset link has been sent."}
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def password_reset_confirm(request: Request) -> Response:
    """Set a new password given a valid token."""
    serializer = PasswordResetConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    try:
        token = PasswordResetToken.objects.select_related("user").get(
            token=serializer.validated_data["token"]
        )
    except PasswordResetToken.DoesNotExist:
        return Response(
            {"detail": "Invalid or expired reset link."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not token.is_usable:
        return Response(
            {"detail": "Invalid or expired reset link."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    token.user.set_password(serializer.validated_data["password"])
    token.user.save(update_fields=["password"])
    token.mark_used()

    return Response({"detail": "Password updated. You can now log in."})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me_todo(request: Request) -> Response:
    """Dashboard "Čeká na tebe" feed — concrete items the user still owes.

    Two kinds in V1:
      - payment: paid event whose RSVP.payment_status is still "pending".
      - document: an event.required_documents entry marked required where
        the user hasn't uploaded a matching RSVPDocument yet.

    Each item carries the workspace + event slugs so the dashboard can
    link straight to the public landing where the QR + upload panels
    already render.
    """
    from events.models import RSVP, RSVPDocument

    items: list[dict] = []

    rsvps = (
        RSVP.objects.filter(user=request.user)
        .exclude(status__in=[RSVP.STATUS_CANCELLED, RSVP.STATUS_NO])
        .select_related("event", "event__workspace")
    )

    for rsvp in rsvps:
        event = rsvp.event

        # Payment todo
        if rsvp.payment_status == RSVP.PAYMENT_PENDING and rsvp.payment_due_amount:
            items.append({
                "kind": "payment",
                "rsvp_id": rsvp.id,
                "workspace_slug": event.workspace.slug,
                "workspace_name": event.workspace.name,
                "event_slug": event.slug,
                "event_title": event.title,
                "event_starts_at": event.starts_at,
                "amount": str(rsvp.payment_due_amount),
                "currency": rsvp.payment_currency or "CZK",
                "variable_symbol": rsvp.variable_symbol,
                "iban": event.workspace.payment_iban,
            })

        # Document todos
        required = event.required_documents or []
        if required:
            uploaded_keys = set(
                RSVPDocument.objects.filter(rsvp=rsvp).values_list(
                    "key", flat=True
                )
            )
            for spec in required:
                key = spec.get("key")
                if not key or not spec.get("required", True):
                    continue
                if key in uploaded_keys:
                    continue
                items.append({
                    "kind": "document",
                    "rsvp_id": rsvp.id,
                    "workspace_slug": event.workspace.slug,
                    "workspace_name": event.workspace.name,
                    "event_slug": event.slug,
                    "event_title": event.title,
                    "event_starts_at": event.starts_at,
                    "doc_key": key,
                    "doc_label": spec.get("label") or key,
                })

    # Group by event for the UI — payment first, then docs (alpha by label).
    items.sort(key=lambda i: (
        0 if i["kind"] == "payment" else 1,
        i["event_starts_at"],
        i.get("doc_label", ""),
    ))
    return Response(items)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def billing_profiles_list(request: Request) -> Response:
    """CRUD list for the current user's billing profiles."""
    from .models import BillingProfile
    from .serializers import BillingProfileSerializer

    if request.method == "GET":
        qs = BillingProfile.objects.filter(user=request.user)
        return Response(BillingProfileSerializer(qs, many=True).data)

    serializer = BillingProfileSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    profile = serializer.save(user=request.user)
    # If this is the user's first profile, make it default automatically.
    if (
        not profile.is_default
        and BillingProfile.objects.filter(user=request.user).count() == 1
    ):
        profile.is_default = True
        profile.save(update_fields=["is_default"])
    return Response(
        BillingProfileSerializer(profile).data,
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def billing_profile_detail(request: Request, profile_id: int) -> Response:
    """Retrieve / update / delete one billing profile."""
    from .models import BillingProfile
    from .serializers import BillingProfileSerializer

    try:
        profile = BillingProfile.objects.get(pk=profile_id, user=request.user)
    except BillingProfile.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(BillingProfileSerializer(profile).data)
    if request.method == "DELETE":
        was_default = profile.is_default
        profile.delete()
        # If we removed the default and there's another profile around,
        # promote the most recent one so the user always has a default.
        if was_default:
            remaining = (
                BillingProfile.objects.filter(user=request.user)
                .order_by("-created_at")
                .first()
            )
            if remaining:
                remaining.is_default = True
                remaining.save(update_fields=["is_default"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    serializer = BillingProfileSerializer(
        profile, data=request.data, partial=True
    )
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


# ---------------------------------------------------------------------------
# Web Push subscriptions
# ---------------------------------------------------------------------------


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def push_subscriptions(request: Request) -> Response:
    """List or register web-push subscriptions for the current user.

    GET — small payload per device for the settings UI.
    POST body — { endpoint, keys: { p256dh, auth }, user_agent? } as
    produced by PushManager.subscribe(). Endpoint is the natural
    key — re-subscribing the same browser updates the existing row
    instead of creating a duplicate.
    """
    from .models import PushSubscription

    user = request.user

    if request.method == "GET":
        out = [
            {
                "id": s.pk,
                "user_agent": s.user_agent,
                "created_at": s.created_at,
                "last_used_at": s.last_used_at,
            }
            for s in user.push_subscriptions.all()
        ]
        return Response(out)

    from django.conf import settings as dj_settings

    if not dj_settings.VAPID_PUBLIC_KEY:
        return Response(
            {"detail": "Web Push není v tomto prostředí nastaveno."},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    endpoint = (request.data.get("endpoint") or "").strip()
    keys = request.data.get("keys") or {}
    p256dh = (keys.get("p256dh") or "").strip()
    auth = (keys.get("auth") or "").strip()
    user_agent = (request.data.get("user_agent") or "")[:300]
    if not (endpoint and p256dh and auth):
        return Response(
            {"detail": "Chybí endpoint nebo klíče."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    sub, _ = PushSubscription.objects.update_or_create(
        endpoint=endpoint,
        defaults={
            "user": user,
            "p256dh": p256dh,
            "auth": auth,
            "user_agent": user_agent,
        },
    )
    return Response(
        {
            "id": sub.pk,
            "user_agent": sub.user_agent,
            "created_at": sub.created_at,
            "last_used_at": sub.last_used_at,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def push_subscription_detail(request: Request, sub_id: int) -> Response:
    from .models import PushSubscription

    try:
        sub = PushSubscription.objects.get(pk=sub_id, user=request.user)
    except PushSubscription.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    sub.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def push_test(request: Request) -> Response:
    """Fire a sample notification at every device the caller has
    registered. Lets owners verify the install + permission flow.

    Returns diagnostic info so we can distinguish "no subscriptions
    saved on the backend" (browser subscribed but POST failed) from
    "VAPID misconfigured" (subscriptions exist but send fails)."""
    from django.conf import settings as dj_settings

    from notifications.push import send_push_to_user

    sub_count = request.user.push_subscriptions.count()
    sent = send_push_to_user(
        request.user,
        title="olaf — test push",
        body="Push notifikace fungují. 👋",
        url="/dashboard",
        tag="test",
    )
    return Response(
        {
            "sent": sent,
            "subscriptions": sub_count,
            "vapid_configured": bool(dj_settings.VAPID_PUBLIC_KEY)
            and bool(dj_settings.VAPID_PRIVATE_KEY),
        }
    )


# ---------------------------------------------------------------------------
# Lidé — proto-CRM list of everyone who has RSVPed to creator's events
# ---------------------------------------------------------------------------


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def creator_people(request: Request) -> Response:
    """Deduped list of users who've RSVPed (non-cancelled) to any event
    in a workspace the caller owns. One row per user with aggregate
    counts so the table reads at a glance.
    """
    from django.db.models import Count, Max, Q

    from events.models import RSVP
    from workspaces.models import WorkspaceMember

    owned_ws_ids = list(
        WorkspaceMember.objects.filter(
            user=request.user, role=WorkspaceMember.ROLE_OWNER
        ).values_list("workspace_id", flat=True)
    )
    if not owned_ws_ids:
        return Response([])

    scope = Q(rsvps__event__workspace_id__in=owned_ws_ids) & ~Q(
        rsvps__status=RSVP.STATUS_CANCELLED
    )
    qs = (
        User.objects.filter(scope)
        .distinct()
        .annotate(
            event_count=Count("rsvps", distinct=True, filter=scope),
            last_rsvp_at=Max("rsvps__created_at", filter=scope),
        )
        .order_by("-last_rsvp_at", "last_name", "first_name")
    )

    out = [
        {
            "user_id": u.id,
            "full_name": u.get_full_name() or u.email,
            "email": u.email,
            "phone": u.phone,
            "event_count": int(u.event_count or 0),
            "last_rsvp_at": u.last_rsvp_at,
        }
        for u in qs
    ]
    return Response(out)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def creator_person_detail(request: Request, user_id: int) -> Response:
    """Full profile of one person + their RSVP history on the caller's
    events. Access-checked: must have at least one RSVP on an event
    in a workspace the caller owns."""
    from events.models import RSVP
    from workspaces.models import WorkspaceMember

    owned_ws_ids = list(
        WorkspaceMember.objects.filter(
            user=request.user, role=WorkspaceMember.ROLE_OWNER
        ).values_list("workspace_id", flat=True)
    )

    try:
        person = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    shared_rsvps = (
        RSVP.objects.filter(user=person, event__workspace_id__in=owned_ws_ids)
        .select_related("event", "event__workspace")
        .order_by("-created_at")
    )
    if not shared_rsvps.exists():
        # Not someone the caller has actually met.
        return Response(status=status.HTTP_404_NOT_FOUND)

    return Response(
        {
            "user_id": person.id,
            "first_name": person.first_name,
            "last_name": person.last_name,
            "full_name": person.get_full_name() or person.email,
            "email": person.email,
            "phone": person.phone,
            "address": {
                "street": person.address_street,
                "city": person.address_city,
                "zip": person.address_zip,
                "country": person.address_country,
                "legacy": person.address,
            },
            "emergency_contact": {
                "name": person.emergency_contact_name,
                "phone": person.emergency_contact_phone,
                "relationship": person.emergency_contact_relationship,
            },
            "events": [
                {
                    "workspace_slug": r.event.workspace.slug,
                    "event_slug": r.event.slug,
                    "event_title": r.event.title,
                    "event_starts_at": r.event.starts_at,
                    "rsvp_status": r.status,
                    "rsvp_created_at": r.created_at,
                }
                for r in shared_rsvps
            ],
        }
    )
