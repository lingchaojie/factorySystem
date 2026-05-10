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

## Tencent Cloud Production Deploy

Deploy to a Tencent Cloud CVM with one command:

```bash
scripts/deploy-tencent.sh root@1.2.3.4 factory.example.com
```

The deploy scripts pull `main` by default. See [Tencent CVM deployment](docs/deployment/tencent-cvm.md) for first deploy, redeploy, logs, backup, and clear-database commands.

## Useful Commands

```bash
npm run lint
npm run test:run
npm run build
npm run test:e2e
docker compose config
```
