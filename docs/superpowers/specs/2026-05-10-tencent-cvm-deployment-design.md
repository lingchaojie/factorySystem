# Tencent CVM Deployment Design

## Goal

Provide a one-command production deployment path for a Tencent Cloud CVM. The deployment should run the existing Next.js app, PostgreSQL, and drawing file storage with Docker Compose, while keeping production secrets on the server instead of in git.

## Recommended Approach

Use a single Linux CVM with Docker Compose:

- `web`: builds this repository with the existing `Dockerfile`.
- `db`: runs PostgreSQL with a named Docker volume.
- `caddy`: terminates HTTP/HTTPS and reverse proxies to `web`.

This keeps the first production deployment small and operationally clear. It also matches the current app architecture and leaves a direct path to split PostgreSQL or drawing storage later.

## Domain Modes

The deployment supports two modes:

- With a domain: `APP_SITE_ADDRESS` is the domain, `APP_ORIGIN` is `https://domain`, and secure cookies are enabled.
- Without a domain: `APP_SITE_ADDRESS` is `:80`, `APP_ORIGIN` is `http://server-ip`, and secure cookies are disabled.

## Secrets

The deploy script generates `deploy/production/.env.production` on the server if it does not exist. It includes the PostgreSQL password and bootstrap admin password. The file is ignored by git and should not be copied into the repository.

On repeated deploys, the script preserves the existing `.env.production` so redeploying code does not reset the bootstrap password.

## Docker Image Pulls

The script configures Docker's Tencent Cloud registry mirror when Docker is installed on the CVM. This reduces pull failures for `postgres`, `node`, and `caddy` images in mainland network conditions.

## Data Persistence

Production data is stored in Docker named volumes:

- `factory-postgres-data`: PostgreSQL database files.
- `factory-order-drawings-data`: uploaded order drawings.
- `factory-caddy-data`: Caddy certificates.
- `factory-caddy-config`: Caddy runtime config.

## Operational Notes

Tencent Cloud security groups should allow inbound `22`, `80`, and `443`. The database port is not published in production. Backups should export PostgreSQL with `pg_dump` and archive the drawing volume.
