from flask import Flask, render_template, jsonify, request
from models import db, PlayHistory, SongRating
from sqlalchemy import func
import requests
import time
import re
import logging
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

_UUID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///radio_calico.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SECRET_KEY"] = "dev-secret-change-in-prod"

db.init_app(app)

with app.app_context():
    db.create_all()

# In-memory current track — resets on restart, that's fine
_track = {
    "title":         None,
    "artist":        None,
    "album":         None,
    "cover":         None,  # display cover (iTunes or radio fallback)
    "itunes_cover":  None,  # permanent iTunes URL — the only one safe to store in history
    "start":         None,
    "duration":      None,
}


def _itunes_cover(artist, title):
    """Return a permanent iTunes CDN cover URL, or None."""
    try:
        resp = requests.get(
            "https://itunes.apple.com/search",
            params={"term": f"{artist} {title}", "entity": "song", "limit": 1},
            timeout=5,
        )
        resp.raise_for_status()
        results = resp.json().get("results", [])
        if results:
            url = results[0].get("artworkUrl100", "")
            if url:
                return url.replace("100x100bb.jpg", "600x600bb.jpg")
    except Exception:
        logger.warning("iTunes cover lookup failed for '%s – %s'", artist, title, exc_info=True)
    return None


def _lookup_duration(artist, title):
    """Return track duration in seconds from MusicBrainz, or None."""
    try:
        resp = requests.get(
            "https://musicbrainz.org/ws/2/recording/",
            params={
                "query": f'recording:"{title}" artist:"{artist}"',
                "limit": 1,
                "fmt": "json",
            },
            headers={"User-Agent": "RadioCalicoPlayer/1.0 (jp@genomill.com)"},
            timeout=5,
        )
        resp.raise_for_status()
        recordings = resp.json().get("recordings", [])
        if recordings and recordings[0].get("length"):
            return recordings[0]["length"] // 1000
    except Exception:
        logger.warning("MusicBrainz duration lookup failed for '%s – %s'", artist, title, exc_info=True)
    return None


def _song_key(title: str, artist: str) -> str:
    return f"{title}||{artist}"


def _rating_counts(song_key: str) -> dict:
    rows = (
        db.session.query(SongRating.is_thumbs_up, func.count(SongRating.id))
        .filter_by(song_key=song_key)
        .group_by(SongRating.is_thumbs_up)
        .all()
    )
    thumbs_up = thumbs_down = 0
    for is_up, count in rows:
        if is_up:
            thumbs_up = count
        else:
            thumbs_down = count
    return {"thumbs_up": thumbs_up, "thumbs_down": thumbs_down}


def _recent_history() -> list:
    return [
        h.to_dict()
        for h in PlayHistory.query
            .order_by(PlayHistory.played_at.desc())
            .limit(5)
            .all()
    ]


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/rate", methods=["POST"])
def rate():
    data       = request.get_json(silent=True) or {}
    song_key   = (data.get("song_key") or "").strip()[:500]
    visitor_id = (data.get("visitor_id") or "").strip()
    thumb      = data.get("is_thumbs_up")

    if not song_key or not _UUID_RE.match(visitor_id) or thumb is None:
        return jsonify({"error": "invalid_request"}), 400

    existing = SongRating.query.filter_by(
        song_key=song_key, visitor_id=visitor_id
    ).first()
    if existing:
        if existing.is_thumbs_up == bool(thumb):
            result = jsonify(_rating_counts(song_key))
            result.headers["Cache-Control"] = "no-store"
            return result
        existing.is_thumbs_up = bool(thumb)
        existing.rated_at = time.time()
    else:
        db.session.add(SongRating(
            song_key=song_key,
            visitor_id=visitor_id,
            is_thumbs_up=bool(thumb),
            rated_at=time.time(),
        ))
    db.session.commit()

    result = jsonify(_rating_counts(song_key))
    result.headers["Cache-Control"] = "no-store"
    return result


@app.route("/api/history")
def history():
    rows = (
        PlayHistory.query
        .order_by(PlayHistory.played_at.desc())
        .limit(5)
        .all()
    )
    result = jsonify([r.to_dict() for r in rows])
    result.headers["Cache-Control"] = "no-store"
    return result


@app.route("/api/nowplaying")
def nowplaying():
    global _track
    try:
        raw = requests.get(
            "https://radio3.radio-calico.com/nowplaying",
            timeout=5,
        )
        raw.raise_for_status()
        raw.encoding = "utf-8"
        soup = BeautifulSoup(raw.text, "html.parser")
        paras    = soup.find_all("p")
        cover_el = soup.find("img")

        title     = paras[0].get_text(strip=True) if len(paras) > 0 else None
        artist    = paras[1].get_text(strip=True) if len(paras) > 1 else None
        album     = paras[2].get_text(strip=True) if len(paras) > 2 else None

        if title != _track["title"]:
            # Persist outgoing track to history (only use permanent iTunes cover)
            if _track["title"]:
                db.session.add(PlayHistory(
                    title=_track["title"],
                    artist=_track["artist"],
                    album=_track["album"],
                    cover=_track["itunes_cover"],
                    played_at=time.time(),
                ))
                db.session.commit()

            # Look up permanent cover art and duration for new track
            itunes_cover   = _itunes_cover(artist, title) if (artist and title) else None
            fallback_cover = cover_el.get("src") if cover_el else None

            _track["title"]        = title
            _track["artist"]       = artist
            _track["album"]        = album
            _track["cover"]        = itunes_cover or fallback_cover  # now-playing display
            _track["itunes_cover"] = itunes_cover                    # history only
            _track["start"]        = time.time()
            _track["duration"]     = _lookup_duration(artist, title) if (artist and title) else None

        elapsed   = int(time.time() - _track["start"]) if _track["start"] else 0
        duration  = _track["duration"]
        remaining = max(0, duration - elapsed) if duration else None

        history = _recent_history()

        sk      = _song_key(title, artist) if (title and artist) else None
        ratings = _rating_counts(sk) if sk else {"thumbs_up": 0, "thumbs_down": 0}

        result = jsonify({
            "title":      title,
            "artist":     artist,
            "album":      album,
            "cover":      _track["cover"],
            "elapsed":    elapsed,
            "duration":   duration,
            "remaining":  remaining,
            "history":    history,
            "song_key":   sk,
            "thumbs_up":  ratings["thumbs_up"],
            "thumbs_down": ratings["thumbs_down"],
        })
        result.headers["Cache-Control"] = "no-store"
        return result
    except Exception:
        logger.exception("nowplaying failed")
        return jsonify({
            "title": None, "artist": None, "album": None, "cover": None,
            "elapsed": None, "duration": None, "remaining": None,
            "history": _recent_history(),
        }), 502


if __name__ == "__main__":
    app.run(debug=True)
