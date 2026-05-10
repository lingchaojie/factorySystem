#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/deploy/production/docker-compose.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/deploy/production/.env.production}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"

MODE="business"
CONFIRM=""
SKIP_BACKUP="false"
KEEP_DRAWINGS="false"

usage() {
  cat <<'USAGE'
Usage:
  scripts/clear-production-db.sh --confirm CLEAR_PRODUCTION_DB [options]

Options:
  --mode business      Clear business data only. Keeps Workspace/User. Default.
  --mode all           Clear all app data, including users/workspaces.
                       The web container will seed the bootstrap account again.
  --skip-backup        Do not create a pg_dump before clearing.
  --keep-drawings      Keep uploaded drawing files in the Docker volume.
  --env-file PATH      Production env file. Default: deploy/production/.env.production
  --compose-file PATH  Production compose file. Default: deploy/production/docker-compose.yml
  --backup-dir PATH    Backup output directory. Default: backups/
  -h, --help           Show this help.

Examples:
  # Clear orders, machines, records, drawings metadata, sessions; keep accounts.
  scripts/clear-production-db.sh --confirm CLEAR_PRODUCTION_DB

  # Full reset: clear all app tables and recreate bootstrap admin on restart.
  scripts/clear-production-db.sh --mode all --confirm CLEAR_PRODUCTION_DB

Environment overrides:
  ENV_FILE=/path/.env.production COMPOSE_FILE=/path/docker-compose.yml scripts/clear-production-db.sh --confirm CLEAR_PRODUCTION_DB
USAGE
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    --confirm)
      CONFIRM="${2:-}"
      shift 2
      ;;
    --skip-backup)
      SKIP_BACKUP="true"
      shift
      ;;
    --keep-drawings)
      KEEP_DRAWINGS="true"
      shift
      ;;
    --env-file)
      ENV_FILE="${2:-}"
      shift 2
      ;;
    --compose-file)
      COMPOSE_FILE="${2:-}"
      shift 2
      ;;
    --backup-dir)
      BACKUP_DIR="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

[[ "$CONFIRM" == "CLEAR_PRODUCTION_DB" ]] || die "Missing confirmation. Pass: --confirm CLEAR_PRODUCTION_DB"
[[ "$MODE" == "business" || "$MODE" == "all" ]] || die "--mode must be business or all"
[[ -f "$COMPOSE_FILE" ]] || die "Compose file not found: $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || die "Env file not found: $ENV_FILE"

env_value() {
  local key="$1"
  awk -v key="$key" '
    $0 ~ "^[[:space:]]*" key "=" {
      sub("^[[:space:]]*" key "=", "")
      print
      exit
    }
  ' "$ENV_FILE"
}

POSTGRES_DB="${POSTGRES_DB:-$(env_value POSTGRES_DB)}"
POSTGRES_USER="${POSTGRES_USER:-$(env_value POSTGRES_USER)}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(env_value POSTGRES_PASSWORD)}"

[[ -n "$POSTGRES_DB" ]] || die "POSTGRES_DB is required in env file"
[[ -n "$POSTGRES_USER" ]] || die "POSTGRES_USER is required in env file"
[[ -n "$POSTGRES_PASSWORD" ]] || die "POSTGRES_PASSWORD is required in env file"

if docker compose version >/dev/null 2>&1; then
  DOCKER=(docker)
elif sudo docker compose version >/dev/null 2>&1; then
  DOCKER=(sudo docker)
else
  die "Docker Compose is not available"
fi

compose() {
  "${DOCKER[@]}" compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

wait_for_db() {
  echo "Waiting for production database to be ready..."
  for _ in $(seq 1 60); do
    if compose exec -T db pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  die "Database did not become ready"
}

timestamp="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "Using compose file: $COMPOSE_FILE"
echo "Using env file:     $ENV_FILE"
echo "Clear mode:         $MODE"

compose up -d db
wait_for_db

if [[ "$SKIP_BACKUP" != "true" ]]; then
  backup_file="$BACKUP_DIR/factory-pre-clear-$timestamp.sql"
  echo "Creating database backup: $backup_file"
  compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" >"$backup_file"
  chmod 600 "$backup_file"
else
  echo "Skipping database backup because --skip-backup was provided"
fi

echo "Stopping web service before clearing data..."
compose stop web >/dev/null 2>&1 || true

if [[ "$MODE" == "business" ]]; then
  echo "Clearing business data and preserving accounts..."
  compose exec -T db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB" <<'SQL'
BEGIN;
UPDATE "Machine" SET "currentOrderId" = NULL;
TRUNCATE TABLE
  "Session",
  "ProductionRecord",
  "OrderDrawing",
  "Machine",
  "Order"
RESTART IDENTITY CASCADE;
COMMIT;
SQL
else
  echo "Clearing all app data..."
  compose exec -T db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB" <<'SQL'
BEGIN;
TRUNCATE TABLE
  "Session",
  "ProductionRecord",
  "OrderDrawing",
  "Machine",
  "Order",
  "User",
  "Workspace"
RESTART IDENTITY CASCADE;
COMMIT;
SQL
fi

if [[ "$KEEP_DRAWINGS" != "true" ]]; then
  echo "Clearing uploaded drawing files volume..."
  compose run --rm --no-deps web sh -lc 'find /app/storage/order-drawings -mindepth 1 -maxdepth 1 -exec rm -rf {} +'
else
  echo "Keeping uploaded drawing files because --keep-drawings was provided"
fi

echo "Starting production services..."
compose up -d web caddy

echo "Done."
echo "Check services with:"
echo "  docker compose --env-file deploy/production/.env.production -f deploy/production/docker-compose.yml ps"
