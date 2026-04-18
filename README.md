# GuitarTab

A web app for browsing and practicing guitar tablatures — inspired by Songsterr. Supports Guitar Pro files (`.gp`, `.gp3`, `.gp4`, `.gp5`, `.gpx`), renders an interactive score, and automatically tracks your practice progress in the background.

## Screenshots

> *(add screenshots to `docs/` and update the paths below)*

## Features

### Player
- Guitar Pro tab rendering via **alphaTab**
- MIDI playback with SoundFont (Sonivox)
- Tempo (BPM) control — slider, keyboard shortcuts, reset to original
- Master volume control
- **Click metronome** (Web Audio API) — distinct sounds for downbeat vs. weak beats
- **Measure range loop** — type start/end measure numbers, toggle loop
- Keyboard shortcuts (`Space`, `S`, `M`, `L`, `[`, `]`, `?` and more) with an in-player reference modal

### Library
- Browse, search, and sort tabs
- Upload your own Guitar Pro files (authenticated users)
- Tags: genre, difficulty level, play count

### Progress Tracking *(fully automatic — no manual input required)*
- Practice sessions recorded on every playback
- Loop events detected automatically (which measures you repeat most)
- **Measure heatmap** below the score — cool → warm → hot color gradient
- Per-song stats: session count, total time, best BPM%, song coverage
- **`/progress` dashboard**: streak, total practice time, 12-week activity heatmap, practiced songs list

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, React Router v7 |
| Player | alphaTab 1.8.2, Web Audio API |
| Backend | Django 5, Django REST Framework |
| Auth | JWT (SimpleJWT) |
| Database | SQLite (default) / PostgreSQL |
| CORS | django-cors-headers |

## Requirements

- Python 3.11+
- Node.js 18+
- npm 9+

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/guitar_tab.git
cd guitar_tab
```

### 2. Backend

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate
# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt
```

Create a `.env` file from the example:

```bash
cp .env.example .env
```

Edit `.env` (at minimum set `SECRET_KEY`):

```env
SECRET_KEY=replace-with-a-random-secret-key
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
DB_ENGINE=django.db.backends.sqlite3
DB_NAME=db.sqlite3
```

Apply migrations and optionally create an admin account:

```bash
python manage.py migrate
python manage.py createsuperuser   # optional
```

### 3. Frontend

```bash
cd ../frontend
npm install
```

## Running

#### Windows (script)

```bat
start.bat
```

Starts the backend and frontend in separate terminal windows.

#### Manual

```bash
# Terminal 1 — backend
cd backend
venv\Scripts\activate        # or: source venv/bin/activate
python manage.py runserver

# Terminal 2 — frontend
cd frontend
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://127.0.0.1:8000/api/ |
| Admin panel | http://127.0.0.1:8000/admin/ |

## Project Structure

```
guitar_tab/
├── backend/
│   ├── apps/
│   │   ├── accounts/      # registration, JWT auth
│   │   ├── songs/         # Song model, upload, filtering
│   │   └── practice/      # practice sessions, heatmap data
│   ├── config/            # settings, urls, wsgi
│   ├── media/             # uploaded GP files
│   └── manage.py
├── frontend/
│   └── src/
│       ├── api/           # axios client, auth, songs, practice
│       ├── components/    # AlphaTabPlayer, MeasureHeatmap, Navbar, …
│       ├── context/       # AuthContext
│       └── pages/         # HomePage, PlayerPage, ProgressPage, …
├── start.bat
└── stop.bat
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register/` | Register a new user |
| `POST` | `/api/auth/login/` | Log in (returns JWT) |
| `GET` | `/api/songs/` | List tabs (filtering, sorting, pagination) |
| `POST` | `/api/songs/` | Upload a Guitar Pro file |
| `GET` | `/api/songs/{id}/` | Song detail |
| `POST` | `/api/practice/sessions/` | Start a practice session |
| `PATCH` | `/api/practice/sessions/{id}/` | End session (with loop event data) |
| `GET` | `/api/practice/songs/{id}/stats/` | Per-song practice stats |
| `GET` | `/api/practice/dashboard/` | Overall progress dashboard |

## Keyboard Shortcuts

> Press `?` inside the player to open the full reference modal.

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `S` | Stop |
| `=` / `+` | BPM +5 / +1 |
| `-` / `_` | BPM −5 / −1 |
| `R` | Reset BPM |
| `↑` / `↓` | Volume ±5% |
| `M` | Toggle metronome |
| `L` | Toggle loop |
| `X` | Clear loop |
| `[` / `]` | Loop start −1 / +1 |
| `{` / `}` | Loop end −1 / +1 |

## License

MIT
