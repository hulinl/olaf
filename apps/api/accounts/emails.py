from django.conf import settings

from notifications.email_sender import send_branded_email

from .models import EmailVerificationToken, PasswordResetToken, User


def _frontend_url(path: str) -> str:
    base = getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")
    return f"{base}{path}"


def send_verification_email(user: User, token: EmailVerificationToken) -> None:
    send_branded_email(
        subject="Potvrď svůj olaf účet",
        template_base="emails/verify_email",
        context={
            "user": user,
            "link": _frontend_url(f"/verify-email/{token.token}"),
            "expires_hours": 24,
        },
        recipient_list=[user.email],
    )


def send_password_reset_email(user: User, token: PasswordResetToken) -> None:
    send_branded_email(
        subject="Obnovení hesla — olaf",
        template_base="emails/password_reset",
        context={
            "user": user,
            "link": _frontend_url(f"/reset-password/{token.token}"),
            "expires_hours": 1,
        },
        recipient_list=[user.email],
    )
