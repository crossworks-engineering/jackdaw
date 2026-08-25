#!/usr/bin/env bash
set -euo pipefail
#
# dev-frontend.sh — run the owner UI detached against a REMOTE brain, no local
# database or server. The setup and the CORS requirements live in
# docs/db-less-dev.md; this script is the `pnpm dev:fe` it describes.
#
# Reads MANTLE_REMOTE from client/web/.env.detached.local (one line:
# MANTLE_REMOTE=https://…), exports it as MANTLE_SERVER_ORIGIN, and execs the
# client dev server. Extra args pass through to `next dev` (e.g. --port 3001).
#
root="$(cd "$(dirname "$0")/.." && pwd)"
envfile="$root/client/web/.env.detached.local"

# Legacy location (pre-carve, when the owner UI lived in the server repo):
# migrate the MANTLE_REMOTE line over on first run and ignore the rest.
legacy="$root/server/web/.env.detached.local"
if [ ! -f "$envfile" ] && [ -f "$legacy" ]; then
  grep '^MANTLE_REMOTE=' "$legacy" > "$envfile" || true
  echo "→ migrated MANTLE_REMOTE from server/web/.env.detached.local"
fi

if [ ! -f "$envfile" ]; then
  echo "✗ $envfile not found" >&2
  echo "  create it with a single line, e.g.:" >&2
  echo "    MANTLE_REMOTE=https://test.crossworks.network" >&2
  echo "  (see docs/db-less-dev.md — the brain must allow your dev origin in" >&2
  echo "   MANTLE_API_CORS_ORIGINS)" >&2
  exit 1
fi

remote="$(grep '^MANTLE_REMOTE=' "$envfile" | tail -1 | cut -d= -f2-)"
if [ -z "$remote" ]; then
  echo "✗ $envfile has no MANTLE_REMOTE line" >&2
  exit 1
fi

echo "→ detached frontend against $remote"
export MANTLE_SERVER_ORIGIN="$remote"
exec pnpm -C "$root/client/web" dev "$@"
