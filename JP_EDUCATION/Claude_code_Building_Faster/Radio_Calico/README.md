# Radio Kryten

A single-page HLS radio player with live now-playing metadata, cover art, play history, and per-song ratings.

## Features

- **Live HLS stream** — hls.js for all browsers, native HLS for Safari
- **Now playing** — title, artist, album, and 600×600 cover art fetched from iTunes
- **Progress bar** — elapsed / remaining time via MusicBrainz track duration
- **Play history** — last 5 tracks with cover art, persisted in SQLite
- **Song ratings** — thumbs up / down per visitor (UUID-based, stored server-side)
- **Ad-free, data-free, subscription-free**

## Stack

| Layer | Tech |
|---|---|
| Backend | Python / Flask |
| Database | SQLite via Flask-SQLAlchemy |
| Templates | Jinja2 |
| Frontend | Vanilla HTML / CSS / JS |
| HLS playback | hls.js (CDN) |
| Backend tests | pytest + Flask test client |
| Frontend tests | Jest + jsdom |

## Getting started

### Docker (recommended)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
git clone https://github.com/JuPur/radio-calico.git
cd radio-calico

# Dev — live reload, port 5050
docker compose up --build

# Prod — Gunicorn (4 workers), port 8000
export SECRET_KEY=$(openssl rand -hex 32)
docker compose -f docker-compose.prod.yml up --build
```

The SQLite database is stored in a named Docker volume (`db_data`) and survives container restarts.

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
├── Dockerfile              # Multi-stage: dev (Flask) and prod (Gunicorn) targets
├── docker-compose.yml      # Dev: port 5050, source volume-mounted
├── docker-compose.prod.yml # Prod: port 8000, code baked in, SECRET_KEY from env
├── .dockerignore
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
# Backend
source venv/bin/activate
pip install pytest   # first time only
pytest

# Frontend
npm install          # first time only
npm test
```

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
