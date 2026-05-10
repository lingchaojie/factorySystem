#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/deploy/production/docker-compose.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/deploy/production/.env.production}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"

CONFIRM=""
SKIP_BACKUP="false"
KEEP_DRAWINGS="false"

usage() {
  cat <<'USAGE'
Usage:
  scripts/clear-production-factory-data.sh --confirm CLEAR_FACTORY_DATA [options]

Deletes all factory business data across every customer factory:
  - machines
  - orders
  - production records
  - drawing metadata
  - uploaded drawing files, unless --keep-drawings is provided

Preserves customer accounts, platform admins, workspaces, and login sessions.

Options:
  --skip-backup        Do not create a pg_dump before clearing.
  --keep-drawings      Keep uploaded drawing files in the Docker volume.
  --env-file PATH      Production env file. Default: deploy/production/.env.production
  --compose-file PATH  Production compose file. Default: deploy/production/docker-compose.yml
  --backup-dir PATH    Backup output directory. Default: backups/
  -h, --help           Show this help.

Example:
  scripts/clear-production-factory-data.sh --confirm CLEAR_FACTORY_DATA
USAGE
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
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

[[ "$CONFIRM" == "CLEAR_FACTORY_DATA" ]] || die "Missing confirmation. Pass: --confirm CLEAR_FACTORY_DATA"
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
echo "Clear scope:        machines, orders, production records, drawings"
echo "Preserving:         accounts, workspaces, platform admins, login sessions"

compose up -d db
wait_for_db

if [[ "$SKIP_BACKUP" != "true" ]]; then
  backup_file="$BACKUP_DIR/factory-data-pre-clear-$timestamp.sql"
  echo "Creating database backup: $backup_file"
  compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" >"$backup_file"
  chmod 600 "$backup_file"
else
  echo "Skipping database backup because --skip-backup was provided"
fi

echo "Stopping web service before clearing factory data..."
compose stop web >/dev/null 2>&1 || true

echo "Clearing factory machines, orders, production records, and drawing metadata..."
compose exec -T db psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB" <<'SQL'
BEGIN;
UPDATE "Machine" SET "currentOrderId" = NULL;
TRUNCATE TABLE
  "ProductionRecord",
  "OrderDrawing",
  "Machine",
  "Order"
RESTART IDENTITY CASCADE;
COMMIT;
SQL

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
