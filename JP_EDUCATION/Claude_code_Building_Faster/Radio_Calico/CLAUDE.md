# Radio Calico

Local prototype for the Radio Calico website.

---

## Stack

- **Backend:** Python / Flask
- **Database:** SQLite via Flask-SQLAlchemy
- **Templates:** Jinja2
- **Frontend:** Plain HTML/CSS/JS (no framework yet)

---

## Project Structure

```
app.py            # Flask app entry point, DB init, routes
models.py         # SQLAlchemy models
templates/        # Jinja2 HTML templates
static/css/       # Stylesheets
static/js/        # JavaScript
instance/         # SQLite DB file lives here (auto-created, gitignored)
venv/             # Python virtual environment (gitignored)
.env              # Flask env vars (gitignored)
requirements.txt  # Pinned dependencies
```

---

## Run

```bash
source venv/bin/activate
flask run
```

App runs at `http://localhost:5050`.

Debug mode is on by default (`.env` sets `FLASK_DEBUG=1`).

Note: port 5000 is reserved by macOS AirPlay Receiver — use 5050.

---

## Database

SQLite file at `instance/radio_calico.db`. Created automatically on first run via `db.create_all()` in `app.py`.

To add a model: define it in `models.py`, then restart the server — the table is created automatically.

To inspect the DB directly:

```bash
source venv/bin/activate
python3 -c "from app import app, db; app.app_context().push(); print(db.engine.table_names())"
```

Or open with any SQLite browser (e.g. DB Browser for SQLite).

---

## Dependencies

Install / reinstall:

```bash
source venv/bin/activate
pip install -r requirements.txt
```

Add a new package:

```bash
pip install <package>
pip freeze > requirements.txt
```

---

## Notes

- `SECRET_KEY` in `app.py` is a dev placeholder — replace before any deployment.
- `.env` is gitignored; don't commit secrets.
