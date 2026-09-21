"""Guest ("light") user helper — sdílený mezi RSVP a community join.

Vytvoří nebo reuse-ne User row s `email_verified=False` a unusable
password. Anon submitter tak může projít public flow (RSVP, žádost o
vstup do komunity) bez toho, aby si předem zakládal účet — a když
později projde /signup s tím samým e-mailem, endpoint signup detekuje
existující unverified row a převezme ho (nastaví heslo, pošle
ověřovací mail).

Když e-mail patří **verified** účtu, funkce hází
`ExistingVerifiedUserError`. Volající view pak vrátí 409
`code=email_has_account`, aby frontend zobrazil "Přihlas se" prompt —
anon submitter nesmí přepsat cizí session ani modifikovat cizí data.
"""
from __future__ import annotations

from .models import User


class ExistingVerifiedUserError(Exception):
    """E-mail už patří plnohodnotnému (verified) účtu."""


def create_light_user(account_payload: dict) -> User | None:
    """Najít nebo vytvořit guest usera.

    Vrací `None` když v payloadu chybí povinné údaje (email, first_name,
    last_name). Hází `ExistingVerifiedUserError` když e-mail patří
    verified účtu — v tom případě volající view musí vrátit 409, ne
    vytvořit nic.
    """
    email = (account_payload.get("email") or "").strip().lower()
    first_name = (account_payload.get("first_name") or "").strip()
    last_name = (account_payload.get("last_name") or "").strip()
    phone = (account_payload.get("phone") or "").strip()

    if not (email and first_name and last_name):
        return None

    try:
        existing = User.objects.get(email=email)
    except User.DoesNotExist:
        existing = None

    if existing is not None:
        if existing.email_verified:
            raise ExistingVerifiedUserError()
        updates: list[str] = []
        if phone and not existing.phone:
            existing.phone = phone
            updates.append("phone")
        if first_name and not existing.first_name:
            existing.first_name = first_name
            updates.append("first_name")
        if last_name and not existing.last_name:
            existing.last_name = last_name
            updates.append("last_name")
        if updates:
            existing.save(update_fields=updates)
        return existing

    user = User.objects.create(
        email=email,
        first_name=first_name,
        last_name=last_name,
        phone=phone,
        email_verified=False,
    )
    user.set_unusable_password()
    user.save(update_fields=["password"])
    return user
