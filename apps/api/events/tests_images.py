"""Event gallery + cover image endpoint coverage.

Tahle skupina dosud neměla žádné testy — galerii teď user testuje
na mobilu / tabletu a recent bug s neviditelným delete tlačítkem
ukázal jak křehká je. Cover + gallery jsou hot path pro vizuální
prezentaci akce.
"""
from __future__ import annotations

import io
from datetime import timedelta
from unittest import mock

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import User
from workspaces.models import Workspace, WorkspaceMember

from .models import Event, EventImage


def _make_user(email: str) -> User:
    return User.objects.create_user(
        email=email,
        password="alpine-hike-2026",
        first_name="X",
        last_name="Y",
        email_verified=True,
    )


def _make_workspace(owner: User, slug: str = "ws") -> Workspace:
    ws = Workspace.objects.create(slug=slug, name=slug.title())
    WorkspaceMember.objects.create(
        workspace=ws, user=owner, role=WorkspaceMember.ROLE_OWNER
    )
    return ws


def _make_event(ws: Workspace, slug: str = "ev") -> Event:
    starts = timezone.now() + timedelta(days=14)
    return Event.objects.create(
        workspace=ws,
        slug=slug,
        title=f"E {slug}",
        starts_at=starts,
        ends_at=starts + timedelta(hours=4),
        status=Event.STATUS_PUBLISHED,
    )


def _png_bytes(size_kb: int = 1) -> bytes:
    """Generate a `size_kb`-ish PNG. For real tests we patch the
    downscale helper so the bytes don't need to be valid pixels."""
    # Magic + minimal IHDR + padding bytes + minimal IDAT + IEND.
    base = (
        b"\x89PNG\r\n\x1a\n"
        b"\x00\x00\x00\rIHDR"
        b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    )
    padding = b"\x00" * max(0, size_kb * 1024 - len(base) - 24)
    tail = (
        b"\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4"
        b"\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    return base + padding + tail


# Patch the downscale helper for all image tests so we don't depend
# on Pillow being able to actually parse our fake PNG bytes.
def _passthrough_downscale(upload):
    return upload


class GalleryUploadTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@gal.com")
        self.outsider = _make_user("x@gal.com")
        self.ws = _make_workspace(self.owner, slug="galws")
        self.event = _make_event(self.ws)
        self.client = APIClient()
        self.url = reverse(
            "events:images",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
            },
        )
        # Patch downscale across all tests in this class.
        self._patcher = mock.patch(
            "events.views._downscale_upload", _passthrough_downscale
        )
        self._patcher.start()

    def tearDown(self) -> None:
        self._patcher.stop()

    def test_anon_can_list_gallery(self) -> None:
        # Public landing — gallery musí jít fetchnout bez auth.
        r = self.client.get(self.url)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json(), [])

    def test_owner_uploads_image(self) -> None:
        self.client.force_authenticate(self.owner)
        png = io.BytesIO(_png_bytes())
        png.name = "photo.png"
        r = self.client.post(
            self.url,
            {"image": png, "alt_text": "Sunset"},
            format="multipart",
        )
        self.assertEqual(r.status_code, 201, r.content)
        img = EventImage.objects.get(event=self.event)
        self.assertEqual(img.alt_text, "Sunset")
        self.assertEqual(img.sort_order, 1)

    def test_outsider_cannot_upload(self) -> None:
        self.client.force_authenticate(self.outsider)
        png = io.BytesIO(_png_bytes())
        png.name = "photo.png"
        r = self.client.post(
            self.url,
            {"image": png},
            format="multipart",
        )
        self.assertEqual(r.status_code, 403)

    def test_upload_without_file_400(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(self.url, {}, format="multipart")
        self.assertEqual(r.status_code, 400)
        self.assertIn("image", r.json())

    def test_sort_order_increments_per_upload(self) -> None:
        self.client.force_authenticate(self.owner)
        for i in range(3):
            png = io.BytesIO(_png_bytes())
            png.name = f"photo{i}.png"
            self.client.post(
                self.url, {"image": png}, format="multipart"
            )
        orders = list(
            EventImage.objects.filter(event=self.event)
            .order_by("sort_order")
            .values_list("sort_order", flat=True)
        )
        self.assertEqual(orders, [1, 2, 3])

    def test_event_collaborator_can_upload(self) -> None:
        # Regression: gallery upload kdysi gateoval `is_workspace_owner`
        # což odřízlo EventCollaborator. Sjednoceno s `can_manage_event`.
        from events.models import EventCollaborator

        collaborator = _make_user("collab@gal.com")
        EventCollaborator.objects.create(
            event=self.event, user=collaborator, added_by=self.owner
        )
        self.client.force_authenticate(collaborator)
        png = io.BytesIO(_png_bytes())
        png.name = "by-collab.png"
        r = self.client.post(
            self.url, {"image": png}, format="multipart"
        )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(EventImage.objects.filter(event=self.event).count(), 1)


class GalleryDeleteTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@gd.com")
        self.outsider = _make_user("x@gd.com")
        self.ws = _make_workspace(self.owner, slug="gdws")
        self.event = _make_event(self.ws)
        # Create image via ORM (bypassing upload pipeline).
        self.image = EventImage.objects.create(
            event=self.event,
            image="placeholder.png",
            alt_text="alt",
            sort_order=1,
        )
        self.client = APIClient()

    def _url(self) -> str:
        return reverse(
            "events:image-detail",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
                "image_id": self.image.pk,
            },
        )

    def test_owner_deletes(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.delete(self._url())
        self.assertEqual(r.status_code, 204)
        self.assertFalse(EventImage.objects.filter(pk=self.image.pk).exists())

    def test_outsider_blocked(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.delete(self._url())
        self.assertEqual(r.status_code, 403)
        self.assertTrue(EventImage.objects.filter(pk=self.image.pk).exists())

    def test_anon_blocked(self) -> None:
        r = self.client.delete(self._url())
        self.assertIn(r.status_code, (401, 403))

    def test_unknown_image_404(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.delete(
            reverse(
                "events:image-detail",
                kwargs={
                    "workspace_slug": self.ws.slug,
                    "event_slug": self.event.slug,
                    "image_id": 99999,
                },
            )
        )
        self.assertEqual(r.status_code, 404)


class GalleryReorderTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@gr.com")
        self.outsider = _make_user("x@gr.com")
        self.ws = _make_workspace(self.owner, slug="grws")
        self.event = _make_event(self.ws)
        self.img_a = EventImage.objects.create(
            event=self.event, image="a.png", sort_order=1
        )
        self.img_b = EventImage.objects.create(
            event=self.event, image="b.png", sort_order=2
        )
        self.img_c = EventImage.objects.create(
            event=self.event, image="c.png", sort_order=3
        )
        self.client = APIClient()
        self.url = reverse(
            "events:images-reorder",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
            },
        )

    def test_owner_reorders(self) -> None:
        self.client.force_authenticate(self.owner)
        # Submit reversed order — c, b, a.
        r = self.client.post(
            self.url,
            {"order": [self.img_c.pk, self.img_b.pk, self.img_a.pk]},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        # Verify orders persisted.
        self.img_a.refresh_from_db()
        self.img_b.refresh_from_db()
        self.img_c.refresh_from_db()
        self.assertEqual(self.img_c.sort_order, 1)
        self.assertEqual(self.img_b.sort_order, 2)
        self.assertEqual(self.img_a.sort_order, 3)

    def test_outsider_blocked(self) -> None:
        self.client.force_authenticate(self.outsider)
        r = self.client.post(
            self.url,
            {"order": [self.img_a.pk]},
            format="json",
        )
        self.assertEqual(r.status_code, 403)
        # Original orders preserved.
        self.img_a.refresh_from_db()
        self.assertEqual(self.img_a.sort_order, 1)

    def test_reorder_ignores_foreign_image_ids(self) -> None:
        # Another event in the same workspace has its own image.
        other_event = _make_event(self.ws, slug="other-ev")
        foreign_img = EventImage.objects.create(
            event=other_event, image="x.png", sort_order=1
        )
        self.client.force_authenticate(self.owner)
        # Order array includes foreign image id — endpoint by ji měl
        # ignorovat / odfiltrovat (jen own-event images reordersovat).
        r = self.client.post(
            self.url,
            {"order": [foreign_img.pk, self.img_a.pk]},
            format="json",
        )
        # Žádný 500 / corruption.
        self.assertIn(r.status_code, (200, 400))
        # Foreign image's sort_order zůstává neměnný.
        foreign_img.refresh_from_db()
        self.assertEqual(foreign_img.sort_order, 1)


class EventCoverTests(TestCase):
    def setUp(self) -> None:
        self.owner = _make_user("o@cov.com")
        self.outsider = _make_user("x@cov.com")
        self.ws = _make_workspace(self.owner, slug="covws")
        self.event = _make_event(self.ws)
        self.client = APIClient()
        self.url = reverse(
            "events:cover",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
            },
        )
        self._patcher = mock.patch(
            "events.image_utils.downscale_upload", _passthrough_downscale
        )
        self._patcher.start()

    def tearDown(self) -> None:
        self._patcher.stop()

    def test_owner_uploads_cover(self) -> None:
        self.client.force_authenticate(self.owner)
        png = io.BytesIO(_png_bytes())
        png.name = "cover.png"
        r = self.client.post(
            self.url, {"cover": png}, format="multipart"
        )
        self.assertEqual(r.status_code, 200, r.content)
        self.event.refresh_from_db()
        self.assertTrue(self.event.cover)

    def test_owner_deletes_cover(self) -> None:
        self.client.force_authenticate(self.owner)
        png = io.BytesIO(_png_bytes())
        png.name = "cover.png"
        self.client.post(self.url, {"cover": png}, format="multipart")
        r = self.client.delete(self.url)
        self.assertEqual(r.status_code, 200)
        self.event.refresh_from_db()
        self.assertFalse(self.event.cover)

    def test_outsider_cannot_upload(self) -> None:
        self.client.force_authenticate(self.outsider)
        png = io.BytesIO(_png_bytes())
        png.name = "cover.png"
        r = self.client.post(self.url, {"cover": png}, format="multipart")
        self.assertEqual(r.status_code, 403)

    def test_missing_cover_file_400(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(self.url, {}, format="multipart")
        self.assertEqual(r.status_code, 400)

    def test_anon_blocked(self) -> None:
        png = io.BytesIO(_png_bytes())
        png.name = "cover.png"
        r = self.client.post(self.url, {"cover": png}, format="multipart")
        self.assertIn(r.status_code, (401, 403))


class BlockImageUploadTests(TestCase):
    """Upload endpoint pro images referenced from block payload
    (hero cover, prose, day image, …). Lands in media/events/blocks/<id>/
    a vrací URL — nezakládá EventImage row.

    PR #192 přidal downscale+EXIF pipeline; tyhle testy chrání před
    regresí na auth + 4xx paths + že se downscale skutečně volá.
    """

    def setUp(self) -> None:
        self.owner = _make_user("o@blk.com")
        self.outsider = _make_user("x@blk.com")
        self.ws = _make_workspace(self.owner, slug="blkws")
        self.event = _make_event(self.ws)
        self.client = APIClient()
        self.url = reverse(
            "events:block-image-upload",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": self.event.slug,
            },
        )
        # Patch downscale (loaded lazy uvnitř view) na source modul.
        self._patcher = mock.patch(
            "events.image_utils.downscale_upload", _passthrough_downscale
        )
        self._patcher.start()

    def tearDown(self) -> None:
        self._patcher.stop()

    def test_owner_uploads(self) -> None:
        self.client.force_authenticate(self.owner)
        png = io.BytesIO(_png_bytes())
        png.name = "hero.png"
        r = self.client.post(
            self.url, {"image": png}, format="multipart"
        )
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertIn("url", body)
        # Path je under events/blocks/<event-id>/.
        self.assertIn(f"events/blocks/{self.event.pk}/", body["url"])

    def test_outsider_blocked(self) -> None:
        self.client.force_authenticate(self.outsider)
        png = io.BytesIO(_png_bytes())
        png.name = "hero.png"
        r = self.client.post(
            self.url, {"image": png}, format="multipart"
        )
        self.assertEqual(r.status_code, 403)

    def test_anon_blocked(self) -> None:
        png = io.BytesIO(_png_bytes())
        png.name = "hero.png"
        r = self.client.post(
            self.url, {"image": png}, format="multipart"
        )
        self.assertIn(r.status_code, (401, 403))

    def test_missing_file_400(self) -> None:
        self.client.force_authenticate(self.owner)
        r = self.client.post(self.url, {}, format="multipart")
        self.assertEqual(r.status_code, 400)

    def test_unknown_event_404(self) -> None:
        self.client.force_authenticate(self.owner)
        bogus_url = reverse(
            "events:block-image-upload",
            kwargs={
                "workspace_slug": self.ws.slug,
                "event_slug": "does-not-exist",
            },
        )
        png = io.BytesIO(_png_bytes())
        png.name = "x.png"
        r = self.client.post(bogus_url, {"image": png}, format="multipart")
        self.assertEqual(r.status_code, 404)

    def test_event_collaborator_can_upload(self) -> None:
        # EventCollaborator gates jsou kritické — block builder je
        # i pro co-creators, ne jen workspace ownery.
        from events.models import EventCollaborator

        collaborator = _make_user("c@blk.com")
        EventCollaborator.objects.create(
            event=self.event, user=collaborator, added_by=self.owner
        )
        self.client.force_authenticate(collaborator)
        png = io.BytesIO(_png_bytes())
        png.name = "x.png"
        r = self.client.post(self.url, {"image": png}, format="multipart")
        self.assertEqual(r.status_code, 201, r.content)

    def test_downscale_pipeline_invoked(self) -> None:
        # PR #192 regression guard — sledujeme, že `downscale_upload`
        # se volá při each block upload (předtím se file ukládal as-is).
        self.client.force_authenticate(self.owner)
        png = io.BytesIO(_png_bytes())
        png.name = "x.png"
        with mock.patch(
            "events.image_utils.downscale_upload",
            wraps=_passthrough_downscale,
        ) as spy:
            r = self.client.post(
                self.url, {"image": png}, format="multipart"
            )
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(spy.call_count, 1)
