#!/usr/bin/env sh
# One-command local start (frontend-devops-conventions.md § Project Setup):
# installs from the lockfile, starts the Pre-Contract mock API on :4010, then
# the dev server on :3000. Ctrl-C stops both.
set -eu
cd "$(dirname "$0")"

corepack enable
if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo "Created .env.local from .env.example (local values, mock API)."
fi
pnpm install --frozen-lockfile

MOCK_API_PORT=4010 MOCK_API_ALLOWED_ORIGINS=http://localhost:3000 pnpm mock:api &
mock_pid=$!
trap 'kill "$mock_pid" 2>/dev/null || true' EXIT INT TERM

pnpm dev
