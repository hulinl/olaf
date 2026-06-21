#!/usr/bin/env python3
"""Push a markdown event spec to the OLAF import endpoint.

Designed to be invoked from the `olaf-publish` Claude Code skill in
the mountain-guide project. Can also be run by hand:

    python publish.py events/beskydy-spring-camp.md

The script does the *transport* — loading env, packing the payload,
POSTing, handling errors. The actual markdown → JSON translation
happens upstream (either the skill prepares the JSON and passes it
via --payload, or you wire in your own conversion).

Env vars (loaded from .env in the script's CWD):
    OLAF_API_TOKEN          required — personal access token from
                            OLAF /settings/integrations/
    OLAF_BASE_URL           default https://olaf.events
    OLAF_WORKSPACE_SLUG     required — workspace to import into
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request


def _load_dotenv(path: pathlib.Path = pathlib.Path(".env")) -> None:
    """Minimal .env loader — no python-dotenv dependency.

    Lines like KEY=value, ignoring blanks + comments. Existing
    environment variables win (so a shell override beats the file).
    """
    if not path.exists():
        return
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def _die(message: str, code: int = 1) -> None:
    print(f"error: {message}", file=sys.stderr)
    sys.exit(code)


def _request(method: str, url: str, *, token: str, body: dict | None = None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode() or "null")
    except urllib.error.HTTPError as exc:
        try:
            payload = json.loads(exc.read().decode() or "null")
        except Exception:
            payload = None
        return exc.code, payload


def fetch_schema(base_url: str, token: str) -> dict:
    """GET /api/events/import-schema/ — public but takes the token
    anyway so we exercise the same code path in dev + prod."""
    code, body = _request(
        "GET", f"{base_url}/api/events/import-schema/", token=token
    )
    if code != 200:
        _die(f"schema fetch failed: HTTP {code} — {body}")
    return body


def push_payload(
    base_url: str,
    workspace: str,
    token: str,
    payload: dict,
) -> dict:
    """POST the payload to /api/events/<ws>/import/. Returns the
    response body (event_id, edit_url, ...). Exits on failure."""
    url = f"{base_url}/api/events/{workspace}/import/"
    code, body = _request("POST", url, token=token, body=payload)
    if code in (200, 201):
        return body
    if code == 401:
        _die("401 — token chybí, je revokovaný nebo neplatný.")
    if code == 403:
        _die(
            f"403 — token patří uživateli, který není owner workspacu "
            f"'{workspace}'."
        )
    if code == 404:
        _die(f"404 — workspace '{workspace}' v OLAFu neexistuje.")
    if code == 400:
        _die(f"400 — payload odmítnut: {json.dumps(body, indent=2)}")
    _die(f"unexpected HTTP {code}: {body}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "spec",
        nargs="?",
        help="Path to the JSON payload file (already built by the skill).",
    )
    parser.add_argument(
        "--payload",
        help="Inline JSON payload as a string (alternative to --spec).",
    )
    parser.add_argument(
        "--print-schema",
        action="store_true",
        help="Print the live import schema and exit.",
    )
    args = parser.parse_args(argv)

    _load_dotenv()
    token = os.environ.get("OLAF_API_TOKEN") or ""
    base_url = os.environ.get("OLAF_BASE_URL", "https://olaf.events").rstrip("/")
    workspace = os.environ.get("OLAF_WORKSPACE_SLUG") or ""

    if not token:
        _die("OLAF_API_TOKEN není nastavený (zkontroluj .env).")
    if args.print_schema:
        schema = fetch_schema(base_url, token)
        print(json.dumps(schema, indent=2, ensure_ascii=False))
        return 0

    if not workspace:
        _die("OLAF_WORKSPACE_SLUG není nastavený (zkontroluj .env).")

    if args.payload:
        try:
            payload = json.loads(args.payload)
        except json.JSONDecodeError as exc:
            _die(f"--payload není validní JSON: {exc}")
    elif args.spec:
        path = pathlib.Path(args.spec)
        if not path.exists():
            _die(f"spec soubor '{path}' neexistuje.")
        try:
            payload = json.loads(path.read_text())
        except json.JSONDecodeError as exc:
            _die(f"spec soubor není validní JSON: {exc}")
    else:
        _die("uveď cestu k JSON payloadu nebo --payload '<json>'.")

    result = push_payload(base_url, workspace, token, payload)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
