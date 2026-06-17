from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class Page(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    content = db.Column(db.Text, nullable=True)

    def __repr__(self):
        return f"<Page {self.title}>"
