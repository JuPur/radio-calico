.PHONY: help dev-up dev-down dev-logs prod-up prod-down prod-logs ps test test-security

help:
	@echo "Usage: make <target>"
	@echo ""
	@echo "  Dev  (port 5050, live reload)"
	@echo "    dev-up        Build and start dev container"
	@echo "    dev-down      Stop and remove dev container"
	@echo "    dev-logs      Tail dev container logs"
	@echo ""
	@echo "  Prod (port 80, nginx + Gunicorn + PostgreSQL)"
	@echo "    prod-up       Build and start prod stack (requires SECRET_KEY + POSTGRES_PASSWORD)"
	@echo "    prod-down     Stop and remove prod stack"
	@echo "    prod-logs     Tail prod container logs"
	@echo ""
	@echo "  Testing"
	@echo "    test          Run backend (pytest) and frontend (Jest) tests"
	@echo "    test-security Run npm audit (JS) and pip-audit (Python) security scans"
	@echo ""
	@echo "  Other"
	@echo "    ps            Show running containers"

dev-up:
	docker compose up --build -d

dev-down:
	docker compose down

dev-logs:
	docker compose logs -f

prod-up:
	@if [ -z "$$SECRET_KEY" ]; then \
		echo "Error: SECRET_KEY is not set. Run: export SECRET_KEY=\$$(openssl rand -hex 32)"; \
		exit 1; \
	fi
	docker compose -f docker-compose.prod.yml up --build -d

prod-down:
	docker compose -f docker-compose.prod.yml down

prod-logs:
	docker compose -f docker-compose.prod.yml logs -f

ps:
	docker compose ps

test:
	pytest
	npm test

test-security:
	@echo "=== JS dependencies — npm audit ==="
	npm audit
	@echo ""
	@echo "=== Python dependencies — pip-audit ==="
	pip-audit -r requirements.txt
