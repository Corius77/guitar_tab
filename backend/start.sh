#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d "venv" ]; then
  echo "Creating virtual environment..."
  python -m venv venv
fi

source venv/Scripts/activate

echo "Installing dependencies..."
pip install -r requirements.txt -q

echo "Running migrations..."
python manage.py migrate

echo "Seeding genres..."
python manage.py seed_genres

echo "Starting Django development server on http://127.0.0.1:8000"
python manage.py runserver
