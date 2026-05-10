# Tencent CVM Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-command Tencent Cloud CVM production deployment path.

**Architecture:** Add a production Docker Compose stack under `deploy/production` with Caddy, the existing Next.js image build, and PostgreSQL. Add a Bash deployment script that installs Docker on the remote CVM, clones or updates the repository, creates a server-local production env file, and starts the stack.

**Tech Stack:** Bash, Docker Compose v2, Caddy 2, PostgreSQL 16, Next.js.

---

### Task 1: Production Compose Files

**Files:**
- Create: `deploy/production/docker-compose.yml`
- Create: `deploy/production/Caddyfile`
- Create: `deploy/production/.env.production.example`
- Create: `deploy/production/.gitignore`

- [x] Add a production compose stack with `db`, `web`, and `caddy`.
- [x] Keep PostgreSQL private to the compose network.
- [x] Store database and drawings in named volumes.
- [x] Use Caddy's `APP_SITE_ADDRESS` environment variable so the same stack works with either a domain or bare HTTP on port 80.

### Task 2: Remote Deploy Script

**Files:**
- Create: `scripts/deploy-tencent.sh`

- [x] Accept `user@host` and optional domain arguments.
- [x] Install Docker Engine and the Compose plugin on Ubuntu/Debian through Tencent Cloud mirrors.
- [x] Clone the repository on first deploy and hard-reset the configured branch on later deploys.
- [x] Generate `.env.production` only when missing, preserving production passwords on redeploy.
- [x] Start the production compose stack and print the application URL.

### Task 3: Deployment Documentation

**Files:**
- Create: `docs/deployment/tencent-cvm.md`
- Modify: `README.md`

- [x] Document CVM prerequisites, security group ports, first deploy command, redeploy command, log commands, and backup commands.
- [x] Add a concise README link to the Tencent CVM deployment guide.

### Task 4: Verification

**Commands:**

```bash
bash -n scripts/deploy-tencent.sh
docker compose -f deploy/production/docker-compose.yml --env-file deploy/production/.env.production.example config
git diff --check
```

Expected: all commands exit with code 0.

