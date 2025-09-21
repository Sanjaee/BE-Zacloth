@echo off
echo ========================================
echo           DEPLOYMENT SCRIPT
echo ========================================
echo.

echo [1/4] Pulling latest changes from main branch...
git pull origin main
if %errorlevel% neq 0 (
    echo ERROR: Git pull failed!
    pause
    exit /b 1
)
echo ✓ Git pull completed successfully
echo.

echo [2/4] Stopping all running containers...
docker-compose down
if %errorlevel% neq 0 (
    echo WARNING: Docker-compose down had issues, but continuing...
)
echo ✓ Docker containers stopped
echo.

echo [3/4] Cleaning up unused Docker images...
docker image prune -a -f
if %errorlevel% neq 0 (
    echo WARNING: Docker image prune had issues, but continuing...
)
echo ✓ Docker images cleaned up
echo.

echo [4/4] Building and starting containers...
docker-compose up --build -d
if %errorlevel% neq 0 (
    echo ERROR: Docker-compose up failed!
    pause
    exit /b 1
)
echo ✓ Docker containers built and started successfully
echo.

echo ========================================
echo        DEPLOYMENT COMPLETED!
echo ========================================
echo.
echo All services are now running in detached mode.
echo You can check the status with: docker-compose ps
echo You can view logs with: docker-compose logs -f
echo.
pause
