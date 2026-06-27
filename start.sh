#!/usr/bin/env bash
# One-command launcher for EFS Garments (production single-port mode).
# Builds the frontend, seeds the DB if empty, then serves everything on :4000.
set -e

# Node was installed locally under ~/.local/node — make sure it's on PATH.
export PATH="$HOME/.local/node/bin:$PATH"

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "▸ Installing dependencies (first run only)…"
(cd "$ROOT/server" && npm install --silent)
(cd "$ROOT/client" && npm install --silent)

echo "▸ Building frontend…"
(cd "$ROOT/client" && npm run build)

if [ ! -f "$ROOT/server/efs.db" ]; then
  echo "▸ Seeding database…"
  (cd "$ROOT/server" && npm run seed)
fi

echo "▸ Starting EFS on http://localhost:4000"
cd "$ROOT/server" && node index.js
