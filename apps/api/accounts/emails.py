from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string

from .models import EmailVerificationToken, PasswordResetToken, User


def _frontend_url(path: str) -> str:
    base = getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")
    return f"{base}{path}"


def send_verification_email(user: User, token: EmailVerificationToken) -> None:
    link = _frontend_url(f"/verify-email/{token.token}")
    body = render_to_string(
        "emails/verify_email.txt",
        {"user": user, "link": link, "expires_hours": 24},
    )
    send_mail(
        subject="Verify your OLAF account",
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )


def send_password_reset_email(user: User, token: PasswordResetToken) -> None:
    link = _frontend_url(f"/reset-password/{token.token}")
    body = render_to_string(
        "emails/password_reset.txt",
        {"user": user, "link": link, "expires_hours": 1},
    )
    send_mail(
        subject="Reset your OLAF password",
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )
