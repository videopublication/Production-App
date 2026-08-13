# PowerShell Script to Start Evolution API Gateway via Docker
Set-Location -Path "$PSScriptRoot\..\docker\evolution-api"
Write-Host "🚀 Launching Evolution API WhatsApp Gateway on port 8080..." -ForegroundColor Green
docker compose up -d
Write-Host "✅ Evolution API is running!" -ForegroundColor Green
Write-Host "🌐 Open Dashboard at: http://localhost:8080" -ForegroundColor Yellow
Write-Host "🔑 API Key: vp_app_secret_key_2026" -ForegroundColor Cyan
