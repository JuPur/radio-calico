from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class Page(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=True)

    def __repr__(self):
        return f"<Page {self.title}>"


class PlayHistory(db.Model):
    id        = db.Column(db.Integer, primary_key=True)
    title     = db.Column(db.String(500), nullable=False)
    artist    = db.Column(db.String(500))
    album     = db.Column(db.String(500))
    cover     = db.Column(db.String(1000))
    played_at = db.Column(db.Float, nullable=False)  # Unix timestamp

    def to_dict(self):
        return {
            "title":  self.title,
            "artist": self.artist,
            "album":  self.album,
            "cover":  self.cover,
        }


class SongRating(db.Model):
    __tablename__ = "song_ratings"

    id           = db.Column(db.Integer, primary_key=True)
    song_key     = db.Column(db.String(500), nullable=False, index=True)
    visitor_id   = db.Column(db.String(36),  nullable=False)
    is_thumbs_up = db.Column(db.Boolean,     nullable=False)
    rated_at     = db.Column(db.Float,       nullable=False)

    __table_args__ = (
        db.UniqueConstraint("song_key", "visitor_id", name="uq_song_visitor"),
    )
