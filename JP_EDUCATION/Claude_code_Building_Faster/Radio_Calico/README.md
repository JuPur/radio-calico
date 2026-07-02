# Radio Kryten

A single-page HLS radio player with live now-playing metadata, cover art, play history, and per-song ratings.

## Features

- **Live HLS stream** — hls.js for all browsers, native HLS for Safari
- **Now playing** — title, artist, album, and 600×600 cover art fetched from iTunes
- **Progress bar** — elapsed / remaining time via MusicBrainz track duration
- **Play history** — last 5 tracks with cover art, persisted in database
- **Song ratings** — thumbs up / down per visitor (UUID-based, stored server-side)
- **Ad-free, data-free, subscription-free**

## Stack

| Layer | Tech |
|---|---|
| Backend | Python / Flask |
| Database | SQLite (dev) / PostgreSQL 16 (prod) via Flask-SQLAlchemy |
| Templates | Jinja2 |
| Frontend | Vanilla HTML / CSS / JS |
| HLS playback | hls.js (CDN, SRI-pinned) |
| Web server | nginx → Gunicorn (prod) |
| Backend tests | pytest + Flask test client |
| Frontend tests | Jest + jsdom |
| CI | GitHub Actions (tests + security scans) |

## Getting started

### Docker (recommended)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
git clone https://github.com/JuPur/radio-calico.git
cd radio-calico

# Dev — Flask dev server, live reload, port 5050
docker compose up --build
# or: make dev-up

# Prod — nginx:80 → Gunicorn → PostgreSQL
export SECRET_KEY=$(openssl rand -hex 32)
export POSTGRES_PASSWORD=$(openssl rand -hex 32)
docker compose -f docker-compose.prod.yml up --build
# or: make prod-up  (after exporting both vars)
```

**Dev**: SQLite database stored in a named Docker volume (`db_data`).  
**Prod**: PostgreSQL 16 data stored in a named Docker volume (`db_data`). Both survive container restarts.

### Local (without Docker)

```bash
git clone https://github.com/JuPur/radio-calico.git
cd radio-calico
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
flask run
```

Open `http://localhost:5050` in your browser. (Port 5000 is reserved by macOS AirPlay.)

The SQLite database is created automatically on first run at `instance/radio_calico.db`.

## Project structure

```
├── app.py                  # Flask app — all routes and API logic
├── models.py               # SQLAlchemy models (PlayHistory, SongRating)
├── requirements.txt
├── pytest.ini              # pytest config
├── package.json            # Jest config
├── Makefile                # dev/prod lifecycle, test, and security targets
├── Dockerfile              # Multi-stage: dev (Flask) and prod (Gunicorn) targets
├── docker-compose.yml      # Dev: port 5050, source volume-mounted, SQLite
├── docker-compose.prod.yml # Prod: nginx:80 → Gunicorn → PostgreSQL
├── .dockerignore
├── nginx/
│   └── nginx.conf          # gzip, static file serving (1-year cache), reverse proxy to Gunicorn
├── templates/
│   └── index.html          # Single-page Jinja2 template
├── static/
│   ├── css/style.css
│   ├── js/
│   │   ├── ratingUtils.js  # Rating logic — testable, loaded before main.js
│   │   └── main.js         # HLS playback, polling, DOM wrappers
│   └── img/kryten.jpg      # Site logo
└── tests/
    ├── conftest.py         # pytest fixtures (in-memory SQLite)
    ├── test_ratings.py     # Backend tests (16 tests)
    └── js/
        └── ratingUtils.test.js  # Frontend tests (32 tests)
```

## Running tests

```bash
# All tests (backend + frontend)
make test

# Or individually:
source venv/bin/activate && pytest   # backend (16 tests)
npm test                             # frontend (32 tests)
```

### Security scanning

```bash
make test-security
```

Runs three scanners: `npm audit` (JS CVEs), `pip-audit` (Python CVEs, in a Python 3.11 Docker container), and `bandit` (Python SAST).

### CI

GitHub Actions runs both test and security scan jobs in parallel on every push and PR to `main`. See `.github/workflows/ci.yml`.

## API

| Route | Method | Description |
|---|---|---|
| `/` | GET | Serves the player page |
| `/api/nowplaying` | GET | Current track + history + ratings |
| `/api/history` | GET | Last 5 played tracks |
| `/api/rate` | POST | Submit thumbs up/down for current song |

## External services

| Service | Purpose |
|---|---|
| `radio3.radio-calico.com` | Upstream now-playing data (polled every 5 s) |
| iTunes Search API | Permanent 600×600 cover art |
| MusicBrainz | Track duration for progress bar |
