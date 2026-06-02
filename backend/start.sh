#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR"

PORT="${PORT:-8000}"

if command -v uvicorn >/dev/null 2>&1; then
  exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
fi

exec python3 -m uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
