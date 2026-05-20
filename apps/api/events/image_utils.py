"""Image-upload helpers shared across event covers, gallery, and
workspace logos / covers. Phones upload 3-5 MB JPEGs at 4000+ px —
unprocessed those make page loads sluggish, especially on mobile.
We downscale to 1600 px on the long side + re-encode JPEG at q82
before persisting. Result: 200-400 KB per image without visible
loss on a phone screen."""
from __future__ import annotations

import io

from django.core.files.uploadedfile import InMemoryUploadedFile


def downscale_upload(upload, *, max_dim: int = 1600, quality: int = 82):
    """Return a Django InMemoryUploadedFile, downscaled + re-encoded
    as JPEG. Falls back to the original file if Pillow can't open it
    (e.g. unsupported format / corrupt header), so we never block a
    valid upload on this."""
    from PIL import Image

    try:
        upload.seek(0)
        img = Image.open(upload)
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
    except Exception:
        # Pillow couldn't process — store the original so the owner at
        # least sees their upload. Resize can be re-applied later.
        upload.seek(0)
        return upload
