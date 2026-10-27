@echo off
title DigiTwin Launcher
echo ======================================================
echo           Starting DigiTwin Full-Stack App
echo ======================================================

echo [1/2] Starting Python Backend on http://127.0.0.1:8000...
start "DigiTwin Backend (Port 8000)" cmd /k "cd /d "%~dp0digitwin-healthcare\backend" && python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

echo [2/2] Starting Frontend on http://localhost:5173...
start "DigiTwin Frontend (Port 5173)" cmd /k "cd /d "%~dp0digitwin-healthcare\frontend" && npm run dev"

echo.
echo ======================================================
echo Both servers are now running in their own windows!
echo Open your browser at: http://localhost:5173
echo ======================================================
pause
