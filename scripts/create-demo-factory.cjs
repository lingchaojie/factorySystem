/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS operator script for the existing Node container. */
const fs = require('node:fs');
const crypto = require('node:crypto');
const { WORKSPACE_ID, WORKSPACE_NAME, buildDemoFactory } = require('./demo-factory-data.cjs');

async function protectedFingerprint(db) {
  const where = { workspaceId: { not: WORKSPACE_ID } };
  const tables = await Promise.all([
    db.workspace.findMany({ where: { id: { not: WORKSPACE_ID } }, orderBy: { id: 'asc' } }),
    db.user.findMany({ where, orderBy: { id: 'asc' }, select: { id: true, workspaceId: true, username: true, role: true, updatedAt: true } }),
    db.machine.findMany({ where, orderBy: { id: 'asc' } }), db.order.findMany({ where, orderBy: { id: 'asc' } }),
    db.productionRecord.findMany({ where, orderBy: { id: 'asc' } }), db.orderDrawing.findMany({ where, orderBy: { id: 'asc' } }),
    db.machineOrderAssignment.findMany({ where, orderBy: [{ workspaceId: 'asc' }, { machineId: 'asc' }, { orderId: 'asc' }] }),
  ]);
  return { digest: crypto.createHash('sha256').update(JSON.stringify(tables)).digest('hex'), counts: tables.map(rows => rows.length),
    factories: tables[0].map(w => ({ id: w.id, name: w.name })) };
}
function validate(config) {
  if (config.workspaceId !== WORKSPACE_ID || !Array.isArray(config.users) || config.users.length !== 4) throw new Error('Explicit demo configuration is required');
  config.users.forEach((user, index) => {
    if (user.id !== `${WORKSPACE_ID}_user_${String(index + 1).padStart(2, '0')}` || user.role !== (index === 0 ? 'manager' : 'employee') ||
      !/^cnc_demo_(manager|worker[1-3])$/.test(user.username) || !/^\$2[aby]\$\d{2}\$[A-Za-z0-9./]{53}$/.test(user.passwordHash)) throw new Error('Invalid demo account configuration');
  });
  return buildDemoFactory(config.asOf);
}
async function createDemoFactory(prisma, config) {
  const data = validate(config);
  return prisma.$transaction(async db => {
    const before = await protectedFingerprint(db);
    const existing = await db.workspace.findUnique({ where: { id: WORKSPACE_ID } });
    if (existing && existing.name !== WORKSPACE_NAME) throw new Error('Reserved workspace ID is already used; no changes made');
    if (!existing) {
      if (await db.workspace.findFirst({ where: { name: WORKSPACE_NAME } })) throw new Error('A similarly named workspace already exists; no changes made');
      for (const user of config.users) if (await db.user.findUnique({ where: { username: user.username } })) throw new Error('A demo username is already in use; no changes made');
      await db.workspace.create({ data: data.workspace });
      await db.user.createMany({ data: config.users.map(user => ({ ...user, workspaceId: WORKSPACE_ID })) });
      await db.machine.createMany({ data: data.machines });
      await db.order.createMany({ data: data.orders });
      await db.machineOrderAssignment.createMany({ data: data.assignments });
      await db.productionRecord.createMany({ data: data.records });
    }
    const after = await protectedFingerprint(db);
    if (before.digest !== after.digest) throw new Error('Existing factory fingerprint changed; transaction will roll back');
    const counts = await Promise.all([db.user.count({ where: { workspaceId: WORKSPACE_ID } }), db.machine.count({ where: { workspaceId: WORKSPACE_ID } }),
      db.order.count({ where: { workspaceId: WORKSPACE_ID } }), db.productionRecord.count({ where: { workspaceId: WORKSPACE_ID } })]);
    if (!existing && JSON.stringify(counts) !== JSON.stringify([4, data.machines.length, data.orders.length, data.records.length])) throw new Error('Demo row counts differ; transaction will roll back');
    const foreignMachine = await db.machine.findFirst({ where: { workspaceId: { not: WORKSPACE_ID } }, select: { id: true } });
    const foreignOrder = await db.order.findFirst({ where: { workspaceId: { not: WORKSPACE_ID } }, select: { id: true } });
    return { created: !existing, workspace: data.workspace, counts: { users: counts[0], machines: counts[1], orders: counts[2], productionRecords: counts[3] },
      protectedFactories: before.factories, originalBusinessCounts: before.counts, originalDataUnchanged: true,
      isolationProbeIds: { machineId: foreignMachine?.id, orderId: foreignOrder?.id },
      accounts: config.users.map(({ username, role }) => ({ username, role })) };
  }, { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 60000 });
}
if (require.main === module) {
  if (process.argv[2] !== '--apply' || !process.argv[3]) throw new Error('Usage: node scripts/create-demo-factory.cjs --apply /absolute/demo-config.json');
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient();
  createDemoFactory(db, JSON.parse(fs.readFileSync(process.argv[3], 'utf8')))
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1; })
    .finally(() => db.$disconnect());
}
module.exports = { createDemoFactory, validate };
