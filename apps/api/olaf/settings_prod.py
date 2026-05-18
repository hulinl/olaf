"""Production-only Django settings for the Azure Container Apps deployment.

Activate with `DJANGO_SETTINGS_MODULE=olaf.settings_prod`. Inherits everything
from `settings.py` and overrides only what differs in production:

- DEBUG off; ALLOWED_HOSTS + CORS + CSRF come from env.
- Postgres URL from DATABASE_URL (Azure Postgres Flexible Server).
- Cache moves to Postgres-backed DatabaseCache — no Redis provisioned for V1
  (cost control).
- Celery runs in eager mode — tasks execute synchronously in the request
  thread. No worker container, no broker. Revisit when RSVP volume warrants
  Redis + worker (~€20/mo extra).
- Email goes via Azure Communication Services REST API (custom backend
  lives at notifications.acs_email_backend).
- Media goes to Azure Blob Storage (public-read container) via
  django-storages.
- TLS + HSTS enabled (Container Apps + SWA terminate TLS in front).
"""
from __future__ import annotations

from .settings import *  # noqa: F401,F403  — pull base settings
from .settings import env  # noqa: E402

# --- Core ---
DEBUG = False
ALLOWED_HOSTS = env.list(
    "DJANGO_ALLOWED_HOSTS",
    default=["olaf.events", ".azurecontainerapps.io", "localhost"],
)

# --- Cookies / TLS — Container Apps terminates TLS, app sees X-Forwarded-Proto ---
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = env.bool("DJANGO_SECURE_SSL_REDIRECT", default=True)
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30  # 30 days; widen after launch
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = False
SECURE_REFERRER_POLICY = "same-origin"
X_FRAME_OPTIONS = "DENY"

# --- CORS / CSRF — frontend lives on apex + www ---
FRONTEND_URL = env("FRONTEND_URL", default="https://olaf.events")
CORS_ALLOWED_ORIGINS = env.list(
    "CORS_ALLOWED_ORIGINS",
    default=[FRONTEND_URL, "https://www.olaf.events"],
)
CSRF_TRUSTED_ORIGINS = env.list(
    "CSRF_TRUSTED_ORIGINS",
    default=[FRONTEND_URL, "https://www.olaf.events"],
)

# --- Cache: Postgres-backed (no Redis in V1) ---
# `python manage.py createcachetable django_cache` runs in entrypoint.sh.
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "django_cache",
    },
}

# --- Celery: eager mode (synchronous, no broker, no worker) ---
# RSVP confirmation + event cancellation fan-out run inside the request that
# triggered them. Adds ~200-400ms to those requests (SMTP via ACS) but keeps
# the cost footprint tiny. Switch to Redis broker + dedicated worker when
# volume calls for it.
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

# --- Media on Azure Blob Storage (public-read container) ---
AZURE_STORAGE_CONNECTION_STRING = env(
    "AZURE_STORAGE_CONNECTION_STRING", default=""
)
AZURE_STORAGE_ACCOUNT_NAME = env("AZURE_STORAGE_ACCOUNT_NAME", default="")
AZURE_STORAGE_CONTAINER_MEDIA = env(
    "AZURE_STORAGE_CONTAINER_MEDIA", default="media"
)

if AZURE_STORAGE_CONNECTION_STRING:
    STORAGES = {
        "default": {
            "BACKEND": "storages.backends.azure_storage.AzureStorage",
            "OPTIONS": {
                "connection_string": AZURE_STORAGE_CONNECTION_STRING,
                "azure_container": AZURE_STORAGE_CONTAINER_MEDIA,
                "expiration_secs": None,  # public container; no SAS needed
            },
        },
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage",
        },
    }
    MEDIA_URL = (
        f"https://{AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net/"
        f"{AZURE_STORAGE_CONTAINER_MEDIA}/"
    )

# --- Email: Azure Communication Services REST API ---
EMAIL_BACKEND = env(
    "EMAIL_BACKEND",
    default="notifications.acs_email_backend.AzureCommunicationEmailBackend",
)
AZURE_COMMUNICATION_CONNECTION_STRING = env(
    "AZURE_COMMUNICATION_CONNECTION_STRING", default=""
)
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="noreply@olaf.events")

# --- Logging: stdout for Container Apps log streaming ---
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "compact": {
            "format": "{levelname} {name} {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "compact",
        },
    },
    "loggers": {
        "django": {"handlers": ["console"], "level": "INFO"},
        "celery": {"handlers": ["console"], "level": "WARNING"},
    },
    "root": {"handlers": ["console"], "level": "INFO"},
}
