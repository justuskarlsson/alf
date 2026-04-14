#!/usr/bin/env bash
set -euo pipefail

systemctl --user stop alf-dev.target 2>/dev/null || true
systemctl --user disable alf-dev.target 2>/dev/null || true

for unit in alf-dev-relay.service alf-dev-backend.service alf-dev-frontend.service alf-dev.target; do
  rm -f "$HOME/.config/systemd/user/$unit"
done

systemctl --user daemon-reload
echo "Uninstalled."
