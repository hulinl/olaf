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
    """Return the VAPID private key as a real PEM string.

    Container App secrets mangle multiline values (newlines stripped
    or escaped), so the canonical storage format is base64-encoded
    PEM as a single line. Handle the common shapes defensively.
    """
    raw = (settings.VAPID_PRIVATE_KEY or "").strip()
    if not raw:
        return ""
    _diag(f"raw len={len(raw)} starts={raw[:24]!r} ends={raw[-12:]!r}")
    if "\\n" in raw:
        decoded = raw.replace("\\n", "\n")
        _diag(f"restored \\n escapes → {len(decoded)} chars")
        return decoded
    if "BEGIN" in raw and "\n" in raw:
        _diag(f"PEM with newlines → {len(raw)} chars")
        return raw
    if "BEGIN" in raw and "\n" not in raw:
        # PEM with newlines stripped — reconstruct by re-inserting
        # newlines every 64 chars in the body.
        try:
            header = "-----BEGIN PRIVATE KEY-----"
            footer = "-----END PRIVATE KEY-----"
            body = raw.replace(header, "").replace(footer, "").strip()
            body = body.replace(" ", "")
            chunks = [body[i : i + 64] for i in range(0, len(body), 64)]
            rebuilt = "\n".join([header, *chunks, footer])
            _diag(f"rebuilt PEM from stripped form → {len(rebuilt)} chars")
            return rebuilt
        except Exception:
            logger.exception("VAPID key rebuild failed")
            return raw
    try:
        decoded = base64.b64decode(raw).decode("ascii")
        _diag(f"base64-decoded → {len(decoded)} chars")
        return decoded
    except Exception:
        logger.exception("VAPID key: all decode paths failed")
        return raw


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
