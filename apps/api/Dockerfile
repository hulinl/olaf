FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        curl \
        libpango-1.0-0 \
        libpangoft2-1.0-0 \
        libharfbuzz0b \
        libffi-dev \
        libcairo2 \
        libgdk-pixbuf-2.0-0 \
        libxml2 \
        shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt /app/
RUN pip install -r requirements.txt

COPY . /app/
RUN chmod +x /app/entrypoint.sh

# Build-time collectstatic so the running container doesn't need write
# access to STATIC_ROOT. Uses dummy SECRET_KEY so the build doesn't need
# the real one.
RUN DJANGO_SETTINGS_MODULE=olaf.settings DJANGO_SECRET_KEY=build-only \
    python manage.py collectstatic --noinput

EXPOSE 8000

# Container Apps reuses Dockerfile CMD. entrypoint.sh runs migrate +
# createcachetable (both idempotent) then execs gunicorn. Local dev
# (docker compose) overrides CMD to python manage.py runserver.
CMD ["/app/entrypoint.sh"]
