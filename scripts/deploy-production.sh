#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/deploy/production/docker-compose.yml}"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/deploy/production/.env.production}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
BOOTSTRAP_USERNAME="${BOOTSTRAP_USERNAME:-admin}"
BOOTSTRAP_PASSWORD="${BOOTSTRAP_PASSWORD:-}"
ORIGINAL_ARGS=("$@")
DEPLOY_REEXECED="${DEPLOY_REEXECED:-false}"

DEPLOY_DOMAIN=""
DEPLOY_PUBLIC_HOST=""
SKIP_PULL="false"
SKIP_VERIFY="false"

usage() {
  cat <<'USAGE'
Usage:
  scripts/deploy-production.sh [options]

First deploy examples:
  scripts/deploy-production.sh --domain factory.example.com
  scripts/deploy-production.sh --public-host 1.2.3.4

Redeploy existing production stack:
  scripts/deploy-production.sh

Options:
  --domain DOMAIN        Use HTTPS domain mode. Creates APP_ORIGIN=https://DOMAIN.
  --public-host HOST     Use public IP/host HTTP mode. Creates APP_ORIGIN=http://HOST.
  --branch BRANCH        Git branch to deploy. Default: main.
  --skip-pull            Deploy current checkout without git fetch/reset.
  --skip-verify          Do not wait for /login HTTP check after compose up.
  --env-file PATH        Production env file. Default: deploy/production/.env.production.
  --compose-file PATH    Production compose file. Default: deploy/production/docker-compose.yml.
  -h, --help             Show this help.

Environment:
  BOOTSTRAP_USERNAME=admin
  BOOTSTRAP_PASSWORD=optional-fixed-initial-password
  DEPLOY_BRANCH=main
USAGE
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)
      DEPLOY_DOMAIN="${2:-}"
      shift 2
      ;;
    --public-host)
      DEPLOY_PUBLIC_HOST="${2:-}"
      shift 2
      ;;
    --branch)
      DEPLOY_BRANCH="${2:-}"
      shift 2
      ;;
    --skip-pull)
      SKIP_PULL="true"
      shift
      ;;
    --skip-verify)
      SKIP_VERIFY="true"
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
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

[[ -f "$COMPOSE_FILE" ]] || die "Compose file not found: $COMPOSE_FILE"
[[ -f "$ROOT_DIR/Dockerfile" ]] || die "Dockerfile not found: $ROOT_DIR/Dockerfile"
if [[ -n "$DEPLOY_DOMAIN" && -n "$DEPLOY_PUBLIC_HOST" ]]; then
  die "Use either --domain or --public-host, not both"
fi

if [[ "$(id -u)" -eq 0 ]]; then
  SUDO=()
else
  SUDO=(sudo)
fi

run_as_root() {
  if [[ "${#SUDO[@]}" -gt 0 ]]; then
    sudo "$@"
  else
    "$@"
  fi
}

configure_tencent_docker_mirror() {
  local daemon_json="/etc/docker/daemon.json"
  local mirror="https://mirror.ccs.tencentyun.com"

  run_as_root mkdir -p /etc/docker
  if [[ ! -f "$daemon_json" ]]; then
    cat <<JSON | run_as_root tee "$daemon_json" >/dev/null
{
  "registry-mirrors": [
    "$mirror"
  ]
}
JSON
  elif grep -q "$mirror" "$daemon_json"; then
    return
  elif command -v python3 >/dev/null 2>&1; then
    local tmp_file
    tmp_file="$(mktemp)"
    python3 - "$daemon_json" "$mirror" >"$tmp_file" <<'PY'
import json
import sys

path, mirror = sys.argv[1], sys.argv[2]
with open(path, "r", encoding="utf-8") as fh:
    data = json.load(fh)
mirrors = data.setdefault("registry-mirrors", [])
if mirror not in mirrors:
    mirrors.append(mirror)
json.dump(data, sys.stdout, indent=2)
sys.stdout.write("\n")
PY
    run_as_root cp "$daemon_json" "${daemon_json}.bak.$(date +%Y%m%d%H%M%S)"
    run_as_root install -m 0644 "$tmp_file" "$daemon_json"
    rm -f "$tmp_file"
  else
    echo "Docker daemon config exists; skipped automatic mirror update because python3 is unavailable." >&2
    return
  fi

  run_as_root systemctl daemon-reload || true
  run_as_root systemctl restart docker || true
}

ensure_docker() {
  if command -v docker >/dev/null 2>&1; then
    if docker compose version >/dev/null 2>&1 || run_as_root docker compose version >/dev/null 2>&1; then
      return
    fi
  fi

  if ! command -v apt-get >/dev/null 2>&1; then
    die "Docker Compose is missing. Install Docker Compose v2 first, then rerun this script."
  fi

  echo "Installing Docker and Docker Compose plugin..."
  run_as_root apt-get update
  run_as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git openssl python3

  # shellcheck disable=SC1091
  . /etc/os-release
  [[ "$ID" == "ubuntu" || "$ID" == "debian" ]] || die "Unsupported apt-based OS: $ID"

  run_as_root install -m 0755 -d /etc/apt/keyrings
  run_as_root curl -fsSL "https://mirrors.cloud.tencent.com/docker-ce/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
  run_as_root chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://mirrors.cloud.tencent.com/docker-ce/linux/${ID}/ ${VERSION_CODENAME} stable" |
    run_as_root tee /etc/apt/sources.list.d/docker.list >/dev/null
  run_as_root apt-get update
  run_as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

  configure_tencent_docker_mirror
  run_as_root systemctl enable --now docker
  docker compose version >/dev/null 2>&1 || run_as_root docker compose version >/dev/null 2>&1 ||
    die "Docker Compose v2 is not available after installation"
}

docker_cmd() {
  if docker compose version >/dev/null 2>&1; then
    docker "$@"
  else
    run_as_root docker "$@"
  fi
}

detect_public_host() {
  local detected=""
  detected="$(curl -fsS --max-time 8 https://api.ipify.org 2>/dev/null || true)"
  if [[ -n "$detected" ]]; then
    printf "%s" "$detected"
    return
  fi
  hostname -I | awk '{print $1}'
}

write_env_file() {
  if [[ -f "$ENV_FILE" ]]; then
    echo "Keeping existing production env: $ENV_FILE"
    return
  fi

  local site_address app_origin cookie_secure
  if [[ -n "$DEPLOY_DOMAIN" ]]; then
    site_address="$DEPLOY_DOMAIN"
    app_origin="https://$DEPLOY_DOMAIN"
    cookie_secure="true"
  else
    if [[ -z "$DEPLOY_PUBLIC_HOST" ]]; then
      DEPLOY_PUBLIC_HOST="$(detect_public_host)"
      [[ -n "$DEPLOY_PUBLIC_HOST" ]] || die "Could not detect public host. Pass --public-host 1.2.3.4 or --domain example.com."
      echo "Detected public host: $DEPLOY_PUBLIC_HOST"
    fi
    site_address=":80"
    app_origin="http://$DEPLOY_PUBLIC_HOST"
    cookie_secure="false"
  fi

  local postgres_password admin_password
  postgres_password="$(openssl rand -hex 24)"
  if [[ -n "$BOOTSTRAP_PASSWORD" ]]; then
    admin_password="$BOOTSTRAP_PASSWORD"
  else
    admin_password="$(openssl rand -base64 24 | tr -d '\n')"
  fi

  mkdir -p "$(dirname "$ENV_FILE")"
  cat >"$ENV_FILE" <<ENV
APP_SITE_ADDRESS=$site_address
APP_ORIGIN=$app_origin

POSTGRES_DB=factory
POSTGRES_USER=factory
POSTGRES_PASSWORD=$postgres_password

BOOTSTRAP_WORKSPACE_NAME=CNC Factory
BOOTSTRAP_USERNAME=$BOOTSTRAP_USERNAME
BOOTSTRAP_PASSWORD=$admin_password

SESSION_COOKIE_NAME=factory_session
SESSION_TTL_DAYS=30
SESSION_COOKIE_SECURE=$cookie_secure
ENV
  chmod 600 "$ENV_FILE"

  echo "Created production env: $ENV_FILE"
  echo "Initial admin username: $BOOTSTRAP_USERNAME"
  echo "Initial admin password: $admin_password"
}

sync_repository() {
  if [[ "$SKIP_PULL" == "true" ]]; then
    echo "Skipping git pull/reset."
    return
  fi

  if [[ ! -d "$ROOT_DIR/.git" ]]; then
    echo "Current directory is not a Git checkout; skipping git pull/reset."
    return
  fi

  echo "Deploying branch: $DEPLOY_BRANCH"
  git -C "$ROOT_DIR" fetch origin "$DEPLOY_BRANCH"
  git -C "$ROOT_DIR" checkout "$DEPLOY_BRANCH"
  git -C "$ROOT_DIR" reset --hard "origin/$DEPLOY_BRANCH"

  if [[ "$DEPLOY_REEXECED" != "true" ]]; then
    echo "Repository updated; restarting deploy script from refreshed checkout."
    exec env DEPLOY_REEXECED=true "$ROOT_DIR/scripts/deploy-production.sh" "${ORIGINAL_ARGS[@]}" --skip-pull
  fi
}

compose() {
  docker_cmd compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

verify_http() {
  [[ "$SKIP_VERIFY" == "false" ]] || return

  local site_address app_origin
  site_address="$(sed -n 's/^APP_SITE_ADDRESS=//p' "$ENV_FILE" | tail -n 1)"
  app_origin="$(sed -n 's/^APP_ORIGIN=//p' "$ENV_FILE" | tail -n 1)"

  echo "Waiting for application HTTP response..."
  for _ in $(seq 1 60); do
    if [[ "$site_address" == ":80" ]]; then
      if curl -fsSI http://127.0.0.1/login >/dev/null 2>&1; then
        echo "Deployment URL: $app_origin"
        return
      fi
    elif curl -fsSI -H "Host: ${site_address}" http://127.0.0.1/login >/dev/null 2>&1; then
      echo "Deployment URL: $app_origin"
      return
    fi
    sleep 2
  done

  echo "Application did not respond through Caddy within 120 seconds." >&2
  compose ps || true
  compose logs --tail=80 web || true
  exit 1
}

ensure_docker
sync_repository
write_env_file

echo "Starting production stack..."
compose up -d --build
compose ps
verify_http

echo "Production deploy finished."
