from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from rest_framework import status
from rest_framework.decorators import (
    api_view,
    parser_classes,
    permission_classes,
    throttle_classes,
)
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from .emails import send_password_reset_email, send_verification_email
from .models import (
    EmailVerificationToken,
    OwnerHiddenPerson,
    PasswordResetToken,
    User,
)
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
    """Create a new user. Sends an email verification link. PRD §4.1.

    Take-over flow pro guest RSVP: pokud už existuje neverifikovaný User
    s tímhle e-mailem (= dříve submitl anon RSVP formulář), nezakládáme
    duplikát — převezmeme jeho row, nastavíme heslo + nové name/phone,
    pošleme verification e-mail. Všechny RSVPs co k tomu e-mailu od
    minula sedí (přivázané FK), zůstávají u něj.
    """
    serializer = SignupSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    existing = User.objects.filter(email=data["email"]).first()
    if existing is not None and not existing.email_verified:
        existing.set_password(data["password"])
        existing.first_name = data["first_name"]
        existing.last_name = data["last_name"]
        if data.get("phone"):
            existing.phone = data["phone"]
        existing.save(
            update_fields=["password", "first_name", "last_name", "phone"]
        )
        user = existing
    else:
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
        return Response(UserSerializer(request.user, context={"request": request}).data)

    serializer = UserSerializer(
        request.user,
        data=request.data,
        partial=True,
        context={"request": request},
    )
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


# Max 8 MB per upload — kromě toho image_utils.downscale_upload resampluje
# velké JPEGy z mobilu na rozumnou velikost, takže DB ani Azure Blob
# nedostanou 12 MP fotku v plné velikosti.
USER_AVATAR_MAX_BYTES = 8 * 1024 * 1024


@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def me_avatar(request: Request) -> Response:
    """Upload / delete vlastní profilové fotky.

    Stejný pattern jako workspace_logo — multipart POST s polem `avatar`
    (nebo `image`), v `image_utils.downscale_upload` se ořeže na rozumnou
    velikost a uloží přes django-storages (FS dev / Azure Blob prod).
    DELETE smaže soubor + vyprázdní field. Vrací aktuální UserSerializer.
    """
    user = request.user

    if request.method == "DELETE":
        if user.avatar:
            user.avatar.delete(save=False)
            user.avatar = None
            user.save(update_fields=["avatar"])
        return Response(UserSerializer(user, context={"request": request}).data)

    upload = request.FILES.get("avatar") or request.FILES.get("image")
    if not upload:
        return Response(
            {"detail": "Soubor je povinný."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if upload.size > USER_AVATAR_MAX_BYTES:
        mb = USER_AVATAR_MAX_BYTES // (1024 * 1024)
        return Response(
            {"detail": f"Obrázek je moc velký — maximum je {mb} MB."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    from events.image_utils import UnsupportedImageError, downscale_upload

    try:
        processed = downscale_upload(upload)
    except UnsupportedImageError as exc:
        return Response(
            {"detail": str(exc)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if user.avatar:
        user.avatar.delete(save=False)
    user.avatar = processed
    user.save(update_fields=["avatar"])
    return Response(UserSerializer(user, context={"request": request}).data)


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
# Third-party integrations — user-scoped tokens for fetching content
# from Notion / future OAuth providers. Token is stored encrypted; the
# raw value never crosses back to the frontend.
# ---------------------------------------------------------------------------


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def notion_integration(request: Request) -> Response:
    """Manage the calling user's Notion integration token.

    GET → { connected: bool }
    PUT { token } → store the encrypted token, returns { connected: true }
    DELETE → wipe the token, returns { connected: false }

    The token itself is never echoed back. Frontend only ever learns
    whether the integration is set up.
    """
    from .integrations import encrypt_token

    user = request.user

    if request.method == "GET":
        return Response(
            {"connected": bool(user.notion_integration_token_encrypted)}
        )

    if request.method == "DELETE":
        user.notion_integration_token_encrypted = ""
        user.save(update_fields=["notion_integration_token_encrypted"])
        return Response({"connected": False})

    # PUT
    raw = (request.data.get("token") or "").strip()
    if not raw:
        return Response(
            {"token": "Token nesmí být prázdný."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    # Notion internal-integration tokens are `secret_…` prefixed and
    # at least ~50 chars. Cheap shape check so we don't accept obvious
    # nonsense and have to find out at API-call time.
    if not raw.startswith(("secret_", "ntn_")) or len(raw) < 40:
        return Response(
            {
                "token": (
                    "Tohle nevypadá jako platný Notion integration token "
                    "(očekáváme prefix `secret_` nebo `ntn_`). Vygeneruj "
                    "ho v notion.so/profile/integrations."
                ),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    user.notion_integration_token_encrypted = encrypt_token(raw)
    user.save(update_fields=["notion_integration_token_encrypted"])
    return Response({"connected": True})


@api_view(["GET", "PUT", "DELETE"])
@permission_classes([IsAuthenticated])
def anthropic_integration(request: Request) -> Response:
    """Manage the calling user's Anthropic API key.

    Per-user so each creator's LLM calls go on their own bill. Same
    contract as the Notion endpoint:
      GET → { connected }
      PUT { token } → { connected: true }
      DELETE → { connected: false }
    The raw key is never echoed back to the client.
    """
    from .integrations import encrypt_token

    user = request.user

    if request.method == "GET":
        return Response({"connected": bool(user.anthropic_api_key_encrypted)})

    if request.method == "DELETE":
        user.anthropic_api_key_encrypted = ""
        user.save(update_fields=["anthropic_api_key_encrypted"])
        return Response({"connected": False})

    raw = (request.data.get("token") or "").strip()
    if not raw:
        return Response(
            {"token": "API key nesmí být prázdný."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if not raw.startswith("sk-ant-") or len(raw) < 40:
        return Response(
            {
                "token": (
                    "Tohle nevypadá jako platný Anthropic API key "
                    "(očekáváme prefix `sk-ant-`). Vygeneruj ho v "
                    "console.anthropic.com → API Keys → Create."
                ),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    user.anthropic_api_key_encrypted = encrypt_token(raw)
    user.save(update_fields=["anthropic_api_key_encrypted"])
    return Response({"connected": True})


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
    # Owner can hide individual people from their Lidé view via the
    # /people/<uid>/hide/ endpoint. We exclude those here. The hidden
    # list is surfaced separately via /people/hidden/ for restore.
    hidden_ids = OwnerHiddenPerson.objects.filter(
        owner=request.user
    ).values_list("target_id", flat=True)
    qs = (
        User.objects.filter(scope)
        .exclude(id__in=hidden_ids)
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
    # V2 — also surface this person's memberships in the caller's
    # workspaces, so the Lidé dialog can show per-workspace role +
    # remove button. Include removed members so the owner sees a
    # complete picture.
    memberships = (
        WorkspaceMember.objects.filter(
            user=person, workspace_id__in=owned_ws_ids
        )
        .select_related("workspace")
        .order_by("workspace__name")
    )

    # Access check: caller must have either an RSVP OR a membership
    # row for this person in one of their workspaces.
    if not shared_rsvps.exists() and not memberships.exists():
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
            "memberships": [
                {
                    "workspace_slug": m.workspace.slug,
                    "workspace_name": m.workspace.name,
                    "role": m.role,
                    "status": m.status,
                    "joined_at": m.joined_at,
                }
                for m in memberships
            ],
        }
    )


@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated])
def creator_person_hide(request: Request, user_id: int) -> Response:
    """Hide / unhide a person from the caller's Lidé view.

    POST → upsert OwnerHiddenPerson(owner=caller, target=user_id).
    DELETE → remove that row (restore visibility).

    Idempotent both directions. We don't access-check beyond "user_id
    refers to a real User" — hiding someone you've never seen is
    harmless and might prevent them from appearing later if they
    register for one of your events. (Think of it as a permanent
    block on your own Lidé view.)
    """
    try:
        target = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if target.id == request.user.id:
        return Response(
            {"detail": "Sebe nemůžeš skrýt — Lidé tě stejně neukazují."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if request.method == "POST":
        OwnerHiddenPerson.objects.get_or_create(
            owner=request.user, target=target
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    # DELETE — unhide
    OwnerHiddenPerson.objects.filter(
        owner=request.user, target=target
    ).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def creator_person_purge(request: Request, user_id: int) -> Response:
    """Permanently scrub this person from the caller's Olaf universe.

    Heavier hammer than hide(): removes every caller-scoped trace of
    the target so they can't pop back into Lidé via a stray RSVP. The
    target's User account itself stays intact — they may be active in
    other creators' workspaces, and we're not in the business of
    deleting accounts we don't own.

    Cascades, all scoped to caller-owned workspaces:
      - cancel non-cancelled RSVPs on caller's events (status → cancelled,
        cancellation_reason='owner_purge'). Past RSVPs / payments stay
        for audit but the row no longer counts as "active".
      - delete PersonProfile rows (notes + tag links the caller wrote).
      - delete WorkspaceMember rows of any status (member of caller's
        workspace? gone).
      - delete the OwnerHiddenPerson row (no longer needed — they
        won't re-appear in creator_people without RSVPs).

    Returns 204 on success. Idempotent — re-running yields a clean 204
    even if there's nothing left to delete. Owner can't purge
    themselves.
    """
    from django.db import transaction

    from events.models import RSVP
    from workspaces.models import PersonProfile, WorkspaceMember

    try:
        target = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)

    if target.id == request.user.id:
        return Response(
            {"detail": "Sebe nemůžeš trvale odstranit."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    owned_ws_ids = list(
        WorkspaceMember.objects.filter(
            user=request.user, role=WorkspaceMember.ROLE_OWNER
        ).values_list("workspace_id", flat=True)
    )

    with transaction.atomic():
        # 1. Cancel target's non-cancelled RSVPs on caller's events.
        active_rsvps = RSVP.objects.filter(
            user=target, event__workspace_id__in=owned_ws_ids
        ).exclude(status=RSVP.STATUS_CANCELLED)
        for rsvp in active_rsvps:
            rsvp.cancel(reason=RSVP.CANCELLATION_OWNER)

        # 2. Drop CRM annotations (notes + tag links) the caller wrote.
        PersonProfile.objects.filter(
            user=target, workspace_id__in=owned_ws_ids
        ).delete()

        # 3. Drop membership rows in caller's workspaces.
        WorkspaceMember.objects.filter(
            user=target,
            workspace_id__in=owned_ws_ids,
        ).exclude(
            # Never auto-purge an admin/owner — guards against an
            # accidental nuke of an explicit role. If user wants to
            # remove an admin, they go through demote → remove flow.
            role__in=[WorkspaceMember.ROLE_ADMIN, WorkspaceMember.ROLE_OWNER]
        ).delete()

        # 4. Drop the hidden marker — they won't show up in
        # creator_people anyway (RSVPs cancelled + membership gone).
        OwnerHiddenPerson.objects.filter(
            owner=request.user, target=target
        ).delete()

    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def creator_hidden_people(request: Request) -> Response:
    """List people the caller has hidden from their Lidé view.

    Surfaced as a collapsible "Skrytí lidé (N)" section in the UI with
    a per-row "Vrátit" button. Slim payload — full detail still goes
    through /people/<uid>/.
    """
    rows = (
        OwnerHiddenPerson.objects.filter(owner=request.user)
        .select_related("target")
        .order_by("-hidden_at")
    )
    return Response(
        [
            {
                "user_id": h.target.id,
                "full_name": h.target.get_full_name() or h.target.email,
                "email": h.target.email,
                "hidden_at": h.hidden_at,
            }
            for h in rows
        ]
    )


# ---------------------------------------------------------------------------
# Personal access tokens — used by external clients (mountain-guide skill,
# CLI scripts) to call the JSON API with `Authorization: Bearer <token>`.
# ---------------------------------------------------------------------------


def _serialize_api_token(token, *, include_key: bool = False) -> dict:
    """Token metadata for the settings UI. Plaintext key is included
    exactly once on creation; subsequent GETs never expose it (only
    prefix for identification)."""
    data = {
        "id": token.id,
        "label": token.label,
        "prefix": token.prefix,
        "created_at": token.created_at,
        "last_used_at": token.last_used_at,
        "revoked_at": token.revoked_at,
        "is_active": token.is_active,
    }
    if include_key:
        data["key"] = token.key
    return data


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def api_tokens(request: Request) -> Response:
    """List the current user's API tokens (GET) or issue a new one (POST).

    POST body: {"label": "mountain-guide laptop"} — short nickname so
    the user can tell tokens apart in /settings/integrations/.
    Response includes the plaintext key once; afterwards GET only
    returns the prefix.
    """
    from .models import APIToken

    if request.method == "GET":
        qs = APIToken.objects.filter(user=request.user)
        return Response([_serialize_api_token(t) for t in qs])

    label = (request.data.get("label") or "").strip()
    if not label:
        return Response(
            {"label": "Vyplň prosím název tokenu."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if len(label) > 80:
        return Response(
            {"label": "Název je moc dlouhý (max 80 znaků)."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    token = APIToken.objects.create(user=request.user, label=label)
    return Response(
        _serialize_api_token(token, include_key=True),
        status=status.HTTP_201_CREATED,
    )


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def api_token_detail(request: Request, token_id: int) -> Response:
    """Revoke a token. Soft delete — sets revoked_at so the audit
    trail of which tokens existed survives, but the token stops
    authenticating immediately."""
    from .models import APIToken

    try:
        token = APIToken.objects.get(pk=token_id, user=request.user)
    except APIToken.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    token.revoke()
    return Response(status=status.HTTP_204_NO_CONTENT)
