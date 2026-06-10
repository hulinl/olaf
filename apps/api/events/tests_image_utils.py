"""Unit coverage pro `events.image_utils.downscale_upload`.

Hlavní bug, který sem regression-locknu: phones save portrait JPEGs
as landscape pixel data + EXIF Orientation=6 (rotate 90° CW). Pillow
neaplikuje EXIF automaticky a our `save()` tag drops → portrait
fotky končily uložené naležato. `ImageOps.exif_transpose` to musí
opravit.
"""
from __future__ import annotations

import io

from django.core.files.uploadedfile import InMemoryUploadedFile
from django.test import TestCase
from PIL import Image

from .image_utils import downscale_upload


def _make_jpeg_with_exif_orientation(
    *,
    width: int,
    height: int,
    orientation: int,
) -> InMemoryUploadedFile:
    """Build an in-memory JPEG with given pixel dimensions and EXIF
    Orientation tag. Mimics what a phone uploads: pixels are stored
    in their RAW sensor orientation (often landscape) + an EXIF tag
    that tells viewers how to display them.
    """
    img = Image.new("RGB", (width, height), (255, 0, 0))
    # Pillow exif() with orientation tag set.
    exif = img.getexif()
    exif[0x0112] = orientation  # 0x0112 = Orientation tag
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif.tobytes())
    buf.seek(0)
    return InMemoryUploadedFile(
        buf, "image", "phone.jpg", "image/jpeg", buf.getbuffer().nbytes, None
    )


class ExifOrientationTests(TestCase):
    def test_orientation_6_rotates_to_portrait(self) -> None:
        # Phone uploads: 4032 x 3024 landscape pixels + Orientation=6
        # (rotate 90° CW). Po downscale by mělo mít portrait orientaci
        # (3024 / max x 1600 = portrait s height > width).
        upload = _make_jpeg_with_exif_orientation(
            width=4000, height=3000, orientation=6
        )
        processed = downscale_upload(upload)

        # Re-open processed image to verify pixel dims.
        processed.seek(0)
        out = Image.open(processed)
        # Po EXIF rotaci by mělo být height > width (portrait).
        self.assertGreater(out.height, out.width, "Expected portrait result")

    def test_orientation_1_leaves_landscape_alone(self) -> None:
        # Orientation=1 = no rotation needed. Landscape input → landscape output.
        upload = _make_jpeg_with_exif_orientation(
            width=4000, height=3000, orientation=1
        )
        processed = downscale_upload(upload)
        processed.seek(0)
        out = Image.open(processed)
        self.assertGreater(out.width, out.height, "Expected landscape result")

    def test_orientation_3_rotates_180(self) -> None:
        # Orientation=3 = 180° rotation. Width/height stay swapped relative
        # to raw, ale po rotaci 180° width zůstává width (jen pixely jsou
        # upside down). Test že processed image má stejné width > height
        # jako input.
        upload = _make_jpeg_with_exif_orientation(
            width=4000, height=3000, orientation=3
        )
        processed = downscale_upload(upload)
        processed.seek(0)
        out = Image.open(processed)
        self.assertGreater(out.width, out.height)

    def test_orientation_8_rotates_to_portrait(self) -> None:
        # Orientation=8 = rotate 90° CCW. Landscape pixels → portrait output.
        upload = _make_jpeg_with_exif_orientation(
            width=4000, height=3000, orientation=8
        )
        processed = downscale_upload(upload)
        processed.seek(0)
        out = Image.open(processed)
        self.assertGreater(out.height, out.width, "Expected portrait result")

    def test_downscale_caps_at_max_dim(self) -> None:
        # 4000 x 3000 → downscale na 1600 dim na delší straně.
        upload = _make_jpeg_with_exif_orientation(
            width=4000, height=3000, orientation=1
        )
        processed = downscale_upload(upload, max_dim=1600)
        processed.seek(0)
        out = Image.open(processed)
        self.assertEqual(max(out.width, out.height), 1600)
        # Aspect ratio se zachovává.
        self.assertEqual(out.width, 1600)
        self.assertEqual(out.height, 1200)

    def test_small_image_not_upscaled(self) -> None:
        # Input menší než max_dim → zůstává original size.
        upload = _make_jpeg_with_exif_orientation(
            width=800, height=600, orientation=1
        )
        processed = downscale_upload(upload, max_dim=1600)
        processed.seek(0)
        out = Image.open(processed)
        self.assertEqual(out.width, 800)
        self.assertEqual(out.height, 600)

    def test_unsupported_input_raises(self) -> None:
        # Garbage bytes → Pillow open selže → UnsupportedImageError.
        # Předtím se vracel raw upload (fallback), což ale skončilo
        # uložením nečitelného souboru — user dostal "úspěch" se
        # zlomenou fotkou v galerii. Teď view chytá výjimku a vrátí
        # 400.
        from events.image_utils import UnsupportedImageError

        buf = io.BytesIO(b"not an image at all")
        upload = InMemoryUploadedFile(
            buf, "image", "trash.jpg", "image/jpeg",
            buf.getbuffer().nbytes, None,
        )
        with self.assertRaises(UnsupportedImageError):
            downscale_upload(upload)
