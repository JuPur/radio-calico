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

## Getting started

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
├── app.py              # Flask app — all routes and API logic
├── models.py           # SQLAlchemy models (PlayHistory, SongRating)
├── requirements.txt
├── templates/
│   └── index.html      # Single-page Jinja2 template
└── static/
    ├── css/style.css
    ├── js/main.js      # HLS playback, polling, ratings UI
    └── img/kryten.jpg  # Site logo
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
