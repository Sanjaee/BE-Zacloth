#!/bin/bash 
set -e

echo "[1/6] Resetting local changes..."
git reset --hard HEAD || { echo "ERROR: Git reset failed!"; exit 1; }

echo "[2/6] Pulling latest changes from main branch..."
git pull origin main || { echo "ERROR: Git pull failed!"; exit 1; }

echo "[3/6] Stopping all running containers..."
docker-compose down || echo "WARNING: docker-compose down failed"

echo "[4/6] Cleaning up unused Docker images..."
docker image prune -a -f || echo "WARNING: image prune failed"

echo "[5/6] Building and starting containers..."
docker-compose up --build -d || { echo "ERROR: docker-compose up failed!"; exit 1; }

echo "[6/6] Pushing Prisma schema to database..."
docker-compose exec -T backend npx prisma db push || { echo "ERROR: Prisma db push failed!"; exit 1; }

echo "========================================"
echo " DEPLOYMENT COMPLETED!"
echo "========================================"
