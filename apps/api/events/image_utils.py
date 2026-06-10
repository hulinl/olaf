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


def downscale_upload(upload, *, max_dim: int = 1600, quality: int = 82):
    """Return a Django InMemoryUploadedFile, downscaled + re-encoded
    as JPEG. Raises ``UnsupportedImageError`` když Pillow soubor
    neumí otevřít — view to převede na 400. Předtím se v takovém
    případě uložil raw upload a user dostal "úspěšný" upload se
    zlomenou fotkou v galerii.

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
        img = img.convert("RGB")  # Drop alpha; JPEG output anyway.
        w, h = img.size
        scale = min(1.0, max_dim / max(w, h))
        if scale < 1.0:
            new_size = (int(w * scale), int(h * scale))
            img = img.resize(new_size, Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=quality, optimize=True)
        buf.seek(0)
        original_name = getattr(upload, "name", "image") or "image"
        stem = original_name.rsplit(".", 1)[0][:60]
        return InMemoryUploadedFile(
            buf,
            "image",
            f"{stem}.jpg",
            "image/jpeg",
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
