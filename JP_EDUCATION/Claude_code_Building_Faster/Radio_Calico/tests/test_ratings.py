import pytest
from app import _song_key, _rating_counts, db as _db
from models import SongRating

VISITOR_A = "12345678-1234-1234-1234-123456789012"
VISITOR_B = "87654321-4321-4321-4321-210987654321"
VISITOR_C = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
SONG = "Test Song||Test Artist"


# ---------------------------------------------------------------------------
# _song_key
# ---------------------------------------------------------------------------

def test_song_key_format():
    assert _song_key("Test Song", "Test Artist") == "Test Song||Test Artist"


def test_song_key_empty_parts():
    assert _song_key("", "") == "||"


# ---------------------------------------------------------------------------
# _rating_counts
# ---------------------------------------------------------------------------

def test_rating_counts_unknown_key(app):
    assert _rating_counts("unknown||key") == {"thumbs_up": 0, "thumbs_down": 0}


def test_rating_counts_aggregates(app):
    _db.session.add(SongRating(song_key=SONG, visitor_id=VISITOR_A, is_thumbs_up=True,  rated_at=0.0))
    _db.session.add(SongRating(song_key=SONG, visitor_id=VISITOR_B, is_thumbs_up=False, rated_at=0.0))
    _db.session.commit()
    counts = _rating_counts(SONG)
    assert counts == {"thumbs_up": 1, "thumbs_down": 1}


def test_rating_counts_only_for_key(app):
    other = "Other||Artist"
    _db.session.add(SongRating(song_key=SONG,  visitor_id=VISITOR_A, is_thumbs_up=True, rated_at=0.0))
    _db.session.add(SongRating(song_key=other, visitor_id=VISITOR_A, is_thumbs_up=True, rated_at=0.0))
    _db.session.commit()
    assert _rating_counts(SONG)["thumbs_up"] == 1


# ---------------------------------------------------------------------------
# POST /api/rate — validation
# ---------------------------------------------------------------------------

def test_rate_missing_song_key(client):
    r = client.post("/api/rate", json={"visitor_id": VISITOR_A, "is_thumbs_up": True})
    assert r.status_code == 400


def test_rate_invalid_uuid(client):
    r = client.post("/api/rate", json={"song_key": SONG, "visitor_id": "not-a-uuid", "is_thumbs_up": True})
    assert r.status_code == 400


def test_rate_missing_thumb(client):
    r = client.post("/api/rate", json={"song_key": SONG, "visitor_id": VISITOR_A})
    assert r.status_code == 400


def test_rate_empty_body(client):
    r = client.post("/api/rate", data="", content_type="application/json")
    assert r.status_code == 400


# ---------------------------------------------------------------------------
# POST /api/rate — happy paths
# ---------------------------------------------------------------------------

def test_rate_new_thumbs_up(client):
    r = client.post("/api/rate", json={"song_key": SONG, "visitor_id": VISITOR_A, "is_thumbs_up": True})
    assert r.status_code == 200
    data = r.get_json()
    assert data["thumbs_up"] == 1
    assert data["thumbs_down"] == 0


def test_rate_new_thumbs_down(client):
    r = client.post("/api/rate", json={"song_key": SONG, "visitor_id": VISITOR_A, "is_thumbs_up": False})
    assert r.status_code == 200
    data = r.get_json()
    assert data["thumbs_up"] == 0
    assert data["thumbs_down"] == 1


def test_rate_idempotent_same_vote(client):
    client.post("/api/rate", json={"song_key": SONG, "visitor_id": VISITOR_A, "is_thumbs_up": True})
    r = client.post("/api/rate", json={"song_key": SONG, "visitor_id": VISITOR_A, "is_thumbs_up": True})
    assert r.status_code == 200
    assert r.get_json()["thumbs_up"] == 1  # still 1, not 2


def test_rate_flip_up_to_down(client):
    client.post("/api/rate", json={"song_key": SONG, "visitor_id": VISITOR_A, "is_thumbs_up": True})
    r = client.post("/api/rate", json={"song_key": SONG, "visitor_id": VISITOR_A, "is_thumbs_up": False})
    data = r.get_json()
    assert data["thumbs_up"] == 0
    assert data["thumbs_down"] == 1


def test_rate_flip_down_to_up(client):
    client.post("/api/rate", json={"song_key": SONG, "visitor_id": VISITOR_A, "is_thumbs_up": False})
    r = client.post("/api/rate", json={"song_key": SONG, "visitor_id": VISITOR_A, "is_thumbs_up": True})
    data = r.get_json()
    assert data["thumbs_up"] == 1
    assert data["thumbs_down"] == 0


def test_rate_multiple_visitors(client):
    client.post("/api/rate", json={"song_key": SONG, "visitor_id": VISITOR_A, "is_thumbs_up": True})
    client.post("/api/rate", json={"song_key": SONG, "visitor_id": VISITOR_B, "is_thumbs_up": True})
    r = client.post("/api/rate", json={"song_key": SONG, "visitor_id": VISITOR_C, "is_thumbs_up": False})
    data = r.get_json()
    assert data["thumbs_up"] == 2
    assert data["thumbs_down"] == 1


def test_rate_no_cache_header(client):
    r = client.post("/api/rate", json={"song_key": SONG, "visitor_id": VISITOR_A, "is_thumbs_up": True})
    assert r.headers.get("Cache-Control") == "no-store"
