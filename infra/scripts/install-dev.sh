#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYSTEMD_DIR="$HOME/.config/systemd/user"
UNIT_DIR="$SCRIPT_DIR/../systemd"

if [ ! -f "$SCRIPT_DIR/../.env.dev" ]; then
  echo "Error: infra/.env.dev not found. Copy .env.dev.example and fill it in."
  exit 1
fi

mkdir -p "$SYSTEMD_DIR"
cp "$UNIT_DIR"/*.service "$UNIT_DIR"/*.target "$SYSTEMD_DIR/"

systemctl --user daemon-reload
systemctl --user enable alf-dev.target

echo "Installed. Start with: systemctl --user start alf-dev.target"
