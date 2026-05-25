"""Shared transactional e-mail sender — multipart text + HTML.

Each call site renders both `.txt` (plain text fallback) and `.html`
templates from the same context and ships both. Clients that prefer
HTML get the branded version; clients that strip HTML (or users who
opt out) see clean plain text.

We standardise on `EmailMultiAlternatives` instead of `send_mail` so
the HTML alternative attaches cleanly. The plain text body is the
required `body=` arg; HTML is added as an alternative MIME part.
"""
from __future__ import annotations

from collections.abc import Iterable

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string


def send_branded_email(
    *,
    subject: str,
    template_base: str,
    context: dict,
    recipient_list: Iterable[str],
    reply_to: Iterable[str] | None = None,
    fail_silently: bool = False,
) -> int:
    """Render `<template_base>.txt` + `<template_base>.html` from a
    shared context and dispatch as multipart. Returns send count
    (0 nebo počet recipients).

    `template_base` is the path WITHOUT extension, e.g.
    `"emails/rsvp_confirmation"`.

    `reply_to` se hodí pro workspace broadcast e-maily — owner pošle
    bulk-e-mail svým členům a chce, aby odpovědi šly zpět jemu, ne
    na platform inbox.
    """
    site_url = getattr(settings, "FRONTEND_URL", "http://localhost:3000").rstrip("/")
    enriched_context = {
        **context,
        "site_url": site_url,
        # Brand logo URL — public-served PNG matching the in-app
        # icon. Override per-call when we ship a dedicated email-logo.
        "brand_logo_url": context.get("brand_logo_url") or f"{site_url}/icon-192.png",
    }

    text_body = render_to_string(f"{template_base}.txt", enriched_context)
    html_body = render_to_string(f"{template_base}.html", enriched_context)

    msg = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=list(recipient_list),
        reply_to=list(reply_to) if reply_to else None,
    )
    msg.attach_alternative(html_body, "text/html")
    return msg.send(fail_silently=fail_silently)
