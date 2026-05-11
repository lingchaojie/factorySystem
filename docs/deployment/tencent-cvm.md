# Tencent Cloud CVM Deployment

This guide deploys Factory System to one Tencent Cloud Linux CVM with Docker Compose.

## CVM Requirements

- OS: Ubuntu 22.04 or Ubuntu 24.04 is recommended.
- Docker Engine with Docker Compose v2 installed.
- Security group inbound rules:
  - `22/tcp` for SSH
  - `18080/tcp` for bare-IP Factory System HTTP access
  - `80/tcp` and `443/tcp` only if Factory System owns the normal HTTP/HTTPS ports
- For domain-based HTTPS, create a DNS A record pointing the domain to the CVM public IP before deployment.

The production database port is not exposed publicly.
The default Factory System production stack publishes Caddy on host port `18080` so it can run on the same server as another app using `80/443`.

## First Deploy

SSH into the server, clone the repository, checkout the branch you want to run, and create the production env file:

```bash
git clone https://github.com/lingchaojie/factorySystem.git ~/FactorySystem
cd ~/FactorySystem
git checkout main
cp deploy/production/.env.production.example deploy/production/.env.production
nano deploy/production/.env.production
```

For public-IP HTTP deploys, use this shape:

```env
APP_SITE_ADDRESS=:80
APP_ORIGIN=http://1.2.3.4:18080
APP_HTTP_PORT=18080
APP_HTTPS_PORT=18443
SESSION_COOKIE_SECURE=false
```

Open `http://1.2.3.4:18080/login` after deployment.

For domain HTTPS deploys, use this shape after DNS points to the CVM:

```env
APP_SITE_ADDRESS=factory.example.com
APP_ORIGIN=https://factory.example.com
APP_HTTP_PORT=80
APP_HTTPS_PORT=443
SESSION_COOKIE_SECURE=true
```

Only use the domain HTTPS shape when Factory System is allowed to bind host ports `80` and `443`. If another app already owns those ports on the same server, keep Factory System on `18080` or put both apps behind one shared reverse proxy.

Set `POSTGRES_PASSWORD` and `PLATFORM_ADMIN_PASSWORD` to strong private values. `PLATFORM_ADMIN_USERNAME`, `PLATFORM_ADMIN_DISPLAY_NAME`, and `PLATFORM_ADMIN_PASSWORD` create or update the `/admin` platform operator account when the web container starts.

Start the production stack:

```bash
scripts/deploy-production.sh
```

The script uses the current checkout, validates `deploy/production/.env.production`, starts the database, rebuilds the `web` image, starts `web/caddy`, and checks `/login`.

## Redeploy

Pull the branch you want to run, then run the same deploy command:

```bash
cd ~/FactorySystem
git fetch origin
git checkout main
git pull --ff-only origin main
scripts/deploy-production.sh
```

To deploy another branch, checkout that branch first:

```bash
cd ~/FactorySystem
git checkout some-branch
git pull --ff-only origin some-branch
scripts/deploy-production.sh
```

The deploy script does not run git commands. It always rebuilds from the code currently checked out on disk.

## Server Paths

- App repository example: `~/FactorySystem`
- Production env: `~/FactorySystem/deploy/production/.env.production`
- Compose file: `~/FactorySystem/deploy/production/docker-compose.yml`

## Useful Server Commands

```bash
cd ~/FactorySystem
sudo docker compose --env-file deploy/production/.env.production -f deploy/production/docker-compose.yml ps
sudo docker compose --env-file deploy/production/.env.production -f deploy/production/docker-compose.yml logs -f web
sudo docker compose --env-file deploy/production/.env.production -f deploy/production/docker-compose.yml logs -f db
sudo docker compose --env-file deploy/production/.env.production -f deploy/production/docker-compose.yml logs -f caddy
```

## Backup

Create a PostgreSQL dump:

```bash
cd ~/FactorySystem
sudo docker compose --env-file deploy/production/.env.production -f deploy/production/docker-compose.yml exec -T db pg_dump -U factory factory > factory-$(date +%F).sql
```

Archive uploaded drawings:

```bash
sudo docker run --rm -v factory-system-order-drawings-data:/data -v "$PWD":/backup alpine tar czf /backup/order-drawings-$(date +%F).tgz -C /data .
```

## Clear Production Data

The repository includes a guarded production clear script. It creates a database backup first, stops the web service, clears data, and starts services again.

Clear only business data while keeping workspaces and customer accounts:

```bash
cd ~/FactorySystem
scripts/clear-production-db.sh --confirm CLEAR_PRODUCTION_DB
```

Fully reset customer workspaces/users and business data. The platform admin is preserved and updated from `deploy/production/.env.production` when the web container starts:

```bash
cd ~/FactorySystem
scripts/clear-production-db.sh --mode all --confirm CLEAR_PRODUCTION_DB
```

By default the script also clears uploaded drawing files, because drawing metadata is removed from the database. Add `--keep-drawings` to keep the files volume.

## Restore Notes

Restore database dumps only after stopping the `web` service:

```bash
cd ~/FactorySystem
sudo docker compose --env-file deploy/production/.env.production -f deploy/production/docker-compose.yml stop web
cat factory-2026-05-10.sql | sudo docker compose --env-file deploy/production/.env.production -f deploy/production/docker-compose.yml exec -T db psql -U factory factory
sudo docker compose --env-file deploy/production/.env.production -f deploy/production/docker-compose.yml start web
```
