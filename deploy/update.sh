#!/bin/bash
# Run on the production server after changes are pushed to GitHub.

set -euo pipefail

APP_DIR=/var/www/storagescout

echo "==> Pulling latest code..."
cd "$APP_DIR"
git pull --ff-only origin main

echo "==> Updating backend dependencies..."
"$APP_DIR"/venv/bin/pip install -r backend/requirements.txt

echo "==> Building frontend..."
cd "$APP_DIR"/frontend
npm ci
npm run build

echo "==> Updating systemd unit and restarting API..."
cd "$APP_DIR"
cp deploy/storage-scout.service /etc/systemd/system/storage-scout.service
systemctl daemon-reload
systemctl restart storage-scout

echo "==> Checking nginx config..."
nginx -t
systemctl reload nginx

echo "==> Done."
