#!/usr/bin/env bash
# One-time VPS setup: nginx (443), certbot, systemd service for relay, frontend build.
#
# Usage (as root):
#   ./install.sh <domain> [relay_port] [relay_token]
#
# Example:
#   ./install.sh alf.randomgrejer.se 5001 my-secret-token
#
# What it does:
#   1. Installs nginx + certbot (apt) if missing
#   2. Obtains SSL cert via certbot (standalone, needs port 80 free)
#   3. Creates /etc/nginx/sites-available/alf
#        - HTTPS (443): static frontend + WS proxy for /client and /server
#        - HTTP  (80):  ACME challenge + redirect to HTTPS
#   4. Creates /etc/systemd/system/alf-relay.service (relay on localhost:RELAY_PORT)
#   5. Writes infra/vps/.env (sourced by relay service)
#   6. Builds the frontend (vite build), starts relay + nginx
#
# Prerequisites: node (>=20), pnpm, git — must already be on the box.

set -euo pipefail

# ---------- args ----------

DOMAIN="${1:-}"
RELAY_PORT="${2:-5001}"
RELAY_TOKEN="${3:-$(tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 32 || true)}"

if [[ -z "$DOMAIN" ]]; then
  echo "Usage: $0 <domain> [relay_port] [relay_token]"
  exit 1
fi

if [[ $EUID -ne 0 ]]; then
  echo "This script must be run as root (use sudo)."
  exit 1
fi

# ---------- paths ----------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

echo "==> Domain:     $DOMAIN"
echo "==> Relay port: $RELAY_PORT (internal, proxied by nginx)"
echo "==> Repo root:  $REPO_ROOT"

# ---------- deps ----------

echo ""
echo "==> Installing system packages (nginx, certbot)..."
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx > /dev/null

for cmd in node pnpm; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Error: $cmd not found. Install Node.js and pnpm first."
    exit 1
  fi
done

# ---------- env file ----------

echo ""
echo "==> Writing $ENV_FILE"
cat > "$ENV_FILE" << EOF
RELAY_PORT=$RELAY_PORT
RELAY_TOKEN=$RELAY_TOKEN
EOF

echo "   (relay token: $RELAY_TOKEN)"

# ---------- systemd ----------

echo ""
echo "==> Creating systemd service: alf-relay"

# Resolve node path now so systemd doesn't need nvm/fnm
NODE_PATH="$(dirname "$(command -v node)")"

cat > /etc/systemd/system/alf-relay.service << EOF
[Unit]
Description=Alf Relay
After=network.target

[Service]
Type=simple
WorkingDirectory=$REPO_ROOT/relay
ExecStart=$REPO_ROOT/relay/node_modules/.bin/tsx src/index.ts
EnvironmentFile=$ENV_FILE
Environment=NODE_ENV=production
Environment=PATH=$NODE_PATH:/usr/local/bin:/usr/bin:/bin
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=alf-relay

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable alf-relay

# ---------- npm install + build ----------

echo ""
echo "==> Installing dependencies & building frontend..."

cd "$REPO_ROOT/relay"
pnpm install --frozen-lockfile

cd "$REPO_ROOT/frontend"
pnpm install --frozen-lockfile
pnpm build

# ---------- certbot ----------

echo ""
echo "==> Obtaining SSL certificate..."

# Stop nginx temporarily so certbot can bind port 80 (standalone mode)
systemctl stop nginx 2>/dev/null || true

certbot certonly --standalone -d "$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN" || {
  echo ""
  echo "WARNING: certbot failed. You can retry manually:"
  echo "  certbot certonly --standalone -d $DOMAIN"
  echo "  Then re-run this script."
  exit 1
}

# ---------- nginx ----------

echo ""
echo "==> Configuring nginx for $DOMAIN"

NGINX_CONF="/etc/nginx/sites-available/alf"
NGINX_ENABLED="/etc/nginx/sites-enabled/alf"

cat > "$NGINX_CONF" << EOF
# Alf — $DOMAIN
# Generated: $(date -Iseconds)

upstream alf_relay {
    server 127.0.0.1:$RELAY_PORT;
    keepalive 64;
}

# HTTP — certbot ACME challenge + redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://\$server_name\$request_uri;
    }
}

# HTTPS
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name $DOMAIN;

    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    # Frontend — static files
    root $REPO_ROOT/frontend/dist;
    index index.html;

    # SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Relay WebSocket — /client
    location /client {
        proxy_pass http://alf_relay;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # Relay WebSocket — /server
    location /server {
        proxy_pass http://alf_relay;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    # Relay health
    location = /health {
        proxy_pass http://alf_relay;
        access_log off;
    }
}
EOF

# Remove default site if it exists, enable alf
rm -f /etc/nginx/sites-enabled/default
ln -sf "$NGINX_CONF" "$NGINX_ENABLED"

echo "   Testing nginx config..."
nginx -t

systemctl start nginx

# ---------- start relay ----------

echo ""
echo "==> Starting relay service..."
systemctl start alf-relay
systemctl status alf-relay --no-pager || true

echo ""
echo "============================================"
echo "  Alf VPS setup complete!"
echo "  Frontend:    https://$DOMAIN"
echo "  Relay:       wss://$DOMAIN/client  (proxied to localhost:$RELAY_PORT)"
echo "  Relay token: $RELAY_TOKEN"
echo "  Env file:    $ENV_FILE"
echo ""
echo "  Backend connects to: wss://$DOMAIN/server"
echo "============================================"
