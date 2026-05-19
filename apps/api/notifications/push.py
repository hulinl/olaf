"""Web Push notifications via pywebpush.

`send_push_to_user` fans out one logical notification to every
PushSubscription a user has registered (one per device/browser).
Dead endpoints (410 from the push service) are auto-deleted so the
list stays clean.

Empty VAPID config = push silently disabled, so local dev without
keys configured still works (just no push delivered).
"""
from __future__ import annotations

import base64
import json
import logging
from collections.abc import Iterable

from django.conf import settings
from pywebpush import WebPushException, webpush

logger = logging.getLogger("notifications.push")


def _diag(msg: str) -> None:
    # print() to stdout so Container App logs capture it without
    # needing the LOGGING config to wire notifications.push.
    print(f"[vapid] {msg}", flush=True)


def _vapid_private_key() -> str:
    """Return the VAPID private key as what pywebpush expects.

    pywebpush hands the value directly to py_vapid.Vapid.from_string,
    which despite its name DOES NOT accept a wrapped PEM — it expects
    just the base64 body (no -----BEGIN/END----- banners, no newlines).
    Container App secrets also mangle multiline values, so we
    normalize multiple shapes into the single canonical form:

        raw base64 of the DER-encoded PKCS8 key, all one line.
    """
    raw = (settings.VAPID_PRIVATE_KEY or "").strip()
    if not raw:
        return ""

    # If the value is base64-encoded PEM (our prod storage format),
    # decode it first to get back the PEM text.
    if "BEGIN" not in raw and "\\n" not in raw:
        try:
            decoded = base64.b64decode(raw).decode("ascii")
            if "BEGIN" in decoded:
                raw = decoded
        except Exception:
            pass

    # Restore literal \\n escapes if they slipped in.
    if "\\n" in raw:
        raw = raw.replace("\\n", "\n")

    # Strip PEM banners and whitespace → just the base64 body.
    if "BEGIN" in raw:
        body_lines = [
            line.strip()
            for line in raw.splitlines()
            if line.strip() and not line.lstrip().startswith("-----")
        ]
        body = "".join(body_lines)
    else:
        # Already raw base64 body.
        body = raw.replace("\n", "").replace(" ", "")

    # py-vapid's from_string uses urlsafe_b64decode, which only accepts
    # the `-_` alphabet — standard base64 from PEMs uses `+/`. Translate.
    return body.replace("+", "-").replace("/", "_")


def _vapid_configured() -> bool:
    return bool(_vapid_private_key()) and bool(settings.VAPID_PUBLIC_KEY)


def _send_one(subscription, payload: dict) -> bool:
    """Send one push to one subscription. Returns True on success.

    On 404 / 410 the subscription is dead (browser uninstalled, user
    revoked permission); we delete it so the next fan-out is leaner.
    """
    try:
        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {
                    "p256dh": subscription.p256dh,
                    "auth": subscription.auth,
                },
            },
            data=json.dumps(payload),
            vapid_private_key=_vapid_private_key(),
            vapid_claims={"sub": settings.VAPID_SUBJECT},
        )
        return True
    except WebPushException as exc:
        # Most-common cleanup case: push service told us the endpoint
        # is gone. Anything in 4xx that isn't 429 is "stop trying".
        status = getattr(exc.response, "status_code", None)
        if status in (404, 410):
            subscription.delete()
            return False
        logger.warning(
            "Web push failed for sub=%s status=%s detail=%s",
            subscription.pk,
            status,
            exc,
        )
        return False
    except Exception:
        logger.exception("Unexpected Web Push error for sub=%s", subscription.pk)
        return False


def send_push_to_user(
    user,
    *,
    title: str,
    body: str,
    url: str = "/",
    tag: str | None = None,
) -> int:
    """Deliver one notification to every device this user has
    registered. Returns the count of successful sends.
    """
    if not _vapid_configured():
        return 0
    from accounts.models import PushSubscription

    subs: Iterable[PushSubscription] = user.push_subscriptions.all()
    payload = {"title": title, "body": body, "url": url}
    if tag:
        payload["tag"] = tag
    sent = 0
    for s in subs:
        if _send_one(s, payload):
            sent += 1
    return sent
