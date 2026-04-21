#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYSTEMD_DIR="$HOME/.config/systemd/user"
UNIT_DIR="$SCRIPT_DIR/../systemd"
ENV_FILE="$SCRIPT_DIR/../.env.test"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: infra/.env.test not found. Copy .env.test.example and fill it in."
  exit 1
fi

mkdir -p "$SYSTEMD_DIR"
cp "$UNIT_DIR"/alf-test*.service "$UNIT_DIR"/alf-test.target "$SYSTEMD_DIR/"

systemctl --user daemon-reload
systemctl --user enable alf-test.target

echo "Done. Start with:  systemctl --user start alf-test.target"
echo "Stop with:         systemctl --user stop alf-test.target"
