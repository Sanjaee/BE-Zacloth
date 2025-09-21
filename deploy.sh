#!/bin/bash
set -e

echo "[1/4] Pulling latest changes from main branch..."
git pull origin main || { echo "ERROR: Git pull failed!"; exit 1; }

echo "[2/4] Stopping all running containers..."
docker-compose down || echo "WARNING: docker-compose down failed"

echo "[3/4] Cleaning up unused Docker images..."
docker image prune -a -f || echo "WARNING: image prune failed"

echo "[4/4] Building and starting containers..."
docker-compose up --build -d || { echo "ERROR: docker-compose up failed!"; exit 1; }

echo "========================================"
echo " DEPLOYMENT COMPLETED!"
echo "========================================"
