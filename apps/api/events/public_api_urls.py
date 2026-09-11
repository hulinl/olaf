"""URL patterny pro veřejné API (bez namespace, aby URL vypadaly
`/api/public/events/{slug}` a ne `/api/public/events:something/{slug}`)."""
from django.urls import path
from django.views.decorators.http import require_http_methods

from . import public_api

urlpatterns = [
    # Batch listing musí být před `<slug>` route, jinak `?slugs=` skončí
    # jako slug parameter.
    path(
        "events",
        require_http_methods(["GET", "OPTIONS"])(
            lambda request: public_api.public_events_options(request)
            if request.method == "OPTIONS"
            else public_api.public_events_batch(request)
        ),
        name="public-events-batch",
    ),
    # Public_id lookup MUSÍ být před generic slug route, jinak by
    # slug route matchla „e" jako slug (a `<public_id>` by ne).
    path(
        "events/e/<str:public_id>",
        require_http_methods(["GET", "OPTIONS"])(
            lambda request, public_id: public_api.public_events_options(request)
            if request.method == "OPTIONS"
            else public_api.public_event_by_hash(request, public_id=public_id)
        ),
        name="public-event-by-hash",
    ),
    path(
        "events/<slug:slug>",
        require_http_methods(["GET", "OPTIONS"])(
            lambda request, slug: public_api.public_events_options(request)
            if request.method == "OPTIONS"
            else public_api.public_event_status(request, slug=slug)
        ),
        name="public-event-status",
    ),
]
