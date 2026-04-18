@echo off
echo Zatrzymywanie Guitar App...
echo.

:: Zabij proces na porcie 8000 (Django)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000 " ^| findstr "LISTENING"') do (
    echo Zatrzymuje backend (PID %%a)...
    taskkill /PID %%a /F >nul 2>&1
)

:: Zabij proces na porcie 5173 (Vite)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 " ^| findstr "LISTENING"') do (
    echo Zatrzymuje frontend (PID %%a)...
    taskkill /PID %%a /F >nul 2>&1
)

echo Gotowe.
