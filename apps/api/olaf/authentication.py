"""Project-wide DRF authentication classes."""
from __future__ import annotations

from rest_framework import exceptions
from rest_framework.authentication import (
    BaseAuthentication,
    SessionAuthentication,
    get_authorization_header,
)


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


class APITokenAuthentication(BaseAuthentication):
    """`Authorization: Bearer <token>` against accounts.APIToken.

    Sibling of SessionAuthenticationWith401 in the DRF auth stack —
    session auth handles the browser SPA, token auth handles external
    clients (the mountain-guide skill, CLI scripts, CI). Because this
    inherits from BaseAuthentication and not SessionAuthentication,
    DRF skips CSRF enforcement when a token authenticates the request,
    which is the desired behaviour for cross-origin server-to-server
    calls.

    The token row's last_used_at is bumped on every successful auth,
    debounced server-side to one write per minute.
    """

    keyword = "Bearer"

    def authenticate(self, request):
        auth = get_authorization_header(request).split()
        if not auth or auth[0].lower() != self.keyword.lower().encode():
            return None
        if len(auth) == 1:
            raise exceptions.AuthenticationFailed(
                "Invalid Authorization header. No token provided."
            )
        if len(auth) > 2:
            raise exceptions.AuthenticationFailed(
                "Invalid Authorization header. Token must not contain spaces."
            )
        try:
            key = auth[1].decode()
        except UnicodeError as exc:
            raise exceptions.AuthenticationFailed(
                "Invalid Authorization header. Token contains non-UTF-8 bytes."
            ) from exc
        return self._authenticate_credentials(key)

    def _authenticate_credentials(self, key: str):
        # Lazy import — this module is imported by settings.py via the
        # DEFAULT_AUTHENTICATION_CLASSES string path; importing models at
        # module top would trigger app-not-ready during Django bootstrap.
        from accounts.models import APIToken

        try:
            token = APIToken.objects.select_related("user").get(key=key)
        except APIToken.DoesNotExist as exc:
            raise exceptions.AuthenticationFailed("Invalid token.") from exc

        if not token.is_active:
            raise exceptions.AuthenticationFailed("Token has been revoked.")
        if not token.user.is_active:
            raise exceptions.AuthenticationFailed("User inactive or deleted.")

        token.touch()
        return (token.user, token)

    def authenticate_header(self, request) -> str:
        return self.keyword
