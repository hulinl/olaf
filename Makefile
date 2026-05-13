.PHONY: help dev down build rebuild logs migrate makemigrations shell test lint install web-install seed superuser

help:
	@echo "OLAF — common dev commands"
	@echo ""
	@echo "  make dev             start the full stack (docker compose up)"
	@echo "  make down            stop the stack"
	@echo "  make build           build containers"
	@echo "  make rebuild         build --no-cache and start"
	@echo "  make logs            tail logs from all services"
	@echo "  make migrate         apply Django migrations"
	@echo "  make makemigrations  create new Django migrations"
	@echo "  make shell           open a Django shell"
	@echo "  make test            run backend tests"
	@echo "  make lint            run ruff on the backend"
	@echo "  make install         create local venv + install backend deps"
	@echo "  make web-install     install frontend deps locally"
	@echo "  make superuser       create a Django superuser"
	@echo "  make seed            seed Olaf Adventures workspace (run after superuser)"

dev:
	docker compose up

down:
	docker compose down

build:
	docker compose build

rebuild:
	docker compose build --no-cache
	docker compose up

logs:
	docker compose logs -f

migrate:
	docker compose exec api python manage.py migrate

makemigrations:
	docker compose exec api python manage.py makemigrations

shell:
	docker compose exec api python manage.py shell

test:
	docker compose exec api python manage.py test

lint:
	docker compose exec api ruff check .

install:
	cd apps/api && python3 -m venv .venv && .venv/bin/pip install -U pip && .venv/bin/pip install -r requirements.txt

web-install:
	cd apps/web && npm install

superuser:
	docker compose exec api python manage.py createsuperuser

seed:
	docker compose exec api python manage.py seed_olaf_adventures
