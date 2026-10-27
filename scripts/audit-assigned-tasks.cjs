/* eslint-disable @typescript-eslint/no-require-imports -- Read-only task migration audit. */
const { PrismaClient } = require('@prisma/client');
const { createHash } = require('node:crypto');
const db = new PrismaClient();
db.workItem.findMany({ orderBy: { id: 'asc' } })
  .then(rows => console.log(JSON.stringify({ digest: createHash('sha256').update(JSON.stringify(rows)).digest('hex'), count: rows.length })))
  .catch(() => { console.error('Task audit failed'); process.exitCode = 1; })
  .finally(() => db.$disconnect());
