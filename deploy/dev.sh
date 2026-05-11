#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
ENV_EXAMPLE="$ROOT_DIR/.env.example"
APP_PORT="${APP_PORT:-3000}"
STOP_EXISTING_DEV_SERVER="${STOP_EXISTING_DEV_SERVER:-true}"

usage() {
  cat <<'USAGE'
Usage:
  deploy/dev.sh

Starts Factory System for local WSL development without Docker.
Uses .env when present; otherwise copies .env.example to .env first.

Optional environment variables:
  APP_PORT=3000
  STOP_EXISTING_DEV_SERVER=true
USAGE
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -ne 0 ]]; then
  usage >&2
  die "This dev script does not accept arguments."
fi

[[ -f "$ROOT_DIR/package.json" ]] || die "package.json not found: $ROOT_DIR/package.json"

if [[ ! -f "$ENV_FILE" ]]; then
  [[ -f "$ENV_EXAMPLE" ]] || die "Env file not found: $ENV_FILE and example not found: $ENV_EXAMPLE"
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  echo "Created local env file from example: $ENV_FILE"
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

print_checkout() {
  local branch commit
  branch="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  commit="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || true)"

  if [[ -n "$branch" || -n "$commit" ]]; then
    echo "Using current checkout: ${branch:-unknown} ${commit:-unknown}"
  fi
}

stop_existing_port() {
  [[ "$STOP_EXISTING_DEV_SERVER" == "true" ]] || return

  if ! command -v lsof >/dev/null 2>&1; then
    return
  fi

  local pids
  pids="$(lsof -ti :"$APP_PORT" 2>/dev/null || true)"
  [[ -n "$pids" ]] || return

  echo "Stopping process(es) currently listening on port $APP_PORT: $pids"
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  sleep 1
}

ensure_node_modules() {
  if [[ -d "$ROOT_DIR/node_modules" ]]; then
    return
  fi

  echo "node_modules not found. Installing dependencies with npm ci..."
  npm ci
}

check_database() {
  echo "Checking database connection..."
  if ! npx prisma migrate deploy; then
    cat >&2 <<EOF

Database setup failed.
Check DATABASE_URL in $ENV_FILE and make sure PostgreSQL is running.
Current DATABASE_URL: ${DATABASE_URL:-unset}
EOF
    exit 1
  fi
}

cd "$ROOT_DIR"

print_checkout
ensure_node_modules
check_database

echo "Seeding local bootstrap data..."
npm run db:seed

stop_existing_port

echo "Starting local dev server..."
echo "Local URL: ${APP_ORIGIN:-http://localhost:$APP_PORT}"
exec npm run dev -- --port "$APP_PORT"
