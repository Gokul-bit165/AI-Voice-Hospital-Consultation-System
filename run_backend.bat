@echo off
echo Starting Backend FastAPI server...
echo Backend accessible at http://YOUR_PC_IP:8000
uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
pause
