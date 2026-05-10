# Tencent Cloud CVM Deployment

This guide deploys Factory System to one Tencent Cloud Linux CVM with Docker Compose.

## CVM Requirements

- OS: Ubuntu 22.04 or Ubuntu 24.04 is recommended.
- Security group inbound rules:
  - `22/tcp` for SSH
  - `80/tcp` for HTTP
  - `443/tcp` for HTTPS
- For domain-based HTTPS, create a DNS A record pointing the domain to the CVM public IP before deployment.

The production database port is not exposed publicly.

## First Deploy

Deploy with only the public IP:

```bash
scripts/deploy-tencent.sh root@1.2.3.4
```

Deploy with a domain and automatic HTTPS:

```bash
scripts/deploy-tencent.sh root@1.2.3.4 factory.example.com
```

The script installs Docker, clones this repository into `/opt/factory-system/app`, creates `deploy/production/.env.production` on the server, builds the app image, and starts the stack.

On Tencent Cloud CVMs, the script also configures Docker's Tencent Cloud registry mirror at `https://mirror.ccs.tencentyun.com` to reduce Docker Hub pull timeouts.

The first run prints the initial admin username and password. Save that password. Later deploys preserve the existing `.env.production` and do not print or reset it.

If you already SSH'd into the server and cloned the repository, you can deploy from the server itself:

```bash
cd /opt/factory-system/app
scripts/deploy-production.sh --public-host 1.2.3.4
```

With a domain:

```bash
cd /opt/factory-system/app
scripts/deploy-production.sh --domain factory.example.com
```

This server-side script installs Docker on Ubuntu/Debian if needed, creates `deploy/production/.env.production` on first run, builds images, starts `db/web/caddy`, and checks `/login`.

## Redeploy

Run the same command again:

```bash
scripts/deploy-tencent.sh root@1.2.3.4 factory.example.com
```

Or, from the server repository directory:

```bash
cd /opt/factory-system/app
scripts/deploy-production.sh
```

The script fetches the latest `main` branch and restarts the stack.

To deploy a different branch:

```bash
DEPLOY_BRANCH=factory-mvp scripts/deploy-tencent.sh root@1.2.3.4 factory.example.com
```

## Server Paths

- App repository: `/opt/factory-system/app`
- Production env: `/opt/factory-system/app/deploy/production/.env.production`
- Compose file: `/opt/factory-system/app/deploy/production/docker-compose.yml`

## Useful Server Commands

```bash
cd /opt/factory-system/app
sudo docker compose --env-file deploy/production/.env.production -f deploy/production/docker-compose.yml ps
sudo docker compose --env-file deploy/production/.env.production -f deploy/production/docker-compose.yml logs -f web
sudo docker compose --env-file deploy/production/.env.production -f deploy/production/docker-compose.yml logs -f db
sudo docker compose --env-file deploy/production/.env.production -f deploy/production/docker-compose.yml logs -f caddy
```

## Backup

Create a PostgreSQL dump:

```bash
cd /opt/factory-system/app
sudo docker compose --env-file deploy/production/.env.production -f deploy/production/docker-compose.yml exec -T db pg_dump -U factory factory > factory-$(date +%F).sql
```

Archive uploaded drawings:

```bash
sudo docker run --rm -v factory-system-order-drawings-data:/data -v "$PWD":/backup alpine tar czf /backup/order-drawings-$(date +%F).tgz -C /data .
```

## Clear Production Data

The repository includes a guarded production clear script. It creates a database backup first, stops the web service, clears data, and starts services again.

Clear only business data while keeping the bootstrap workspace/user:

```bash
cd /opt/factory-system/app
scripts/clear-production-db.sh --confirm CLEAR_PRODUCTION_DB
```

Fully reset app data, including users/workspaces, then recreate the bootstrap account from `deploy/production/.env.production`:

```bash
cd /opt/factory-system/app
scripts/clear-production-db.sh --mode all --confirm CLEAR_PRODUCTION_DB
```

By default the script also clears uploaded drawing files, because drawing metadata is removed from the database. Add `--keep-drawings` to keep the files volume.

## Restore Notes

Restore database dumps only after stopping the `web` service:

```bash
cd /opt/factory-system/app
sudo docker compose --env-file deploy/production/.env.production -f deploy/production/docker-compose.yml stop web
cat factory-2026-05-10.sql | sudo docker compose --env-file deploy/production/.env.production -f deploy/production/docker-compose.yml exec -T db psql -U factory factory
sudo docker compose --env-file deploy/production/.env.production -f deploy/production/docker-compose.yml start web
```
