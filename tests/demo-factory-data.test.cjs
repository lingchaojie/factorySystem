/* eslint-disable @typescript-eslint/no-require-imports -- Tests the standalone CommonJS data generator with node:test. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildDemoFactory, WORKSPACE_ID } = require('../scripts/demo-factory-data.cjs');
const { validate } = require('../scripts/create-demo-factory.cjs');
const now = new Date('2026-10-27T02:30:00Z');
test('all synthetic references stay in the dedicated factory and historical quantities remain consistent', () => {
  const data = buildDemoFactory(now);
  assert.equal(data.machines.length, 8); assert.equal(data.orders.length, 30); assert.equal(data.records.length, 264);
  for (const row of [...data.machines, ...data.orders, ...data.records, ...data.assignments]) assert.equal(row.workspaceId, WORKSPACE_ID);
  for (const record of data.records) {
    assert.ok(Number.isInteger(record.quantity) && record.quantity > 0); assert.ok(record.recordedAt <= now);
    assert.ok(data.orders.some(order => order.id === record.orderId)); assert.ok(data.machines.some(machine => machine.id === record.machineId));
  }
  for (const order of data.orders) {
    const events = data.records.filter(record => record.orderId === order.id).sort((a, b) => a.recordedAt - b.recordedAt);
    let completed = 0, shipped = 0;
    for (const event of events) { if (event.type === 'completed') completed += event.quantity; else shipped += event.quantity; assert.ok(shipped <= completed); }
    assert.ok(completed <= order.plannedQuantity);
    if (order.status === 'completed') { assert.equal(shipped, order.plannedQuantity); assert.ok(order.closedAt <= now); }
  }
});
test('demo includes shipment backlog, overdue work, pending work, active/idle/maintenance machines and current-day reports', () => {
  const data = buildDemoFactory(now);
  assert.ok(data.orders.some(order => order.status === 'in_progress' && order.dueDate < now));
  assert.ok(data.orders.some(order => order.status === 'processing_pending'));
  assert.ok(data.orders.some(order => order.status === 'development_pending'));
  for (const status of ['active', 'idle', 'maintenance', 'disabled']) assert.ok(data.machines.some(machine => machine.status === status));
  assert.ok(data.records.some(record => record.recordedAt.toISOString().startsWith('2026-10-27')));
  assert.equal(JSON.stringify(data), JSON.stringify(buildDemoFactory(now)));
});
test('seeder rejects a real-workspace target or incomplete account configuration before touching the database', () => {
  assert.throws(() => validate({ workspaceId: 'existing-factory', users: [] }), /Explicit demo/);
  assert.throws(() => validate({ workspaceId: WORKSPACE_ID, users: [{}, {}, {}, {}] }), /Invalid demo account/);
});
