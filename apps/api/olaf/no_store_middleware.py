"""Force `Cache-Control: no-store` on every /api/* response.

User-reported bug (2026-05-21): saved profile changes via mobile,
refreshed, changes appeared gone. Web showed the new data correctly.
The cause is iOS Safari's HTTP heuristic cache — without an explicit
Cache-Control header, Safari caches authenticated GETs by URL and
serves the stale body across page refreshes, even though the
underlying API call would return fresh data.

`Cache-Control: no-store, private` tells every HTTP cache (browser,
proxy, future CDN) that the response is per-request and must not be
stored. We scope to /api/* so the static frontend (served by SWA)
keeps its own cache headers for HTML/JS/CSS.
"""
from __future__ import annotations


class NoStoreApiMiddleware:
    def __init__(self, get_response) -> None:
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        # `/api/public/` = veřejné read-only API pro externí konzumenty
        # (olafadventures.cz). Ty naopak potřebují cache-friendly
        # hlavičky (public, max-age=60) — view si je nastavil přes
        # `@cache_control`, nechme je projít. User request 2026-09-11.
        if request.path.startswith("/api/") and not request.path.startswith(
            "/api/public/"
        ):
            # `private` reinforces that intermediate caches must not
            # store this; `no-store` is the strong signal that even
            # the browser cache must not retain it.
            response["Cache-Control"] = "no-store, private"
        return response
