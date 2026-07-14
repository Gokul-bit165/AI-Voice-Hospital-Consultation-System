@echo off
echo Starting Backend FastAPI server...
uvicorn backend.app.main:app --reload --port 8000
pause
