#!/usr/bin/env bash
# Usage: restart.sh [relay|backend|frontend]  (default: all)
set -euo pipefail

SERVICE="${1:-}"

if [ -n "$SERVICE" ]; then
  systemctl --user restart "alf-dev-${SERVICE}.service"
  echo "Restarted alf-dev-${SERVICE}"
else
  systemctl --user restart alf-dev.target
  echo "Restarted alf-dev stack"
fi
