# OLAF

A community-and-event platform for adventure organizers, sports communities, and corporate event hosts.

See [`docs/PRD.md`](docs/PRD.md) for product requirements.

## Stack

- **Backend** — Django 5 + DRF + Celery + PostgreSQL 16 + Redis 7
- **Frontend** — Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4
- **Infra** — Azure West Europe (Container Apps, Postgres Flexible, Blob Storage, Key Vault, Front Door)
- **Local dev** — Docker Compose (Postgres, Redis, MailHog, Django, Celery worker + beat, Next.js)

## Quick start

```bash
cp .env.example .env       # tweak values if needed
make build                 # build containers (first run)
make dev                   # start the full stack
make migrate               # apply DB migrations (in another shell)
```

Local endpoints:

| Service     | URL                       |
| ----------- | ------------------------- |
| Web         | http://localhost:3000     |
| API         | http://localhost:8000     |
| API health  | http://localhost:8000/health/ |
| Django admin| http://localhost:8000/admin/  |
| MailHog UI  | http://localhost:8025     |

## Repository layout

```
olaf/
├── apps/
│   ├── api/                # Django backend
│   │   ├── olaf/           # project package (settings, urls, celery)
│   │   ├── manage.py
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   └── web/                # Next.js frontend
├── docs/
│   └── PRD.md              # product requirements (v1.1, source of truth)
├── .github/workflows/      # CI
├── docker-compose.yml
├── Makefile
└── .env.example
```

## Conventions

- Lowercase `olaf` in code, URLs, and identifiers; **OLAF** in branding.
- Every workspace-scoped DB row has a `tenant_id` (workspace) FK. Cross-tenant queries are forbidden by the manager layer.
- All UI strings are wrapped in i18n helpers from day one; only `en` is populated in V1.
- Commits follow [Conventional Commits](https://www.conventionalcommits.org/). Each vertical slice ships as one PR.
