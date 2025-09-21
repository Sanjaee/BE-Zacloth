#!/bin/bash 
set -e

echo "[1/5] Pulling latest changes from main branch..."
git pull origin main || { echo "ERROR: Git pull failed!"; exit 1; }

echo "[2/5] Stopping all running containers..."
docker-compose down || echo "WARNING: docker-compose down failed"

echo "[3/5] Cleaning up unused Docker images..."
docker image prune -a -f || echo "WARNING: image prune failed"

echo "[4/5] Building and starting containers..."
docker-compose up --build -d || { echo "ERROR: docker-compose up failed!"; exit 1; }

echo "[5/5] Pushing Prisma schema to database..."
docker-compose exec backend npx prisma db push || { echo "ERROR: Prisma db push failed!"; exit 1; }

echo "========================================"
echo " DEPLOYMENT COMPLETED!"
echo "========================================"
