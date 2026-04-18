@echo off
echo Uruchamianie Guitar App...
echo.

start "Guitar - Backend" cmd /k "cd /d "%~dp0backend" && venv\Scripts\activate && python manage.py runserver"
start "Guitar - Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

echo Backend :  http://127.0.0.1:8000
echo Frontend:  http://localhost:5173
echo.
echo Aby zatrzymac aplikacje uruchom stop.bat lub zamknij oba okna terminala.
