"""Image-upload helpers shared across event covers, gallery, and
workspace logos / covers. Phones upload 3-5 MB JPEGs at 4000+ px —
unprocessed those make page loads sluggish, especially on mobile.
We downscale to 1600 px on the long side + re-encode JPEG at q82
before persisting. Result: 200-400 KB per image without visible
loss on a phone screen."""
from __future__ import annotations

import io
import logging

from django.core.files.uploadedfile import InMemoryUploadedFile

logger = logging.getLogger(__name__)


# Register HEIF/HEIC opener with Pillow at import time. Without it
# Image.open() na .heic z iPhonu hodí UnidentifiedImageError,
# downscale fallback uloží raw HEIC, a browser ho nevykreslí.
# pillow-heif je čistě C wrapper kolem libheif — žádný Django side
# effect.
try:
    from pillow_heif import register_heif_opener

    register_heif_opener()
except ImportError:
    # pillow-heif neinstalován (dev image bez extras / CI bez deps) —
    # gallery + cover prostě nevezme HEIC, vrátí 400 s clear errorem.
    logger.warning("pillow-heif not available; HEIC uploads will be rejected")


class UnsupportedImageError(Exception):
    """Raised when Pillow can't open the upload — unsupported format
    (e.g. WebP variant, AVIF without plugin, corrupt JPEG header,
    non-image file uploaded as image). Views catch this and surface
    a 400 with a Czech hint, místo aby tiše uložily nečitelný soubor."""


def _detect_alpha(img) -> bool:
    """True když má obrázek reálně průhledné pixely (ne jen alpha kanál).

    Rozdíl: `mode='RGBA'` říká, že alpha kanál existuje, ale všechny
    pixely můžou mít alpha=255 (plně kryté). Zajímá nás jen skutečná
    transparency — kdyby ne, drop alpha na RGB je bez ztráty.
    """
    if img.mode not in ("RGBA", "LA", "PA"):
        # P-mode s "transparency" v info je taky transparent (palette
        # s index-based průhledností — typicky GIF).
        return img.mode == "P" and "transparency" in img.info
    alpha = img.split()[-1]
    return alpha.getextrema()[0] < 255


def downscale_upload(
    upload,
    *,
    max_dim: int = 1600,
    quality: int = 82,
    preserve_alpha: bool = False,
):
    """Return a Django InMemoryUploadedFile, downscaled + re-encoded.

    Default: JPEG output. Když `preserve_alpha=True` a input má
    skutečně průhledné pixely (viz `_detect_alpha`), zachováváme PNG
    (s alpha) — použito pro workspace logo, aby transparent kruh /
    ikona nedostala fake bílé/černé pozadí.

    Když má input alpha ale `preserve_alpha=False` (nebo je RGB), pixely
    přes alpha=0 dostanou bílý composite — jinak by `convert("RGB")`
    nechalo RGB=(0,0,0,0) transparent pixely černé (typický artefakt:
    "kolem loga se objeví černý rámeček").

    Raises ``UnsupportedImageError`` když Pillow soubor neumí otevřít —
    view to převede na 400. Předtím se v takovém případě uložil raw
    upload a user dostal "úspěšný" upload se zlomenou fotkou v galerii.

    EXIF orientation: phones save portrait JPEGs as landscape pixels
    + an "Orientation=6" EXIF tag telling viewers to rotate 90°.
    Pillow's `Image.open` doesn't auto-rotate, and our subsequent
    `save()` drops the tag — výsledek byl, že portrait uploads
    skončily uložené naležato. `ImageOps.exif_transpose` přečte tag,
    fyzicky otočí pixely a tag pak ze ztratí (= viewer ho už nehledá
    a obrázek je správně i tak).
    """
    from PIL import Image, ImageOps, UnidentifiedImageError

    try:
        upload.seek(0)
        img = Image.open(upload)
        # Apply EXIF rotation BEFORE conversion + resize, jinak bychom
        # pracovali s unrotated pixel daty.
        img = ImageOps.exif_transpose(img)

        has_alpha = _detect_alpha(img)

        if has_alpha and preserve_alpha:
            # Zachovat alpha → PNG output. Normalize na RGBA (P/LA →
            # RGBA), ať save() nemusí guess-ovat.
            img = img.convert("RGBA")
        elif has_alpha:
            # Composite přes bílé pozadí — transparent pixely (typicky
            # RGB=(0,0,0,0)) by po drop alpha zůstaly černé a viewer
            # by viděl "černý rámeček kolem loga".
            rgba = img.convert("RGBA")
            background = Image.new("RGB", rgba.size, (255, 255, 255))
            background.paste(rgba, mask=rgba.split()[3])
            img = background
        else:
            img = img.convert("RGB")

        w, h = img.size
        scale = min(1.0, max_dim / max(w, h))
        if scale < 1.0:
            new_size = (int(w * scale), int(h * scale))
            img = img.resize(new_size, Image.LANCZOS)

        buf = io.BytesIO()
        if has_alpha and preserve_alpha:
            img.save(buf, format="PNG", optimize=True)
            ext, mime = "png", "image/png"
        else:
            img.save(buf, format="JPEG", quality=quality, optimize=True)
            ext, mime = "jpg", "image/jpeg"
        buf.seek(0)
        original_name = getattr(upload, "name", "image") or "image"
        stem = original_name.rsplit(".", 1)[0][:60]
        return InMemoryUploadedFile(
            buf,
            "image",
            f"{stem}.{ext}",
            mime,
            buf.getbuffer().nbytes,
            None,
        )
    except UnidentifiedImageError as exc:
        raise UnsupportedImageError(
            "Pillow nezná formát uploadu (HEIC bez plugin / AVIF / "
            "nečitelný soubor)."
        ) from exc
    except Exception as exc:
        # Kterákoli jiná chyba (truncated JPEG, OSError z disku) —
        # log + propaguj jako Unsupported, ať user dostane jasný 400
        # místo tiché 500 na další POST.
        logger.warning("downscale_upload failed: %s", exc, exc_info=True)
        raise UnsupportedImageError(
            "Soubor se nepodařilo zpracovat jako obrázek."
        ) from exc
