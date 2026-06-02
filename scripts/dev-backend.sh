#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
PORT="${PORT:-8000}"
DEV_HOST="${DEV_HOST:-0.0.0.0}"

cleanup_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti "tcp:${port}" 2>/dev/null || true)"

  if [[ -n "$pids" ]]; then
    echo "Stopping existing backend listener(s) on port ${port}: ${pids}"
    kill -TERM ${(z)pids} 2>/dev/null || true
    sleep 1

    local remaining
    remaining="$(lsof -ti "tcp:${port}" 2>/dev/null || true)"
    if [[ -n "$remaining" ]]; then
      echo "Force stopping remaining backend listener(s) on port ${port}: ${remaining}"
      kill -KILL ${(z)remaining} 2>/dev/null || true
      sleep 1
    fi
  fi
}

cleanup_port "$PORT"

cd "$BACKEND_DIR"

if [[ -x ".venv/bin/uvicorn" ]]; then
  echo "Starting backend on http://${DEV_HOST}:${PORT} using .venv/bin/uvicorn"
  exec .venv/bin/uvicorn app.main:app --host "$DEV_HOST" --port "$PORT"
fi

echo "Backend virtualenv runner not found, falling back to python3 -m uvicorn"
echo "Starting backend on http://${DEV_HOST}:${PORT}"
exec python3 -m uvicorn app.main:app --host "$DEV_HOST" --port "$PORT"
