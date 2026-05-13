"""Tenant resolver middleware.

Looks for a workspace slug in the URL path and attaches the corresponding
Workspace instance to `request.workspace`. Views can also explicitly load
the workspace by slug; this is a convenience for templated routes and
cross-cutting permission checks.
"""
from __future__ import annotations

import re
from collections.abc import Callable

from django.http import HttpRequest, HttpResponse

# Matches /<slug>/ or /<slug>/<rest>... so we extract the leading segment.
# The leading segment must look like a slug per validators.SLUG_RE.
_PATH_SLUG_RE = re.compile(r"^/([a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?)(?:/|$)")

# Paths whose leading segment is *not* a workspace slug.
_NON_TENANT_PREFIXES = (
    "/admin",
    "/api",
    "/media",
    "/static",
    "/health",
)


class TenantResolverMiddleware:
    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        request.workspace = self._resolve(request)
        return self.get_response(request)

    def _resolve(self, request: HttpRequest):
        path = request.path or ""
        if any(path.startswith(p) for p in _NON_TENANT_PREFIXES):
            return None
        match = _PATH_SLUG_RE.match(path)
        if not match:
            return None

        # Local import avoids AppRegistryNotReady at startup.
        from .models import Workspace

        slug = match.group(1)
        try:
            return Workspace.objects.get(slug=slug)
        except Workspace.DoesNotExist:
            return None
