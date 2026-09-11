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


def send_finish_signup_email(user: User) -> None:
    """Nudge pro anon-RSVP usera co nikdy nedokončil signup. User má
    registraci na akci ale ještě si nevytvořil účet — link ho hodí na
    /signup s pre-fillovaným e-mailem. Bez tokenu, bez password reset
    flow. User request 2026-09-11 — 2. vlna „stuck users"."""
    signup_link = _frontend_url(
        f"/signup?email={user.email}"
    )
    send_branded_email(
        subject="Dokončíš registraci na olaf?",
        template_base="emails/finish_signup",
        context={
            "user": user,
            "link": signup_link,
        },
        recipient_list=[user.email],
        fail_silently=True,
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
