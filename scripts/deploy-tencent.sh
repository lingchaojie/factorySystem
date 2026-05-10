#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/deploy-tencent.sh user@server-ip [domain]

Examples:
  scripts/deploy-tencent.sh root@1.2.3.4
  scripts/deploy-tencent.sh root@1.2.3.4 factory.example.com

Optional environment variables:
  DEPLOY_BRANCH=factory-mvp
  DEPLOY_REPO_URL=https://github.com/lingchaojie/factorySystem.git
  DEPLOY_APP_DIR=/opt/factory-system/app
  DEPLOY_PUBLIC_HOST=1.2.3.4
  BOOTSTRAP_USERNAME=admin
  BOOTSTRAP_PASSWORD=use-a-fixed-initial-password
  SSH_OPTS="-p 22"
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage >&2
  exit 2
fi

REMOTE_TARGET="$1"
DEPLOY_DOMAIN="${2:-}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-factory-mvp}"
DEPLOY_REPO_URL="${DEPLOY_REPO_URL:-https://github.com/lingchaojie/factorySystem.git}"
DEPLOY_APP_DIR="${DEPLOY_APP_DIR:-/opt/factory-system/app}"
BOOTSTRAP_USERNAME="${BOOTSTRAP_USERNAME:-admin}"
BOOTSTRAP_PASSWORD="${BOOTSTRAP_PASSWORD:-}"

remote_without_user="${REMOTE_TARGET#*@}"
DEPLOY_PUBLIC_HOST="${DEPLOY_PUBLIC_HOST:-${remote_without_user%%:*}}"

shell_quote() {
  printf "%q" "$1"
}

SSH_ARGS=()
if [[ -n "${SSH_OPTS:-}" ]]; then
  # shellcheck disable=SC2206
  SSH_ARGS=(${SSH_OPTS})
fi

echo "Deploying branch ${DEPLOY_BRANCH} to ${REMOTE_TARGET}"

ssh "${SSH_ARGS[@]}" "$REMOTE_TARGET" \
  "DEPLOY_BRANCH=$(shell_quote "$DEPLOY_BRANCH") \
DEPLOY_REPO_URL=$(shell_quote "$DEPLOY_REPO_URL") \
DEPLOY_APP_DIR=$(shell_quote "$DEPLOY_APP_DIR") \
DEPLOY_DOMAIN=$(shell_quote "$DEPLOY_DOMAIN") \
DEPLOY_PUBLIC_HOST=$(shell_quote "$DEPLOY_PUBLIC_HOST") \
BOOTSTRAP_USERNAME=$(shell_quote "$BOOTSTRAP_USERNAME") \
BOOTSTRAP_PASSWORD=$(shell_quote "$BOOTSTRAP_PASSWORD") \
bash -s" <<'REMOTE_SCRIPT'
set -Eeuo pipefail

if [[ "$(id -u)" -eq 0 ]]; then
  SUDO=""
else
  SUDO="sudo"
fi

run_as_root() {
  if [[ -n "$SUDO" ]]; then
    sudo "$@"
  else
    "$@"
  fi
}

configure_registry_mirror() {
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
    echo "Existing $daemon_json found; install python3 or add $mirror manually if Docker Hub pulls are slow." >&2
    return
  fi

  run_as_root systemctl daemon-reload || true
  run_as_root systemctl restart docker || true
}

install_packages() {
  if command -v apt-get >/dev/null 2>&1; then
    run_as_root apt-get update
    run_as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git openssl

    if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
      . /etc/os-release
      if [[ "$ID" != "ubuntu" && "$ID" != "debian" ]]; then
        echo "Unsupported apt-based OS: $ID" >&2
        exit 1
      fi

      run_as_root install -m 0755 -d /etc/apt/keyrings
      run_as_root curl -fsSL "https://mirrors.cloud.tencent.com/docker-ce/linux/${ID}/gpg" -o /etc/apt/keyrings/docker.asc
      run_as_root chmod a+r /etc/apt/keyrings/docker.asc
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://mirrors.cloud.tencent.com/docker-ce/linux/${ID}/ ${VERSION_CODENAME} stable" |
        run_as_root tee /etc/apt/sources.list.d/docker.list >/dev/null
      run_as_root apt-get update
      run_as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    fi
  elif command -v dnf >/dev/null 2>&1; then
    run_as_root dnf install -y git curl openssl
    if ! command -v docker >/dev/null 2>&1; then
      run_as_root dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin --nobest ||
        run_as_root dnf install -y docker
    fi
  elif command -v yum >/dev/null 2>&1; then
    run_as_root yum install -y git curl openssl
    if ! command -v docker >/dev/null 2>&1; then
      run_as_root yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin ||
        run_as_root yum install -y docker
    fi
  else
    echo "Unsupported Linux distribution: expected apt-get, dnf, or yum." >&2
    exit 1
  fi

  configure_registry_mirror
  run_as_root systemctl enable --now docker

  if ! run_as_root docker compose version >/dev/null 2>&1; then
    echo "Docker Compose v2 plugin is not available after installation." >&2
    exit 1
  fi
}

sync_repository() {
  local app_parent
  app_parent="$(dirname "$DEPLOY_APP_DIR")"
  run_as_root mkdir -p "$app_parent"
  run_as_root chown "$(id -u):$(id -g)" "$app_parent"
  if [[ -d "$DEPLOY_APP_DIR" ]]; then
    run_as_root chown -R "$(id -u):$(id -g)" "$DEPLOY_APP_DIR"
  fi

  if [[ ! -d "$DEPLOY_APP_DIR/.git" ]]; then
    rm -rf "$DEPLOY_APP_DIR"
    git clone --branch "$DEPLOY_BRANCH" "$DEPLOY_REPO_URL" "$DEPLOY_APP_DIR"
  else
    git -C "$DEPLOY_APP_DIR" fetch origin "$DEPLOY_BRANCH"
    git -C "$DEPLOY_APP_DIR" checkout "$DEPLOY_BRANCH"
    git -C "$DEPLOY_APP_DIR" reset --hard "origin/$DEPLOY_BRANCH"
  fi
}

write_env_file() {
  local env_file="$DEPLOY_APP_DIR/deploy/production/.env.production"
  local generated_admin_password=""

  if [[ -f "$env_file" ]]; then
    echo "Keeping existing production env: $env_file"
    return
  fi

  local site_address app_origin cookie_secure
  if [[ -n "$DEPLOY_DOMAIN" ]]; then
    site_address="$DEPLOY_DOMAIN"
    app_origin="https://$DEPLOY_DOMAIN"
    cookie_secure="true"
  else
    site_address=":80"
    app_origin="http://$DEPLOY_PUBLIC_HOST"
    cookie_secure="false"
  fi

  local postgres_password
  postgres_password="$(openssl rand -hex 24)"

  if [[ -n "$BOOTSTRAP_PASSWORD" ]]; then
    generated_admin_password="$BOOTSTRAP_PASSWORD"
  else
    generated_admin_password="$(openssl rand -base64 24 | tr -d '\n')"
  fi

  cat >"$env_file" <<ENV
APP_SITE_ADDRESS=$site_address
APP_ORIGIN=$app_origin

POSTGRES_DB=factory
POSTGRES_USER=factory
POSTGRES_PASSWORD=$postgres_password

BOOTSTRAP_WORKSPACE_NAME=CNC Factory
BOOTSTRAP_USERNAME=$BOOTSTRAP_USERNAME
BOOTSTRAP_PASSWORD=$generated_admin_password

SESSION_COOKIE_NAME=factory_session
SESSION_TTL_DAYS=30
SESSION_COOKIE_SECURE=$cookie_secure
ENV

  chmod 600 "$env_file"
  echo "Created production env: $env_file"
  echo "Initial admin username: $BOOTSTRAP_USERNAME"
  echo "Initial admin password: $generated_admin_password"
}

start_stack() {
  cd "$DEPLOY_APP_DIR"
  run_as_root docker compose \
    --env-file deploy/production/.env.production \
    -f deploy/production/docker-compose.yml \
    up -d --build

  run_as_root docker compose \
    --env-file deploy/production/.env.production \
    -f deploy/production/docker-compose.yml \
    ps
}

verify_http() {
  local env_file="$DEPLOY_APP_DIR/deploy/production/.env.production"
  local app_site_address app_origin
  app_site_address="$(sed -n 's/^APP_SITE_ADDRESS=//p' "$env_file" | tail -n 1)"
  app_origin="$(sed -n 's/^APP_ORIGIN=//p' "$env_file" | tail -n 1)"

  local check_url="http://127.0.0.1/login"
  for _ in $(seq 1 30); do
    if [[ "$app_site_address" == ":80" ]]; then
      if curl -fsSI "$check_url" >/dev/null; then
        echo "Deployment URL: $app_origin"
        return
      fi
    elif curl -fsSI -H "Host: ${app_site_address}" "$check_url" >/dev/null; then
      echo "Deployment URL: $app_origin"
      return
    fi

    sleep 2
  done

  echo "Application did not respond through Caddy within 60 seconds." >&2
  exit 1
}

install_packages
sync_repository
write_env_file
start_stack
verify_http
REMOTE_SCRIPT
