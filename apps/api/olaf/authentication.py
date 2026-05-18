"""Project-wide DRF authentication classes."""
from __future__ import annotations

from rest_framework.authentication import SessionAuthentication


class SessionAuthenticationWith401(SessionAuthentication):
    """SessionAuthentication that reports a WWW-Authenticate header.

    Without this, DRF rewrites 401 → 403 for anonymous users on
    session-only APIs (because the default SessionAuthentication doesn't
    declare any auth scheme). That collapses two different failure modes —
    "log in" and "you don't own this" — into the same status code, so the
    frontend can't route between /login and "permission denied" cleanly.

    We return a non-Basic scheme so browsers don't pop a native login
    dialog; the value is opaque to the SPA, only the 401 status matters.
    """

    def authenticate_header(self, request) -> str:
        return 'Session realm="api"'
