#!/usr/bin/env bash
# Deploy relay: pull, install deps, restart service.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "==> Pulling latest..."
cd "$REPO_ROOT"
git pull

echo "==> Installing relay dependencies..."
cd "$REPO_ROOT/relay"
pnpm install --frozen-lockfile

echo "==> Restarting alf-relay..."
sudo systemctl restart alf-relay

echo "==> Done."
sudo systemctl status alf-relay --no-pager
