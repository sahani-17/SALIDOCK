# SALIDOCK Local Development Helper
# Usage:
#   .\run-local.ps1          → start (no rebuild)
#   .\run-local.ps1 build    → start with rebuild
#   .\run-local.ps1 stop     → stop all containers
#   .\run-local.ps1 logs     → follow live logs

param([string]$Action = "start")

$compose = "docker compose -f docker-compose.yml -f docker-compose.local.yml"

switch ($Action) {
    "build" {
        Write-Host "🔨 Building and starting SALIDOCK locally..." -ForegroundColor Cyan
        Invoke-Expression "$compose up --build"
    }
    "stop" {
        Write-Host "🛑 Stopping SALIDOCK containers..." -ForegroundColor Yellow
        docker compose down
    }
    "logs" {
        Write-Host "📋 Following logs (Ctrl+C to exit)..." -ForegroundColor Green
        Invoke-Expression "$compose logs -f"
    }
    default {
        Write-Host "🚀 Starting SALIDOCK locally at http://localhost ..." -ForegroundColor Green
        Invoke-Expression "$compose up"
    }
}
