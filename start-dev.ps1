# SMS Platform - Dev Startup Script
# Run this from the sms-platform directory

$root = $PSScriptRoot

Write-Host "`n[1/5] Starting PostgreSQL + Redis via Docker..." -ForegroundColor Cyan
docker compose up -d postgres redis
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker failed to start. Make sure Docker Desktop is running!" -ForegroundColor Red
    exit 1
}

Write-Host "`n[2/5] Waiting 5s for DB to be ready..." -ForegroundColor Cyan
Start-Sleep -Seconds 5

Write-Host "`n[3/5] Running Prisma migrations..." -ForegroundColor Cyan
Set-Location "$root\backend"
npx prisma migrate deploy --schema src/prisma/schema.prisma
if ($LASTEXITCODE -ne 0) {
    Write-Host "Trying prisma migrate dev instead..." -ForegroundColor Yellow
    npx prisma migrate dev --schema src/prisma/schema.prisma --name init
}

Write-Host "`n[4/5] Generating Prisma client..." -ForegroundColor Cyan
npx prisma generate --schema src/prisma/schema.prisma

Write-Host "`n[5/5] Starting Backend + Worker + Frontend..." -ForegroundColor Cyan

# Backend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\backend'; npm run dev" -WindowStyle Normal

# Worker
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\backend'; node src/jobs/bulkSms.worker.js" -WindowStyle Normal

# Frontend
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$root\frontend'; npm run dev" -WindowStyle Normal

Set-Location $root

Write-Host "`n✅ All services starting!" -ForegroundColor Green
Write-Host "   Frontend  → http://localhost:5173" -ForegroundColor White
Write-Host "   Backend   → http://localhost:4000" -ForegroundColor White
Write-Host "   Health    → http://localhost:4000/health" -ForegroundColor White
Write-Host "   Numbers   → http://localhost:4000/api/numbers" -ForegroundColor White
Write-Host "   Balance   → http://localhost:4000/api/balance" -ForegroundColor White
