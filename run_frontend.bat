@echo off
echo Starting Frontend Next.js app...
echo Frontend accessible at https://YOUR_PC_IP:3000
cd frontend
npm run dev -- --experimental-https --hostname 0.0.0.0
pause
