# ── base: install Python deps only ───────────────────────────────────────────
FROM python:3.11-slim AS base
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── dev: source is volume-mounted; Flask dev server with live reload ──────────
FROM base AS dev
ENV FLASK_APP=app.py \
    FLASK_DEBUG=1 \
    FLASK_RUN_PORT=5050 \
    FLASK_RUN_HOST=0.0.0.0
EXPOSE 5050
CMD ["flask", "run"]

# ── prod: source baked in; Gunicorn WSGI server ───────────────────────────────
FROM base AS prod
RUN pip install --no-cache-dir gunicorn
COPY . .
ENV FLASK_APP=app.py \
    FLASK_DEBUG=0
EXPOSE 8000
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "4", "app:app"]
