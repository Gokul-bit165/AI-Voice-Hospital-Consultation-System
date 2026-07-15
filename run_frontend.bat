@echo off
echo Starting Frontend Next.js app...
echo Frontend accessible at http://YOUR_PC_IP:3000
cd frontend
npm run dev -- --hostname 0.0.0.0
pause
