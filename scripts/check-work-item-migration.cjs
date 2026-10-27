/* eslint-disable @typescript-eslint/no-require-imports -- Read-only migration preflight inside the new application image. */
const fs = require('node:fs');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const rows = await db.$queryRawUnsafe('SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations');
  if (rows.some(row => !row.finished_at && !row.rolled_back_at)) throw Error('An unresolved migration exists; deployment stopped');
  const applied = new Set(rows.filter(row => row.finished_at && !row.rolled_back_at).map(row => row.migration_name));
  const pending = fs.readdirSync('/app/prisma/migrations', { withFileTypes: true }).filter(entry => entry.isDirectory() && !applied.has(entry.name)).map(entry => entry.name).sort();
  if (pending.some(name => name !== '20261027080000_work_items')) throw Error('Unexpected pending migrations: ' + pending.join(', '));
  console.log(JSON.stringify({ pendingMigrations: pending, onlyNewWorkItemTableAllowed: true }));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
