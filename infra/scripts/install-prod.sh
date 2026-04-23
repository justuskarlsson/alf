#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYSTEMD_DIR="$HOME/.config/systemd/user"
UNIT_DIR="$SCRIPT_DIR/../systemd"
ENV_FILE="$SCRIPT_DIR/../.env.prod"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: infra/.env.prod not found. Copy .env.prod.example and fill it in."
  exit 1
fi

mkdir -p "$SYSTEMD_DIR"
cp "$UNIT_DIR"/alf-prod*.service "$UNIT_DIR"/alf-prod.target "$SYSTEMD_DIR/"

systemctl --user daemon-reload
systemctl --user enable alf-prod.target

echo "Done. Start with: systemctl --user start alf-prod.target"
