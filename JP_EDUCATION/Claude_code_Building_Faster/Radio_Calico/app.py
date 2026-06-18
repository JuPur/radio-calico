from flask import Flask, render_template, jsonify
from models import db, PlayHistory
import requests
import time
import re
import os
from bs4 import BeautifulSoup

app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///radio_calico.db"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SECRET_KEY"] = "dev-secret-change-in-prod"

db.init_app(app)

with app.app_context():
    db.create_all()

# In-memory current track — resets on restart, that's fine
_track = {
    "title":    None,
    "artist":   None,
    "album":    None,
    "cover":    None,
    "start":    None,
    "duration": None,
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
        pass
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
        pass
    return None


@app.route("/")
def index():
    return render_template("index.html")


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
            # Persist outgoing track to history
            if _track["title"]:
                db.session.add(PlayHistory(
                    title=_track["title"],
                    artist=_track["artist"],
                    album=_track["album"],
                    cover=_track["cover"],
                    played_at=time.time(),
                ))
                db.session.commit()

            # Look up permanent cover art and duration for new track
            itunes_cover = _itunes_cover(artist, title) if (artist and title) else None
            fallback_cover = cover_el["src"] if cover_el else None

            _track["title"]    = title
            _track["artist"]   = artist
            _track["album"]    = album
            _track["cover"]    = itunes_cover or fallback_cover
            _track["start"]    = time.time()
            _track["duration"] = _lookup_duration(artist, title) if (artist and title) else None

        elapsed   = int(time.time() - _track["start"]) if _track["start"] else 0
        duration  = _track["duration"]
        remaining = max(0, duration - elapsed) if duration else None

        history = [
            h.to_dict()
            for h in PlayHistory.query
                .order_by(PlayHistory.played_at.desc())
                .limit(5)
                .all()
        ]

        result = jsonify({
            "title":     title,
            "artist":    artist,
            "album":     album,
            "cover":     _track["cover"],
            "elapsed":   elapsed,
            "duration":  duration,
            "remaining": remaining,
            "history":   history,
        })
        result.headers["Cache-Control"] = "no-store"
        return result
    except Exception:
        history = [
            h.to_dict()
            for h in PlayHistory.query
                .order_by(PlayHistory.played_at.desc())
                .limit(5)
                .all()
        ]
        return jsonify({
            "title": None, "artist": None, "album": None, "cover": None,
            "elapsed": None, "duration": None, "remaining": None,
            "history": history,
        }), 502


if __name__ == "__main__":
    app.run(debug=True)
