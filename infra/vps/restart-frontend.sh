#!/usr/bin/env bash
# Deploy frontend: pull, install deps, rebuild. Nginx serves static files — no restart needed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "==> Pulling latest..."
cd "$REPO_ROOT"
git pull

echo "==> Installing frontend dependencies..."
cd "$REPO_ROOT/frontend"
pnpm install --frozen-lockfile

echo "==> Building frontend..."
pnpm build

echo "==> Done. Nginx serves frontend/dist — no restart needed."
