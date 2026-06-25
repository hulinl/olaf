"""Signi.cz API client wrapper.

Signi.cz je český e-signature service, podobně jako DocuSign ale
levnější + lokální. API auth přes Bearer token (per-workspace
nastavený přes Signi.cz dashboard, owner ho vloží do
`/admin/integrace`).

Tahle vrstva drží surovou komunikaci se Signi API. Vyšší vrstva
(views/services) ji volá a překládá si stavy do našich
`RSVPContract.STATUS_*`.

API surface (V1):
- POST /documents — upload PDF + signer info → vrací document_id + signing_url
- GET /documents/<id> — fetch status (signed/pending/rejected/expired)
- POST webhook handler — Signi posílá změny na náš endpoint

V dev/test módu (bez SIGNY_API_BASE env) vrací mock data, takže
integrace nezpadne — místo HTTP request se ihned vrátí
`pending` document s mock URL. Real Signi.cz key se nastavuje
v prod env.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass

import requests

logger = logging.getLogger(__name__)


SIGNY_API_BASE = os.environ.get("SIGNY_API_BASE", "")
SIGNY_API_TOKEN = os.environ.get("SIGNY_API_TOKEN", "")
SIGNY_REQUEST_TIMEOUT_SECONDS = 30


@dataclass
class SignyDocument:
    document_id: str
    signing_url: str
    status: str  # pending | sent | signed | rejected | expired


def is_configured() -> bool:
    """True iff env hodnoty pro Signi jsou nastavené.

    Bez nich client vrací mock data — UI ukazuje banner „Pro reálné
    podepisování nastav Signi API token v sekci Integrace".
    """
    return bool(SIGNY_API_BASE and SIGNY_API_TOKEN)


def send_for_signing(
    *,
    pdf_bytes: bytes,
    pdf_filename: str,
    signer_name: str,
    signer_email: str,
    document_title: str,
    callback_url: str | None = None,
) -> SignyDocument:
    """Pošle PDF na Signi k podpisu. Vrací document_id + signing_url.

    Signi.cz pošle účastníkovi e-mail s podpisovým linkem. Owner
    dostane signing_url do svého RSVPContract pro případ že by
    chtěl link poslat sám / přeposlat.
    """
    if not is_configured():
        # Mock pro dev/test — nikam nevoláme.
        logger.info("Signi not configured, returning mock document.")
        return SignyDocument(
            document_id=f"mock-{signer_email}",
            signing_url=f"https://signi.cz/mock/{signer_email}",
            status="sent",
        )

    files = {
        "document": (pdf_filename, pdf_bytes, "application/pdf"),
    }
    data = {
        "title": document_title,
        "signer_name": signer_name,
        "signer_email": signer_email,
    }
    if callback_url:
        data["callback_url"] = callback_url

    response = requests.post(
        f"{SIGNY_API_BASE}/documents",
        headers={"Authorization": f"Bearer {SIGNY_API_TOKEN}"},
        files=files,
        data=data,
        timeout=SIGNY_REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    payload = response.json()
    return SignyDocument(
        document_id=str(payload.get("id") or payload.get("document_id") or ""),
        signing_url=str(payload.get("signing_url") or payload.get("url") or ""),
        status=str(payload.get("status") or "sent"),
    )


def fetch_status(document_id: str) -> SignyDocument | None:
    """Aktuální stav dokumentu — voláme když chce owner ručně
    refresh-nout status (webhook by měl dorazit automaticky).
    """
    if not is_configured():
        return None
    response = requests.get(
        f"{SIGNY_API_BASE}/documents/{document_id}",
        headers={"Authorization": f"Bearer {SIGNY_API_TOKEN}"},
        timeout=SIGNY_REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    payload = response.json()
    return SignyDocument(
        document_id=str(payload.get("id") or document_id),
        signing_url=str(payload.get("signing_url") or ""),
        status=str(payload.get("status") or "pending"),
    )


def download_signed_pdf(document_id: str) -> bytes | None:
    """Stáhne podepsaný PDF ze Signi. Volá se po webhook eventu
    `signed`.
    """
    if not is_configured():
        return None
    response = requests.get(
        f"{SIGNY_API_BASE}/documents/{document_id}/signed.pdf",
        headers={"Authorization": f"Bearer {SIGNY_API_TOKEN}"},
        timeout=SIGNY_REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.content
