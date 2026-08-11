# Machine Multi-Order Association Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow one machine to retain multiple order associations and require operators to choose the associated order for every machining or shipping entry.

**Architecture:** Replace `Machine.currentOrderId` with a workspace-scoped `MachineOrderAssignment` join model while leaving `ProductionRecord` unchanged. Machine/order services enforce association and completion rules in transactions; server actions pass an explicit `orderId`; machine and order pages render the new relation.

**Tech Stack:** Next.js 15 App Router, React 19 Server Components and Client Components, TypeScript, Prisma 6, PostgreSQL, Vitest, Testing Library, Playwright.

## Global Constraints

- Preserve every existing `ProductionRecord` and all order, progress, and analytics totals during migration.
- Keep the current split-record rule: one form submission may create one `completed` row and one `shipped` row.
- Scope every machine, order, assignment, and record operation by `workspaceId`.
- Completed orders cannot receive, update, or delete production records and cannot receive new machine associations.
- Restoring an order to `in_progress` makes its retained machine associations recordable again.
- Managers create and edit orders; managers and employees may manage machine/order associations and create production records.
- Do not introduce a global selected/current order on `Machine`.
- Follow TDD: observe each focused test fail before writing the corresponding production change.

---

## File Structure

- Modify `prisma/schema.prisma` to add `MachineOrderAssignment` and remove the single current-order relation.
- Create `prisma/migrations/20260811090000_machine_order_assignments/migration.sql` to backfill associations before dropping `currentOrderId`.
- Modify `src/server/services/order-locks.ts` so machine locks no longer read `currentOrderId`.
- Modify `src/server/services/machines.ts` to add/remove assignments and return associated orders.
- Modify `src/server/services/orders.ts` to create assignments, return assigned machines, and lock status transitions.
- Modify `src/server/services/records.ts` to accept and validate an explicit `orderId`.
- Modify `src/app/actions/machines.ts` to submit, unlink, revalidate, and retain the selected order.
- Create `src/app/(dashboard)/machines/[id]/unlink-order-button.tsx` for confirmed association removal.
- Modify machine and order pages to render the many-to-many relation.
- Modify service, action, page, component, and end-to-end tests for the new behavior.
- Modify `docs/project-current-state.md` after the feature behavior is verified.

### Task 1: Join Model and Data-Preserving Migration

**Files:**
- Modify: `prisma/schema.prisma:34-164`
- Create: `prisma/migrations/20260811090000_machine_order_assignments/migration.sql`
- Test: `tests/integration/factory-services.test.ts`
- Create test: `tests/scripts/machine-order-migration.test.ts`

**Interfaces:**
- Consumes: existing composite unique keys `Machine(workspaceId, id)` and `Order(workspaceId, id)`.
- Produces: Prisma model `MachineOrderAssignment` with compound identifier `workspaceId_machineId_orderId`; relations `Machine.orderAssignments` and `Order.machineAssignments`.

- [ ] **Step 1: Write the failing schema integration test**

Add this focused test inside `describe("factory services")`:

```ts
it("stores multiple workspace-scoped order assignments for one machine", async () => {
  const workspace = await createWorkspace();
  const machine = await createMachine(workspace.id, {
    code: "MULTI-1",
    name: "MULTI-1",
    model: "",
    location: "",
    status: "active",
    notes: "",
  });
  const firstOrder = await createOrder(workspace.id, {
    customerName: "甲方",
    partName: "法兰",
    plannedQuantity: 10,
    unitPriceCents: null,
    dueDate: null,
    notes: "",
  });
  const secondOrder = await createOrder(workspace.id, {
    customerName: "乙方",
    partName: "轴套",
    plannedQuantity: 20,
    unitPriceCents: null,
    dueDate: null,
    notes: "",
  });

  await prisma.machineOrderAssignment.createMany({
    data: [
      { workspaceId: workspace.id, machineId: machine.id, orderId: firstOrder.id },
      { workspaceId: workspace.id, machineId: machine.id, orderId: secondOrder.id },
    ],
  });

  const assignments = await prisma.machineOrderAssignment.findMany({
    where: { workspaceId: workspace.id, machineId: machine.id },
    orderBy: { orderId: "asc" },
  });
  expect(assignments.map((assignment) => assignment.orderId).sort()).toEqual(
    [firstOrder.id, secondOrder.id].sort(),
  );
});
```

Create `tests/scripts/machine-order-migration.test.ts` to enforce the data-preserving statement order:

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("machine order assignment migration", () => {
  it("backfills current orders before dropping currentOrderId", async () => {
    const sql = await readFile(
      "prisma/migrations/20260811090000_machine_order_assignments/migration.sql",
      "utf8",
    );
    const backfillPosition = sql.indexOf(
      'INSERT INTO "MachineOrderAssignment"',
    );
    const dropPosition = sql.indexOf(
      'ALTER TABLE "Machine" DROP COLUMN "currentOrderId"',
    );

    expect(backfillPosition).toBeGreaterThan(-1);
    expect(dropPosition).toBeGreaterThan(backfillPosition);
    expect(sql).not.toContain('TRUNCATE TABLE "ProductionRecord"');
    expect(sql).not.toContain('DELETE FROM "ProductionRecord"');
  });
});
```

- [ ] **Step 2: Run the schema test and verify red**

Run:

```bash
npm run test:run -- tests/scripts/machine-order-migration.test.ts
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" npm run test:run -- tests/integration/factory-services.test.ts -t "stores multiple workspace-scoped"
```

Expected: both commands FAIL: the migration file/model do not exist.

- [ ] **Step 3: Add the Prisma relations**

Add `machineOrderAssignments MachineOrderAssignment[]` to `Workspace`. Replace `Machine.currentOrderId/currentOrder` with `orderAssignments`, replace `Order.currentMachines` with `machineAssignments`, and add:

```prisma
model MachineOrderAssignment {
  workspaceId String
  machineId   String
  orderId     String
  createdAt   DateTime @default(now())

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  machine   Machine   @relation(fields: [workspaceId, machineId], references: [workspaceId, id], onDelete: Cascade)
  order     Order     @relation(fields: [workspaceId, orderId], references: [workspaceId, id], onDelete: Cascade)

  @@id([workspaceId, machineId, orderId])
  @@index([workspaceId, machineId])
  @@index([workspaceId, orderId])
}
```

Remove `@@index([currentOrderId])` from `Machine`.

- [ ] **Step 4: Write the explicit SQL migration**

Create the migration with this ordering so production data is copied before the old column disappears:

```sql
CREATE TABLE "MachineOrderAssignment" (
  "workspaceId" TEXT NOT NULL,
  "machineId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MachineOrderAssignment_pkey"
    PRIMARY KEY ("workspaceId", "machineId", "orderId")
);

INSERT INTO "MachineOrderAssignment" ("workspaceId", "machineId", "orderId")
SELECT "workspaceId", "id", "currentOrderId"
FROM "Machine"
WHERE "currentOrderId" IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE INDEX "MachineOrderAssignment_workspaceId_machineId_idx"
  ON "MachineOrderAssignment"("workspaceId", "machineId");
CREATE INDEX "MachineOrderAssignment_workspaceId_orderId_idx"
  ON "MachineOrderAssignment"("workspaceId", "orderId");

ALTER TABLE "MachineOrderAssignment"
  ADD CONSTRAINT "MachineOrderAssignment_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MachineOrderAssignment"
  ADD CONSTRAINT "MachineOrderAssignment_workspaceId_machineId_fkey"
  FOREIGN KEY ("workspaceId", "machineId") REFERENCES "Machine"("workspaceId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MachineOrderAssignment"
  ADD CONSTRAINT "MachineOrderAssignment_workspaceId_orderId_fkey"
  FOREIGN KEY ("workspaceId", "orderId") REFERENCES "Order"("workspaceId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Machine"
  DROP CONSTRAINT "Machine_workspaceId_currentOrderId_fkey";
DROP INDEX "Machine_currentOrderId_idx";
ALTER TABLE "Machine" DROP COLUMN "currentOrderId";
```

- [ ] **Step 5: Generate, validate, apply, and rerun**

Run:

```bash
npm run db:generate
npx prisma validate
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" npm run db:deploy
npm run test:run -- tests/scripts/machine-order-migration.test.ts
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" npm run test:run -- tests/integration/factory-services.test.ts -t "stores multiple workspace-scoped"
```

Expected: Prisma validation succeeds, the migration applies, and the focused test passes.

- [ ] **Step 6: Commit the schema deliverable**

```bash
git add prisma/schema.prisma prisma/migrations/20260811090000_machine_order_assignments/migration.sql tests/integration/factory-services.test.ts tests/scripts/machine-order-migration.test.ts
git commit -m "feat: add machine order assignment model"
```

### Task 2: Association, Record, and Order Services

**Files:**
- Modify: `src/server/services/order-locks.ts`
- Modify: `src/server/services/machines.ts`
- Modify: `src/server/services/orders.ts`
- Modify: `src/server/services/records.ts`
- Modify: `tests/integration/factory-services.test.ts`

**Interfaces:**
- Consumes: `MachineOrderAssignment` and compound key `workspaceId_machineId_orderId` from Task 1.
- Produces:
  - `linkMachineToOrder(workspaceId: string, machineId: string, orderId: string)` with idempotent many-to-many semantics.
  - `unlinkMachineFromOrder(workspaceId: string, machineId: string, orderId: string)`.
  - `CreateProductionRecordInput` with required `orderId: string`.
  - `getMachine`/`listMachines` results containing `orderAssignments[].order`.
  - `getOrderWithSummary` result containing `machineAssignments[].machine`.

- [ ] **Step 1: Write failing multi-order service tests**

Add `getMachine` and `unlinkMachineFromOrder` to the imports from `@/server/services/machines`. Add tests that establish two associations, explicitly record against each order, reject an unassociated order, preserve an association across completion/reopen, and remove an association without deleting records:

```ts
await linkMachineToOrder(workspace.id, machine.id, firstOrder.id);
await linkMachineToOrder(workspace.id, machine.id, secondOrder.id);

await createProductionRecord(workspace.id, {
  machineId: machine.id,
  orderId: firstOrder.id,
  recordedAt: new Date("2026-08-11T01:00:00.000Z"),
  completedQuantity: 12,
  shippedQuantity: 3,
  notes: "第一单",
});
await createProductionRecord(workspace.id, {
  machineId: machine.id,
  orderId: secondOrder.id,
  recordedAt: new Date("2026-08-11T02:00:00.000Z"),
  completedQuantity: 7,
  shippedQuantity: 2,
  notes: "第二单",
});

expect((await getOrderWithSummary(workspace.id, firstOrder.id)).completedQuantity).toBe(12);
expect((await getOrderWithSummary(workspace.id, secondOrder.id)).completedQuantity).toBe(7);
expect(
  (await getMachine(workspace.id, machine.id)).orderAssignments.map(
    (assignment) => assignment.orderId,
  ),
).toEqual(expect.arrayContaining([firstOrder.id, secondOrder.id]));
```

For the negative case, create a third order without linking it and expect `createProductionRecord` to reject with `"机器未关联该订单，不能录入记录"`. For completion/reopen, assert the completed order is absent from `getMachine(...).orderAssignments` and reappears after `updateOrderStatus(..., "in_progress")`.

For removal, use a linked order with one existing record:

```ts
await unlinkMachineFromOrder(workspace.id, machine.id, firstOrder.id);
expect(
  await prisma.machineOrderAssignment.findUnique({
    where: {
      workspaceId_machineId_orderId: {
        workspaceId: workspace.id,
        machineId: machine.id,
        orderId: firstOrder.id,
      },
    },
  }),
).toBeNull();
expect(
  await prisma.productionRecord.count({
    where: { workspaceId: workspace.id, machineId: machine.id, orderId: firstOrder.id },
  }),
).toBe(2);
await expect(
  createProductionRecord(workspace.id, {
    machineId: machine.id,
    orderId: firstOrder.id,
    recordedAt: new Date("2026-08-11T03:00:00.000Z"),
    completedQuantity: 1,
    shippedQuantity: 0,
    notes: "移除后录入",
  }),
).rejects.toThrow("机器未关联该订单，不能录入记录");
```

Update the existing busy-machine order-creation test. Instead of expecting `"机器正在加工其他订单，不能关联"`, create the second order with `machineIds: [busyMachine.id]` and assert its compound assignment exists:

```ts
expect(
  await prisma.machineOrderAssignment.findUnique({
    where: {
      workspaceId_machineId_orderId: {
        workspaceId: workspace.id,
        machineId: busyMachine.id,
        orderId: created.id,
      },
    },
  }),
).not.toBeNull();
```

- [ ] **Step 2: Run the new service tests and verify red**

Run:

```bash
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" npm run test:run -- tests/integration/factory-services.test.ts -t "multiple orders|unassociated order|reappears|removes an assignment"
```

Expected: FAIL because the old link overwrites one current order and record creation does not accept the selected order.

- [ ] **Step 3: Remove current-order assumptions from lock helpers**

Change `LockedMachine` and the SQL projection to:

```ts
export type LockedMachine = { id: string };

SELECT "id"
FROM "Machine"
WHERE "workspaceId" = ${workspaceId}
  AND "id" = ${machineId}
FOR UPDATE
```

Keep `lockOrderForUpdate` unchanged.

- [ ] **Step 4: Implement assignment services and relation queries**

In `linkMachineToOrder`, lock machine then order, reject completed orders, update pending orders to `in_progress`, and upsert:

```ts
return tx.machineOrderAssignment.upsert({
  where: {
    workspaceId_machineId_orderId: { workspaceId, machineId, orderId },
  },
  create: { workspaceId, machineId, orderId },
  update: {},
});
```

Add `unlinkMachineFromOrder`. Lock machine then order, delete with `deleteMany`, and throw `"机器未关联该订单"` when `count === 0`.

Change `listMachines` and `getMachine` to include active assignments:

```ts
orderAssignments: {
  where: { order: { status: { not: "completed" } } },
  include: {
    order: { include: { productionRecords: true } },
  },
  orderBy: { createdAt: "asc" },
},
```

Keep machine production-record includes unchanged.

- [ ] **Step 5: Make order creation and detail use assignments**

In `linkMachinesToCreatedOrder`, keep the machine row lock and replace busy/current-order checks with an assignment upsert. In `getOrderWithSummary` include:

```ts
machineAssignments: {
  include: { machine: true },
  orderBy: { createdAt: "asc" },
},
```

Remove the `machine.updateMany({ currentOrderId: null })` block from `deleteOrder`; assignment rows cascade when the order is deleted.

Wrap `updateOrderStatus` and `updateOrderDetails` in transactions. Call `lockOrderForUpdate` before updating status or `closedAt` so completion serializes with record creation.

- [ ] **Step 6: Require and validate the selected order in record creation**

Change the input and transaction:

```ts
export type CreateProductionRecordInput = {
  machineId: string;
  orderId: string;
  recordedAt: Date;
  completedQuantity: number;
  shippedQuantity: number;
  notes: string;
  actorUserId?: string;
};
```

After locking machine and `input.orderId`, query the compound assignment. Throw `"机器未关联该订单，不能录入记录"` when absent and `"订单已完成，不能录入记录"` when completed. Connect every new row to `input.orderId` and return that value.

Update every existing `createProductionRecord` call in `tests/integration/factory-services.test.ts` to pass the order variable used by that test. Use this audit command and ensure every call has a nearby `orderId:`:

```bash
rg -n -A5 "createProductionRecord\\(" tests/integration/factory-services.test.ts
```

Replace assertions on `currentOrderId` with assignment counts/IDs, and replace `detail.currentMachines` with `detail.machineAssignments.map(({ machine }) => machine)`.

- [ ] **Step 7: Add the deterministic completion race test**

Import `lockOrderForUpdate` in the integration test. Hold an order row lock in one transaction, start record creation, update the locked order to completed, release the transaction, and assert the waiting record call rejects:

```ts
let releaseCompletion!: () => void;
let reportLocked!: () => void;
const release = new Promise<void>((resolve) => { releaseCompletion = resolve; });
const locked = new Promise<void>((resolve) => { reportLocked = resolve; });

const completion = prisma.$transaction(async (tx) => {
  await lockOrderForUpdate(tx, workspace.id, order.id);
  reportLocked();
  await release;
  await tx.order.update({
    where: { workspaceId_id: { workspaceId: workspace.id, id: order.id } },
    data: { status: "completed", closedAt: new Date() },
  });
});

await locked;
const creation = createProductionRecord(workspace.id, {
  machineId: machine.id,
  orderId: order.id,
  recordedAt: new Date(),
  completedQuantity: 1,
  shippedQuantity: 0,
  notes: "并发录入",
});
releaseCompletion();
await completion;
await expect(creation).rejects.toThrow("订单已完成，不能录入记录");
```

- [ ] **Step 8: Run the complete service suite**

Run:

```bash
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" npm run test:run -- tests/integration/factory-services.test.ts tests/integration/analytics-services.test.ts
```

Expected: all service and analytics tests pass with no `currentOrderId` references.

- [ ] **Step 9: Commit the service deliverable**

```bash
git add src/server/services/order-locks.ts src/server/services/machines.ts src/server/services/orders.ts src/server/services/records.ts tests/integration/factory-services.test.ts
git commit -m "feat: support multiple orders per machine"
```

### Task 3: Server Actions for Explicit Order Selection

**Files:**
- Modify: `src/app/actions/machines.ts`
- Modify: `tests/actions/machines.test.ts`

**Interfaces:**
- Consumes: `unlinkMachineFromOrder` and explicit `CreateProductionRecordInput.orderId` from Task 2.
- Produces: `unlinkMachineAction(formData: FormData)` and updated record/link actions.

- [ ] **Step 1: Write failing action tests**

Add `unlinkMachineFromOrder` to the machine service mock. Update the record action test form and expectation:

```ts
form.set("machineId", "machine-1");
form.set("orderId", "order-2");

expect(recordsMock.createProductionRecord).toHaveBeenCalledWith(
  "workspace-1",
  expect.objectContaining({
    machineId: "machine-1",
    orderId: "order-2",
  }),
);
expect(navigationMock.redirect).toHaveBeenCalledWith(
  "/machines/machine-1?orderId=order-2",
);
```

Add an unlink test asserting:

```ts
expect(machinesMock.unlinkMachineFromOrder).toHaveBeenCalledWith(
  "workspace-1",
  "machine-1",
  "order-2",
);
expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/orders/order-2");
```

Add a missing-order test expecting `"订单必填"` before the record service is called.

- [ ] **Step 2: Run action tests and verify red**

Run:

```bash
npm run test:run -- tests/actions/machines.test.ts
```

Expected: FAIL because record creation ignores `orderId` and no unlink action exists.

- [ ] **Step 3: Update link, unlink, and record actions**

Read and validate both IDs with existing `getString`. Add:

```ts
export async function unlinkMachineAction(formData: FormData) {
  const workspaceId = await requireWorkspaceId();
  const machineId = getString(formData, "machineId");
  const orderId = getString(formData, "orderId");
  if (!machineId) throw new Error("机器必填");
  if (!orderId) throw new Error("订单必填");

  await unlinkMachineFromOrder(workspaceId, machineId, orderId);
  revalidatePath("/machines");
  revalidatePath(`/machines/${machineId}`);
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  redirect(`/machines/${machineId}`);
}
```

For link and unlink, revalidate both list pages and both detail pages. For record creation, pass `orderId` and redirect to `/machines/${machineId}?orderId=${orderId}` after revalidating `/orders/${orderId}`.

- [ ] **Step 4: Run action tests and verify green**

Run:

```bash
npm run test:run -- tests/actions/machines.test.ts
```

Expected: all machine action tests pass.

- [ ] **Step 5: Commit the action deliverable**

```bash
git add src/app/actions/machines.ts tests/actions/machines.test.ts
git commit -m "feat: select order for machine records"
```

### Task 4: Machine Detail Multi-Order Workflow

**Files:**
- Create: `src/app/(dashboard)/machines/[id]/unlink-order-button.tsx`
- Modify: `src/app/(dashboard)/machines/[id]/page.tsx`
- Modify: `tests/pages/machine-detail.test.tsx`
- Modify: `tests/components/delete-buttons.test.tsx`

**Interfaces:**
- Consumes: `machine.orderAssignments[].order`, `unlinkMachineAction`, and `searchParams.orderId`.
- Produces: a machine detail page that lists assignments and submits a required target order.

- [ ] **Step 1: Replace current-order page fixtures with assignments**

Update machine-detail test fixtures from:

```ts
currentOrderId: "order-1",
currentOrder: { id: "order-1" },
```

to:

```ts
orderAssignments: [
  {
    orderId: "order-1",
    order: {
      id: "order-1",
      customerName: "甲方工厂",
      partName: "法兰",
      plannedQuantity: 100,
      status: "in_progress",
      productionRecords: [],
    },
  },
],
```

Use `orderAssignments: []` for unassigned machines.

Replace the old “current order is completed” page test with the service result the page now receives: `orderAssignments: []`. Assert the page explains that no associated unfinished order can be recorded and disables the complete record form. The service-level completed/reopened behavior remains covered in Task 2.

- [ ] **Step 2: Add failing multi-order page tests**

Return two assignments and assert:

```ts
expect(screen.getByRole("link", { name: "甲方工厂 / 法兰" })).toBeInTheDocument();
expect(screen.getByRole("link", { name: "乙方工厂 / 轴套" })).toBeInTheDocument();
expect(screen.getByLabelText("目标订单")).toHaveValue("");
expect(screen.getByRole("option", { name: "请选择订单" })).toHaveValue("");
expect(screen.getByRole("button", { name: "保存记录" })).toBeEnabled();
expect(screen.getAllByRole("button", { name: "移除关联" })).toHaveLength(2);
```

Add a one-assignment test expecting that order ID to be selected automatically, and a zero-assignment test expecting all record fields and submit to be disabled.

- [ ] **Step 3: Run page/component tests and verify red**

Run:

```bash
npm run test:run -- tests/pages/machine-detail.test.tsx tests/components/delete-buttons.test.tsx
```

Expected: FAIL because the page still renders one `currentOrder`.

- [ ] **Step 4: Add the confirmed unlink button**

Create a focused client component:

```tsx
"use client";

export function UnlinkOrderButton() {
  return (
    <button
      type="submit"
      aria-label="移除关联"
      onClick={(event) => {
        if (!window.confirm("确定移除这台机器与该订单的关联吗？已有生产记录会保留。")) {
          event.preventDefault();
        }
      }}
    >
      移除关联
    </button>
  );
}
```

Apply the existing red secondary/destructive button classes. Add a component test that mocks `window.confirm` false/true and verifies cancellation behavior.

- [ ] **Step 5: Render assignments and candidate orders**

Extend page search params with `orderId?: string | string[]`. Build:

```ts
const assignedOrderIds = new Set(
  machine.orderAssignments.map((assignment) => assignment.orderId),
);
const availableOrders = orders.filter(
  (order) => order.status !== "completed" && !assignedOrderIds.has(order.id),
);
const recordableOrders = machine.orderAssignments.map(
  (assignment) => assignment.order,
);
const requestedOrderId =
  typeof sortParams.orderId === "string" ? sortParams.orderId : "";
const selectedOrderId = recordableOrders.some(
  (order) => order.id === requestedOrderId,
)
  ? requestedOrderId
  : recordableOrders.length === 1
    ? recordableOrders[0].id
    : "";
```

Render every assignment as a card/row with order link, status, `OrderProgressBars`, and a form containing hidden machine/order IDs plus `UnlinkOrderButton`.

- [ ] **Step 6: Require a target order in the record form**

For more than one recordable order prepend:

```ts
{ value: "", label: "请选择订单" }
```

Render `SelectInput label="目标订单" name="orderId" required` before record time. Set `defaultValue={selectedOrderId}`. Disable time, quantities, notes, and submit only when `recordableOrders.length === 0`.

- [ ] **Step 7: Run page/component tests and verify green**

Run:

```bash
npm run test:run -- tests/pages/machine-detail.test.tsx tests/components/delete-buttons.test.tsx
```

Expected: all machine-detail and confirmation tests pass.

- [ ] **Step 8: Commit the machine-detail deliverable**

```bash
git add 'src/app/(dashboard)/machines/[id]/page.tsx' 'src/app/(dashboard)/machines/[id]/unlink-order-button.tsx' tests/pages/machine-detail.test.tsx tests/components/delete-buttons.test.tsx
git commit -m "feat: add machine multi-order workflow"
```

### Task 5: Machine List and Order Surfaces

**Files:**
- Modify: `src/app/(dashboard)/machines/page.tsx`
- Modify: `src/app/(dashboard)/orders/page.tsx`
- Modify: `src/app/(dashboard)/orders/[id]/page.tsx`
- Modify: `tests/pages/machines-page.test.tsx`
- Modify: `tests/pages/orders-page.test.tsx`

**Interfaces:**
- Consumes: assignment relation shapes from Task 2.
- Produces: summarized machine assignments, unrestricted machine choices on order creation, and assigned-machine history on order detail.

- [ ] **Step 1: Write failing list and order page tests**

Update machine-list fixtures to contain three `orderAssignments` and assert the column heading `"关联订单"`, two visible order links, and `"另有 1 个"`.

Update order-create fixtures so a machine with existing `orderAssignments` is still present in the `关联机器` multi-select.

Update order-detail fixtures from `currentMachines` to:

```ts
machineAssignments: [
  { machine: { id: "machine-1", code: "1号机", status: "active" } },
  { machine: { id: "machine-2", code: "2号机", status: "active" } },
],
```

Assert the region label is `"关联机器"` and both machine links remain visible for a completed order.

- [ ] **Step 2: Run page tests and verify red**

Run:

```bash
npm run test:run -- tests/pages/machines-page.test.tsx tests/pages/orders-page.test.tsx
```

Expected: FAIL on old `currentOrder`/`currentMachines` assumptions.

- [ ] **Step 3: Render a bounded machine-list summary**

Rename copy from “当前订单” to “关联订单”. Derive:

```ts
const associatedOrders = machine.orderAssignments.map(
  (assignment) => assignment.order,
);
const visibleOrders = associatedOrders.slice(0, 2);
const remainingCount = associatedOrders.length - visibleOrders.length;
```

Render up to two order links and `另有 N 个` when `remainingCount > 0`. Render `未关联订单` for zero. Remove the unique-order status/progress display from the list; full progress remains on machine detail.

- [ ] **Step 4: Expose all machines during order creation**

Replace the `currentOrder` availability filter in `orders/page.tsx` with a direct map:

```ts
const machineOptions = machines.map((machine) => ({
  value: machine.id,
  label: machine.code,
}));
```

- [ ] **Step 5: Render assigned machines on order detail**

Replace every `order.currentMachines` read with:

```ts
const assignedMachines = order.machineAssignments.map(
  (assignment) => assignment.machine,
);
```

Use `assignedMachines` for the `aria-label="关联机器"` region. Keep “做过此订单的机器” derived from production records.

- [ ] **Step 6: Run page tests and verify green**

Run:

```bash
npm run test:run -- tests/pages/machines-page.test.tsx tests/pages/orders-page.test.tsx
```

Expected: both page suites pass.

- [ ] **Step 7: Commit the page-surface deliverable**

```bash
git add 'src/app/(dashboard)/machines/page.tsx' 'src/app/(dashboard)/orders/page.tsx' 'src/app/(dashboard)/orders/[id]/page.tsx' tests/pages/machines-page.test.tsx tests/pages/orders-page.test.tsx
git commit -m "feat: show machine order associations"
```

### Task 6: End-to-End Flow, Documentation, and Full Verification

**Files:**
- Modify: `tests/e2e/factory-flow.spec.ts`
- Modify: `docs/project-current-state.md`

**Interfaces:**
- Consumes: complete multi-order workflow from Tasks 1-5.
- Produces: browser-level regression coverage and updated operator documentation.

- [ ] **Step 1: Make the E2E record helper select an order**

Change the helper signature to:

```ts
async function createProductionRecord(
  page: Page,
  orderName: string,
  record: { completed: string; shipped: string; notes: string },
) {
  const form = page
    .locator("form")
    .filter({ has: page.locator('input[name="completedQuantity"]') })
    .filter({ has: page.locator('input[name="machineId"]') });
  await form.locator('select[name="orderId"]').selectOption({
    label: orderName,
  });
  await form.locator('input[name="completedQuantity"]').fill(record.completed);
  await form.locator('input[name="shippedQuantity"]').fill(record.shipped);
  await form.locator('textarea[name="notes"]').fill(record.notes);
  await form.locator('textarea[name="notes"]').blur();
  const saveButton = form.getByRole("button", { name: "保存记录" });
  await saveButton.scrollIntoViewIfNeeded();
  await expect(saveButton).toBeVisible();
  await expect(saveButton).toBeEnabled();
  await saveButton.click({ force: true });

  const row = page.locator("tbody tr").filter({ hasText: record.notes });
  await expect(row).toHaveCount(2);
  await expect(row.filter({ hasText: "加工" })).toContainText(record.completed);
  await expect(row.filter({ hasText: "出货" })).toContainText(record.shipped);
}
```

Update both existing helper calls to pass `orderName`.

- [ ] **Step 2: Add the failing two-order browser scenario**

Create two uniquely named orders, one machine, and link the machine to both orders. Assert the record form shows both options and initially has an empty value. Record `11/3` against the first and `7/2` against the second, then use `expectOrderSummary` to verify the totals remain separate.

- [ ] **Step 3: Run the focused E2E scenario**

Run:

```bash
npm run test:e2e -- --grep "one machine records against two associated orders" --project=chromium-desktop
```

Expected before final E2E implementation: FAIL on missing multiple association/target selection. Expected after completing the scenario: PASS.

- [ ] **Step 4: Update current-state documentation**

In `docs/project-current-state.md`, replace the unique-current-order description with:

```md
- 一台机器可以同时关联多个未完成订单。
- 机器详情页录入生产数据时必须选择目标订单，支持在关联订单之间切换。
- 订单完成后退出机器可录入列表；恢复为进行中后原关联重新可用。
```

- [ ] **Step 5: Audit removed current-order identifiers**

Run:

```bash
rg -n "currentOrderId|currentOrder|currentMachines" prisma/schema.prisma src tests
rg -n "currentOrderId" prisma/migrations/20260811090000_machine_order_assignments/migration.sql
```

Expected: the first command has no matches. The second command matches only the intentional backfill, old-constraint removal, and column drop in the new migration.

- [ ] **Step 6: Run fresh full verification**

Run:

```bash
npm run db:generate
npx prisma validate
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" npm run db:deploy
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" npm run test:run
npm run lint
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" npm run build
npm run test:e2e
docker compose config
git diff --check
```

Expected: migration is applied, all Vitest and Playwright tests pass, lint and build exit 0, Compose validates, and Git reports no whitespace errors.

- [ ] **Step 7: Commit the E2E and documentation deliverable**

```bash
git add tests/e2e/factory-flow.spec.ts docs/project-current-state.md
git commit -m "test: cover machine multi-order production flow"
```
