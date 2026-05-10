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

## Redeploy

Run the same command again:

```bash
scripts/deploy-tencent.sh root@1.2.3.4 factory.example.com
```

The script fetches the latest `factory-mvp` branch and restarts the stack.

To deploy a different branch:

```bash
DEPLOY_BRANCH=main scripts/deploy-tencent.sh root@1.2.3.4 factory.example.com
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

## Restore Notes

Restore database dumps only after stopping the `web` service:

```bash
cd /opt/factory-system/app
sudo docker compose --env-file deploy/production/.env.production -f deploy/production/docker-compose.yml stop web
cat factory-2026-05-10.sql | sudo docker compose --env-file deploy/production/.env.production -f deploy/production/docker-compose.yml exec -T db psql -U factory factory
sudo docker compose --env-file deploy/production/.env.production -f deploy/production/docker-compose.yml start web
```
