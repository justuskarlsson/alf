#!/usr/bin/env bash
# Usage: logs.sh [relay|backend|frontend]  (default: all, interleaved)
set -euo pipefail

SERVICE="${1:-}"

if [ -n "$SERVICE" ]; then
  journalctl --user -u "alf-dev-${SERVICE}.service" -f
else
  journalctl --user -u "alf-dev-relay.service" -u "alf-dev-backend.service" -u "alf-dev-frontend.service" -f
fi
