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


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request: Request) -> Response:
    """Return the current authenticated user."""
    return Response(UserSerializer(request.user).data)


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
