#!/usr/bin/env bash
# Deploy frontend: pull, install deps, rebuild. Nginx serves static files — no restart needed.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE not found. Run install.sh first."
  exit 1
fi

echo "==> Pulling latest..."
cd "$REPO_ROOT"
git pull

echo "==> Installing frontend dependencies..."
cd "$REPO_ROOT/frontend"
pnpm install --frozen-lockfile

echo "==> Building frontend..."
# Source env so VITE_* vars are baked into the build
set -a; source "$ENV_FILE"; set +a
pnpm build

echo "==> Done. Nginx serves frontend/dist — no restart needed."
