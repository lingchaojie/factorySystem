# Production Port Isolation Decision

Date: 2026-05-11

This note records why Factory System production no longer binds host ports `80` and `443` by default.

## Background

Factory System and FA WebFin may be deployed on the same server or cluster while the Factory System production site is accessed directly by public IP, for example `http://SERVER_IP/login`.

Without a domain or a shared reverse proxy, two applications cannot both own `SERVER_IP:80`. The first container binding `80:80` blocks the other one. The old Factory System production compose file also lived under `deploy/production`, so Docker Compose derived the default project name `production`, which can collide with another app using the same directory name.

## Decision

Factory System now avoids the shared `80/443` host ports by default:

```env
APP_SITE_ADDRESS=:80
APP_ORIGIN=http://SERVER_IP:18080
APP_HTTP_PORT=18080
APP_HTTPS_PORT=18443
SESSION_COOKIE_SECURE=false
```

The internal Caddy container still listens on `:80`. Docker publishes it to host port `18080`, so the production URL becomes:

```text
http://SERVER_IP:18080/login
http://SERVER_IP:18080/admin/login
```

The production Docker Compose project name is fixed to `factory-system` to avoid project-name collisions with other stacks.

## Files Changed

- `deploy/production/docker-compose.yml`
  - Adds `name: factory-system`.
  - Publishes Caddy with `${APP_HTTP_PORT:-18080}:80`.
  - Publishes Caddy HTTPS with `${APP_HTTPS_PORT:-18443}:443`.
- `deploy/production/.env.production.example`
  - Defaults to bare-IP HTTP on `18080`.
  - Sets `SESSION_COOKIE_SECURE=false` for HTTP deployments.
- `deploy/prod.sh` and `scripts/deploy-production.sh`
  - Health-check `http://127.0.0.1:${APP_HTTP_PORT}/login`.
  - Stop the legacy Factory System `production` compose project only when Docker labels show its working directory is this repository's `deploy/production` path.
- `docs/deployment/tencent-cvm.md` and `docs/project-current-state.md`
  - Document the `18080` deployment shape and Tencent Cloud security-group requirement.

Implemented in:

- `1bc78b4 chore: isolate factory production ports`
- `0be124c chore: stop legacy factory compose stack`

## Tencent Cloud Requirement

For the current bare-IP setup, open inbound `18080/tcp` in the Tencent Cloud security group.

`80/tcp` and `443/tcp` only need to be opened for Factory System if Factory System owns those normal HTTP/HTTPS ports or a shared gateway forwards traffic to it.

## Future Changes

If Factory System is later moved to a separate server, it can own normal HTTP/HTTPS ports again:

```env
APP_SITE_ADDRESS=:80
APP_ORIGIN=http://SERVER_IP
APP_HTTP_PORT=80
APP_HTTPS_PORT=443
SESSION_COOKIE_SECURE=false
```

If a domain and HTTPS are added directly to Factory System:

```env
APP_SITE_ADDRESS=factory.example.com
APP_ORIGIN=https://factory.example.com
APP_HTTP_PORT=80
APP_HTTPS_PORT=443
SESSION_COOKIE_SECURE=true
```

If multiple applications stay on the same server and should share standard ports, put them behind one shared reverse proxy or gateway. In that model, Factory System should not publish `80/443` directly; the shared gateway should route by domain or path to Factory System's internal service.
