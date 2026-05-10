#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/deploy/production/docker-compose.yml"
ENV_FILE="$ROOT_DIR/deploy/production/.env.production"

usage() {
  cat <<'USAGE'
Usage:
  scripts/deploy-production.sh

Rebuilds the production web image from the current checkout and starts db/web/caddy.
Checkout and pull the desired branch before running this script.
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
  die "This deploy script does not accept arguments."
fi

[[ -f "$COMPOSE_FILE" ]] || die "Compose file not found: $COMPOSE_FILE"
[[ -f "$ENV_FILE" ]] || die "Production env file not found: $ENV_FILE"
[[ -f "$ROOT_DIR/Dockerfile" ]] || die "Dockerfile not found: $ROOT_DIR/Dockerfile"

docker_cmd() {
  if docker compose version >/dev/null 2>&1; then
    docker "$@"
    return
  fi

  if command -v sudo >/dev/null 2>&1 && sudo -n docker compose version >/dev/null 2>&1; then
    sudo docker "$@"
    return
  fi

  die "Docker Compose is unavailable or the current user cannot access Docker. Run this script with sudo, or add the user to the docker group and log in again."
}

compose() {
  docker_cmd compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

read_env_value() {
  local key="$1"
  awk -v key="$key" '
    BEGIN { FS = "=" }
    $1 == key {
      sub(/^[^=]*=/, "")
      print
    }
  ' "$ENV_FILE" | tail -n 1 | sed \
    -e 's/^[[:space:]]*//' \
    -e 's/[[:space:]]*$//' \
    -e 's/^"//' \
    -e 's/"$//' \
    -e "s/^'//" \
    -e "s/'$//"
}

print_checkout() {
  local branch commit
  branch="$(git -C "$ROOT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  commit="$(git -C "$ROOT_DIR" rev-parse --short HEAD 2>/dev/null || true)"

  if [[ -n "$branch" || -n "$commit" ]]; then
    echo "Using current checkout: ${branch:-unknown} ${commit:-unknown}"
  fi
}

verify_http() {
  local site_address app_origin
  site_address="$(read_env_value APP_SITE_ADDRESS)"
  app_origin="$(read_env_value APP_ORIGIN)"

  [[ -n "$site_address" ]] || die "APP_SITE_ADDRESS is missing in $ENV_FILE"

  echo "Waiting for application HTTP response..."
  for _ in $(seq 1 60); do
    if [[ "$site_address" == ":80" ]]; then
      if curl -fsSI http://127.0.0.1/login >/dev/null 2>&1; then
        echo "Deployment URL: ${app_origin:-http://127.0.0.1}"
        return
      fi
    elif curl -fsSI -H "Host: ${site_address}" http://127.0.0.1/login >/dev/null 2>&1; then
      echo "Deployment URL: ${app_origin:-$site_address}"
      return
    fi
    sleep 2
  done

  echo "Application did not respond through Caddy within 120 seconds." >&2
  compose ps || true
  compose logs --tail=80 web || true
  exit 1
}

print_checkout

echo "Validating production compose configuration..."
compose config >/dev/null

echo "Starting production database..."
compose up -d db

echo "Rebuilding production web image from current checkout..."
compose build web

echo "Starting production services..."
compose up -d --force-recreate web caddy
compose ps
verify_http

echo "Production deploy finished."
