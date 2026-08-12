@echo off
set COMPOSE=docker compose -f docker-compose.yml -f docker-compose.local.yml

if "%1"=="build" (
    echo Building and starting SALIDOCK locally...
    %COMPOSE% up --build
) else if "%1"=="stop" (
    echo Stopping SALIDOCK containers...
    docker compose down
) else if "%1"=="logs" (
    echo Following logs (Ctrl+C to exit)...
    %COMPOSE% logs -f
) else (
    echo Starting SALIDOCK locally at http://localhost ...
    %COMPOSE% up
)
