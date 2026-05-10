# Factory System

CNC factory order and machine management web app.

## Run With Docker Compose

```bash
docker compose up -d --build
```

Open `http://localhost:3000` in the Windows browser.

Default bootstrap account:

- Username: `admin`
- Password: `change-me-before-use`

The compose stack runs two containers:

- `web`: Next.js app on host port `3000`
- `db`: PostgreSQL on host port `5433`, mapped to container port `5432`

Uploaded order drawings are stored in the `order-drawings-data` Docker volume.

## Tencent Cloud Production Deploy

Deploy to a Tencent Cloud CVM with one command:

```bash
scripts/deploy-tencent.sh root@1.2.3.4 factory.example.com
```

See [Tencent CVM deployment](docs/deployment/tencent-cvm.md) for first deploy, redeploy, logs, and backup commands.

## Local Development

Use the compose database with the app running directly in WSL:

```bash
cp .env.example .env
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

## Useful Commands

```bash
npm run lint
npm run test:run
npm run build
npm run test:e2e
docker compose config
```
