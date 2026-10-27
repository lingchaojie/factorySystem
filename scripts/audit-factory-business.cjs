/* eslint-disable @typescript-eslint/no-require-imports -- Read-only production deployment audit. */
const { PrismaClient } = require('@prisma/client');
const { createHash } = require('node:crypto');
const db = new PrismaClient();
db.$transaction(async tx => {
  const tables = await Promise.all([
    tx.workspace.findMany({ orderBy: { id: 'asc' } }),
    tx.user.findMany({ orderBy: { id: 'asc' }, select: { id: true, workspaceId: true, username: true, displayName: true, role: true, updatedAt: true } }),
    tx.machine.findMany({ orderBy: { id: 'asc' } }), tx.order.findMany({ orderBy: { id: 'asc' } }),
    tx.productionRecord.findMany({ orderBy: { id: 'asc' } }), tx.orderDrawing.findMany({ orderBy: { id: 'asc' } }),
    tx.machineOrderAssignment.findMany({ orderBy: [{ workspaceId: 'asc' }, { machineId: 'asc' }, { orderId: 'asc' }] }),
  ]);
  // No raw rows, account hashes, sessions or provider configuration leave this process.
  return { digest: createHash('sha256').update(JSON.stringify(tables)).digest('hex'), counts: tables.map(rows => rows.length) };
}, { isolationLevel: 'RepeatableRead', timeout: 60000 })
  .then(result => console.log(JSON.stringify(result)))
  .catch(() => { console.error('Business audit failed'); process.exitCode = 1; })
  .finally(() => db.$disconnect());
