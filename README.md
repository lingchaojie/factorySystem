# Factory System

CNC factory order and machine management web app.

## Local Development

Local development is intended to run directly in WSL without Docker. Use Docker only for production deployment or production-stack verification.

With local PostgreSQL available:

```bash
cp .env.example .env
# Adjust DATABASE_URL to your local PostgreSQL, for example localhost:5432.
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000` in the Windows browser.

See [current project notes](docs/project-current-state.md) for implemented features, account model, local debugging notes, and operational experience.

## Production Deploy

Production runs with Docker Compose. On the server, checkout and pull the branch you want to deploy, then rebuild and restart the stack:

```bash
git checkout main
git pull --ff-only
scripts/deploy-production.sh
```

The deploy script uses the current checkout, reads `deploy/production/.env.production`, rebuilds the `web` image, and starts `db/web/caddy`. See [Tencent CVM deployment](docs/deployment/tencent-cvm.md) for first deploy, redeploy, logs, backup, and clear-database commands.

For bare-IP production deployments, Factory System defaults to host port `18080` to avoid conflicts with other apps on `80/443`. Configure `APP_ORIGIN=http://SERVER_IP:18080` and open `http://SERVER_IP:18080/login`.

## Useful Commands

```bash
npm run lint
npm run test:run
npm run build
npm run test:e2e
docker compose config
```
