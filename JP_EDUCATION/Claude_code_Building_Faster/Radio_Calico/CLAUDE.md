# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Radio Kryten is a single-page HLS radio player. It proxies now-playing metadata from an upstream radio server, enriches it with cover art (iTunes) and track duration (MusicBrainz), stores play history in SQLite, and lets visitors rate songs with a thumbs-up/down system.

---

## File Structure

```
Radio_Calico/
├── app.py                    # Flask app, all routes and API logic
├── models.py                 # SQLAlchemy models
├── requirements.txt
├── .env                      # FLASK_DEBUG=1, port config
├── templates/
│   └── index.html            # Single-page Jinja2 template
├── static/
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   └── main.js           # HLS playback, polling, ratings UI
│   └── img/
│       └── kryten.jpg        # Site logo
└── instance/
    └── radio_calico.db       # SQLite database (auto-created)
```

---

## Stack

- **Backend:** Python / Flask
- **Database:** SQLite via Flask-SQLAlchemy
- **Templates:** Jinja2
- **Frontend:** Plain HTML/CSS/JS — hls.js loaded from CDN for HLS playback

---

## Run

```bash
source venv/bin/activate
flask run
```

App runs at `http://localhost:5050`. Port 5000 is reserved by macOS AirPlay.

Debug mode is on by default (`.env` sets `FLASK_DEBUG=1`).

---

## Architecture

### Data flow

1. **Client** polls `/api/nowplaying` every 5 seconds.
2. **`/api/nowplaying`** scrapes `https://radio3.radio-calico.com/nowplaying` (HTML, BeautifulSoup) for title/artist/album/cover.
3. On a track change, the outgoing track is written to `PlayHistory` and the new track triggers:
   - iTunes Search API → permanent 600×600 cover URL
   - MusicBrainz API → track duration in seconds
4. Response includes elapsed/duration (for the in-browser progress bar), the last 5 history entries, and per-song rating counts.

### In-memory state

`_track` in `app.py` is a module-level dict holding the current track. It resets on server restart — that's intentional. Only the `itunes_cover` URL (permanent CDN) is safe to persist to `PlayHistory`; the radio server's cover URLs are session-relative.

### Song identity

Songs are keyed by `"{title}||{artist}"` (see `_song_key()`). This string is passed to the frontend as `song_key` and posted back on rating submissions.

### Rating deduplication

- Server: `SongRating` has a `UNIQUE(song_key, visitor_id)` constraint — one row per visitor per song, upserted on change.
- Client: `localStorage.rc_visitor_id` (a UUID) persists across refreshes. `localStorage.rc_votes` caches vote state for optimistic UI updates.

### HLS playback

`static/js/main.js` uses hls.js (CDN) for non-Safari browsers; Safari gets native HLS via `audio.src`. The stream URL is hardcoded at the top of `main.js`.

---

## Models (`models.py`)

| Model | Purpose |
|---|---|
| `Page` | Scaffold placeholder — not used by any route |
| `PlayHistory` | One row per track played; only `itunes_cover` stored for cover |
| `SongRating` | Thumbs up/down per `(song_key, visitor_id)` pair |

---

## API Routes

| Route | Method | Notes |
|---|---|---|
| `/` | GET | Renders `index.html` |
| `/api/nowplaying` | GET | Scrapes upstream, enriches, returns current track + history + ratings |
| `/api/history` | GET | Last 5 played tracks (used on initial page load) |
| `/api/rate` | POST | Submit thumbs up/down; validates `visitor_id` as UUID |

---

## Database

SQLite at `instance/radio_calico.db`, auto-created on first run.

```bash
# Inspect tables
source venv/bin/activate
python3 -c "from app import app, db; app.app_context().push(); print(db.engine.table_names())"
```

To add a model: define it in `models.py`, restart — `db.create_all()` handles it.

---

## Dependencies

```bash
source venv/bin/activate
pip install -r requirements.txt   # install
pip install <pkg> && pip freeze > requirements.txt  # add new
```

Key packages: `flask`, `flask-sqlalchemy`, `requests`, `beautifulsoup4`.

---

## External APIs

| API | Used for | Rate limit concern |
|---|---|---|
| `radio3.radio-calico.com/nowplaying` | Upstream now-playing data | Polled every 5s per visitor |
| `itunes.apple.com/search` | Cover art (permanent URL) | Called once per track change |
| `musicbrainz.org/ws/2/recording/` | Track duration | Called once per track change; requires `User-Agent` header |
