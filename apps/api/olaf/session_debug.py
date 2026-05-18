"""Temporary session-lifecycle debug middleware.

Logs the session_key + user_id observed on each request. Used to find where
sessions are getting silently invalidated during development. Safe to leave
in DEBUG-only; remove once the silent-logout bug is closed.
"""
from __future__ import annotations

import logging

from django.conf import settings

logger = logging.getLogger("session.debug")


class SessionDebugMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not settings.DEBUG:
            return self.get_response(request)

        incoming_sid = request.COOKIES.get("sessionid", "<none>")
        path = request.path

        response = self.get_response(request)

        # request.user is set by AuthenticationMiddleware; safe after view ran.
        user = getattr(request, "user", None)
        uid = getattr(user, "id", None) if user and user.is_authenticated else None

        session_key = (
            request.session.session_key
            if hasattr(request, "session") and request.session.session_key
            else "<none>"
        )

        # Did the response rewrite the sessionid cookie?
        outgoing_cookie = response.cookies.get("sessionid")
        cookie_action = "—"
        if outgoing_cookie is not None:
            val = outgoing_cookie.value
            max_age = outgoing_cookie.get("max-age", "")
            if val == "":
                cookie_action = "DELETE"
            elif val != incoming_sid[: len(val)]:
                cookie_action = f"SET={val[:8]}.. max-age={max_age}"
            else:
                cookie_action = f"REFRESH max-age={max_age}"

        if path.startswith("/api/"):
            logger.warning(
                "%s in=%s session=%s uid=%s out=%s status=%s",
                path,
                incoming_sid[:8] + "..." if incoming_sid != "<none>" else "<none>",
                session_key[:8] + "..." if session_key != "<none>" else "<none>",
                uid,
                cookie_action,
                response.status_code,
            )

        return response
