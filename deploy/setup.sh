#!/bin/bash
# Run this on a fresh Ubuntu 22.04 DigitalOcean Droplet as root
# Usage: bash setup.sh

set -e

echo "==> Updating system..."
apt update && apt upgrade -y

echo "==> Installing dependencies..."
apt install -y python3 python3-pip python3-venv nodejs npm nginx certbot python3-certbot-nginx git

echo "==> Creating app directory..."
mkdir -p /var/www/storagescout
cd /var/www/storagescout

echo "==> Installing Python deps..."
python3 -m venv venv
venv/bin/pip install fastapi "uvicorn[standard]" httpx sqlalchemy aiosqlite \
  "pydantic>=2.0" pydantic-settings python-dotenv tenacity

echo "==> Installing Node deps and building frontend..."
cd frontend
npm install
npm run build
cd ..

echo "==> Setting up systemd service..."
cp deploy/storage-scout.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable storage-scout
systemctl start storage-scout

echo "==> Setting up nginx..."
cp deploy/nginx.conf /etc/nginx/sites-available/storagescout
ln -sf /etc/nginx/sites-available/storagescout /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "==> Setting permissions..."
chown -R www-data:www-data /var/www/storagescout

echo ""
echo "==> Done! Now run:"
echo "    certbot --nginx -d storagescout.xyz -d www.storagescout.xyz"
echo ""
echo "    Then point your domain's A record to this server's IP."
