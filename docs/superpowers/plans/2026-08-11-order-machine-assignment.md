# Order Machine Assignment Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow managers to add and remove machine assignments directly from an existing order detail page.

**Architecture:** Reuse the existing `MachineOrderAssignment` services and add order-oriented Server Actions whose success redirect stays on the order detail page. The order detail page loads all workspace machines alongside the order, derives unassigned choices, and renders manager-only controls; the service transaction enforces the completed-order unlink lock.

**Tech Stack:** Next.js 15 App Router, React 19 Server Components and Server Actions, TypeScript, Prisma/PostgreSQL, Vitest/Testing Library, Playwright.

## Global Constraints

- Only managers may add or remove assignments from the order detail page; employees remain read-only.
- Completed orders expose no assignment mutation controls and reject add or remove requests in the backend.
- Add one machine at a time and remove one current assignment at a time; do not implement bulk replacement.
- Keep new-order machine multi-select and machine-side production entry behavior unchanged.
- Add no schema migration and no dependency.

---

### Task 1: Lock completed orders against assignment removal

**Files:**
- Modify: `src/server/services/machines.ts:128-146`
- Test: `tests/integration/factory-services.test.ts`

**Interfaces:**
- Consumes: `unlinkMachineFromOrder(workspaceId: string, machineId: string, orderId: string)` and the existing transaction locks.
- Produces: the same function, now rejecting a completed order with `订单已完成，不能解除关联机器` before deleting the assignment.

- [ ] **Step 1: Write the failing integration test**

Create a workspace, machine, and order, link them, complete the order, then assert both the error and preservation of the join row:

```ts
it("rejects unlinking a machine from a completed order", async () => {
  const workspace = await createWorkspace();
  const machine = await createMachine(workspace.id, {
    code: "LOCK-1",
    name: "锁定机",
    model: "",
    location: "",
    status: "active",
    notes: "",
  });
  const order = await createOrder(workspace.id, {
    customerName: "锁定客户",
    partName: "锁定工件",
    plannedQuantity: 10,
    unitPriceCents: null,
    dueDate: null,
    notes: "",
  });
  await linkMachineToOrder(workspace.id, machine.id, order.id);
  await updateOrderStatus(workspace.id, order.id, "completed");

  await expect(
    unlinkMachineFromOrder(workspace.id, machine.id, order.id),
  ).rejects.toThrow("订单已完成，不能解除关联机器");
  await expect(
    prisma.machineOrderAssignment.findUnique({
      where: {
        workspaceId_machineId_orderId: {
          workspaceId: workspace.id,
          machineId: machine.id,
          orderId: order.id,
        },
      },
    }),
  ).resolves.not.toBeNull();
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
DATABASE_URL='postgresql://factory:factory_password@localhost:5432/factory?schema=public' npx vitest run tests/integration/factory-services.test.ts -t 'rejects unlinking a machine from a completed order'
```

Expected: FAIL because `unlinkMachineFromOrder` currently deletes the assignment.

- [ ] **Step 3: Add the transaction guard**

After `lockOrderForUpdate` succeeds and before `deleteMany`, add:

```ts
if (order.status === "completed") {
  throw new Error("订单已完成，不能解除关联机器");
}
```

- [ ] **Step 4: Run the focused service tests and verify GREEN**

```bash
DATABASE_URL='postgresql://factory:factory_password@localhost:5432/factory?schema=public' npx vitest run tests/integration/factory-services.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the service lock**

```bash
git add src/server/services/machines.ts tests/integration/factory-services.test.ts
git commit -m "fix: lock completed order machine assignments"
```

### Task 2: Add manager-only order assignment actions

**Files:**
- Modify: `src/app/actions/orders.ts`
- Test: `tests/actions/orders.test.ts`

**Interfaces:**
- Consumes: `linkMachineToOrder(workspaceId, machineId, orderId)`, `unlinkMachineFromOrder(workspaceId, machineId, orderId)`, and `requireManager()`.
- Produces: `linkOrderMachineAction(formData: FormData)` and `unlinkOrderMachineAction(formData: FormData)`; both accept `orderId` and `machineId`, revalidate both sides, and redirect to `/orders/<orderId>`.

- [ ] **Step 1: Extend action mocks and write failing success tests**

Add `machinesMock`, mock `@/server/services/machines`, and add tests with literal path expectations:

```ts
it("links a machine from an order and returns to the order detail", async () => {
  const { linkOrderMachineAction } = await import("@/app/actions/orders");
  const form = new FormData();
  form.set("orderId", "order-1");
  form.set("machineId", "machine-2");

  await linkOrderMachineAction(form);

  expect(machinesMock.linkMachineToOrder).toHaveBeenCalledWith(
    "workspace-1",
    "machine-2",
    "order-1",
  );
  expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/machines");
  expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/machines/machine-2");
  expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/orders");
  expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/orders/order-1");
  expect(navigationMock.redirect).toHaveBeenCalledWith("/orders/order-1");
});

it("unlinks a machine from an order and returns to the order detail", async () => {
  const { unlinkOrderMachineAction } = await import("@/app/actions/orders");
  const form = new FormData();
  form.set("orderId", "order-1");
  form.set("machineId", "machine-2");

  await unlinkOrderMachineAction(form);

  expect(machinesMock.unlinkMachineFromOrder).toHaveBeenCalledWith(
    "workspace-1",
    "machine-2",
    "order-1",
  );
  expect(navigationMock.redirect).toHaveBeenCalledWith("/orders/order-1");
});
```

- [ ] **Step 2: Write failing authorization and parameter tests**

```ts
it.each([
  ["linkOrderMachineAction", "linkMachineToOrder"],
  ["unlinkOrderMachineAction", "unlinkMachineFromOrder"],
] as const)("rejects employee access through %s", async (actionName, serviceName) => {
  authMock.requireManager.mockRejectedValue(new Error("需要经理权限"));
  const actions = await import("@/app/actions/orders");
  const form = new FormData();
  form.set("orderId", "order-1");
  form.set("machineId", "machine-2");

  await expect(actions[actionName](form)).rejects.toThrow("需要经理权限");
  expect(machinesMock[serviceName]).not.toHaveBeenCalled();
});

it("rejects an empty machine when linking from an order", async () => {
  const { linkOrderMachineAction } = await import("@/app/actions/orders");
  const form = new FormData();
  form.set("orderId", "order-1");

  await expect(linkOrderMachineAction(form)).rejects.toThrow("机器必填");
  expect(machinesMock.linkMachineToOrder).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run the action tests and verify RED**

```bash
npx vitest run tests/actions/orders.test.ts
```

Expected: FAIL because both order-side action exports are missing.

- [ ] **Step 4: Implement the two actions**

```ts
import {
  linkMachineToOrder,
  unlinkMachineFromOrder,
} from "@/server/services/machines";

function getMachineId(formData: FormData): string {
  const machineId = getString(formData, "machineId").trim();
  if (!machineId) throw new Error("机器必填");
  return machineId;
}

function revalidateOrderMachineAssignment(orderId: string, machineId: string) {
  revalidatePath("/machines");
  revalidatePath(`/machines/${machineId}`);
  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
}

export async function linkOrderMachineAction(formData: FormData) {
  const user = await requireManager();
  const orderId = getOrderId(formData);
  const machineId = getMachineId(formData);
  await linkMachineToOrder(user.workspaceId, machineId, orderId);
  revalidateOrderMachineAssignment(orderId, machineId);
  redirect(`/orders/${orderId}`);
}

export async function unlinkOrderMachineAction(formData: FormData) {
  const user = await requireManager();
  const orderId = getOrderId(formData);
  const machineId = getMachineId(formData);
  await unlinkMachineFromOrder(user.workspaceId, machineId, orderId);
  revalidateOrderMachineAssignment(orderId, machineId);
  redirect(`/orders/${orderId}`);
}
```

- [ ] **Step 5: Run the action tests and verify GREEN**

```bash
npx vitest run tests/actions/orders.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the actions**

```bash
git add src/app/actions/orders.ts tests/actions/orders.test.ts
git commit -m "feat: manage machine assignments from orders"
```

### Task 3: Render assignment controls on the order detail page

**Files:**
- Create: `src/components/unlink-machine-order-button.tsx`
- Modify: `src/app/(dashboard)/machines/[id]/page.tsx`
- Delete: `src/app/(dashboard)/machines/[id]/unlink-order-button.tsx`
- Modify: `src/app/(dashboard)/orders/[id]/page.tsx`
- Test: `tests/components/delete-buttons.test.tsx`
- Test: `tests/pages/orders-page.test.tsx`

**Interfaces:**
- Consumes: Task 2 actions, `listMachines(workspaceId)`, `SelectInput`, and current `order.machineAssignments`.
- Produces: shared `UnlinkMachineOrderButton`; manager-only order detail forms using `machineId` and `orderId`; no forms when `order.status === "completed"`.

- [ ] **Step 1: Write failing page tests for manager controls**

For an in-progress order assigned to `machine-1`, return three machines from `listMachines`. Assert the assignment region has an `解除关联` button, the `可关联机器` select contains only `machine-2` and `machine-3`, and the add form is visible:

```ts
const assignmentRegion = screen.getByRole("region", { name: "关联机器" });
expect(
  within(assignmentRegion).getByRole("button", { name: "解除关联" }),
).toBeInTheDocument();
const select = within(assignmentRegion).getByLabelText("可关联机器");
expect(
  within(select).queryByRole("option", { name: "1号机" }),
).not.toBeInTheDocument();
expect(
  within(select).getByRole("option", { name: "2号机" }),
).toBeInTheDocument();
expect(
  within(select).getByRole("option", { name: "3号机" }),
).toBeInTheDocument();
expect(
  within(assignmentRegion).getByRole("button", { name: "保存关联" }),
).toBeInTheDocument();
```

- [ ] **Step 2: Write failing read-only and empty-choice page tests**

Extend the employee detail test to assert no `解除关联`, no `可关联机器`, and no `保存关联`. Extend the completed-order test to assert the same and expect `订单已完成，不能调整机器关联。`. Add a manager test where every machine is assigned and expect `当前没有其他可关联机器。` without a select.

- [ ] **Step 3: Write the failing shared confirmation button test**

Update the destructive button test to import `UnlinkMachineOrderButton`, assert red styling, and prove cancellation/submission using this literal confirmation:

```ts
expect(confirmSpy).toHaveBeenCalledWith(
  "确定解除这台机器与该订单的关联吗？已有生产记录会保留。",
);
```

- [ ] **Step 4: Run page and button tests and verify RED**

```bash
npx vitest run tests/pages/orders-page.test.tsx tests/components/delete-buttons.test.tsx
```

Expected: FAIL because order detail controls and the shared button do not exist.

- [ ] **Step 5: Extract the shared unlink button**

Create `src/components/unlink-machine-order-button.tsx` with the existing red button behavior, export it as `UnlinkMachineOrderButton`, label it `解除关联`, and use the confirmation text from Step 3. Update the machine detail page import and usage, then remove the route-local component file.

- [ ] **Step 6: Load machines and derive available choices**

In the order detail page, import `listMachines`, both Task 2 actions, and the shared button. Replace the single order read with:

```ts
const [order, machines] = await Promise.all([
  getOrderWithSummary(user.workspaceId, id),
  listMachines(user.workspaceId),
]);
const assignedMachineIds = new Set(
  order.machineAssignments.map((assignment) => assignment.machine.id),
);
const availableMachines = machines.filter(
  (machine) => !assignedMachineIds.has(machine.id),
);
const availableMachineOptions = availableMachines.map((machine) => ({
  value: machine.id,
  label: machine.code,
}));
const canManageAssignments = canManageOrders && order.status !== "completed";
```

- [ ] **Step 7: Render add and remove forms**

Inside each current assignment row, conditionally render a form posting `orderId` and `machineId` to `unlinkOrderMachineAction` with `UnlinkMachineOrderButton`. Below the list, when `canManageAssignments` is true, render either the empty-choice message or:

```tsx
<form action={linkOrderMachineAction} className="mt-4 grid gap-4">
  <input type="hidden" name="orderId" value={order.id} />
  <SelectInput
    label="可关联机器"
    name="machineId"
    defaultValue={availableMachines[0]?.id}
    options={availableMachineOptions}
    required
  />
  <SubmitButton>保存关联</SubmitButton>
</form>
```

When the order is completed, render `订单已完成，不能调整机器关联。`. Employees receive no mutation hint or controls.

- [ ] **Step 8: Run page and component tests and verify GREEN**

```bash
npx vitest run tests/pages/orders-page.test.tsx tests/components/delete-buttons.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Run focused lint and commit the UI**

```bash
npx eslint 'src/app/(dashboard)/orders/[id]/page.tsx' 'src/app/(dashboard)/machines/[id]/page.tsx' src/components/unlink-machine-order-button.tsx tests/pages/orders-page.test.tsx tests/components/delete-buttons.test.tsx
git add 'src/app/(dashboard)/orders/[id]/page.tsx' 'src/app/(dashboard)/machines/[id]/page.tsx' src/components/unlink-machine-order-button.tsx 'src/app/(dashboard)/machines/[id]/unlink-order-button.tsx' tests/pages/orders-page.test.tsx tests/components/delete-buttons.test.tsx
git commit -m "feat: edit machine assignments on order detail"
```

### Task 4: Cover the order-side workflow and update documentation

**Files:**
- Modify: `tests/e2e/factory-flow.spec.ts`
- Modify: `docs/project-current-state.md`

**Interfaces:**
- Consumes: manager order detail assignment forms from Task 3.
- Produces: a browser regression covering add/remove and documentation of the new entry point.

- [ ] **Step 1: Write the E2E flow**

Add one test named `manages machines from an order detail` that creates an order and two uniquely named machines, opens the order detail, chooses the first machine from `可关联机器`, saves, verifies its link appears, removes it after accepting the confirmation dialog, verifies it disappears, then adds the second machine and follows its link to confirm that machine detail lists the order under `关联订单`.

- [ ] **Step 2: Establish RED evidence**

The page tests in Task 3 provide the mandatory RED proof for the same missing controls before implementation. If this task is executed before Task 3, additionally run:

```bash
NO_PROXY='127.0.0.1,localhost' no_proxy='127.0.0.1,localhost' DATABASE_URL='postgresql://factory:factory_password@localhost:5432/factory?schema=public' npm run test:e2e -- --grep 'manages machines from an order detail' --project=chromium-desktop
```

Expected RED cause: `可关联机器` is absent before the production UI exists.

- [ ] **Step 3: Update current-state documentation**

Under the order workflow section in `docs/project-current-state.md`, add:

```md
- 经理可在已有订单详情页直接添加或解除关联机器；员工只读。
- 完成订单不能调整机器关联，重新打开订单后恢复操作。
```

- [ ] **Step 4: Run the focused E2E and verify GREEN**

Run the command from Step 2. Expected: PASS on Chromium desktop.

- [ ] **Step 5: Commit the workflow coverage**

```bash
git add tests/e2e/factory-flow.spec.ts docs/project-current-state.md
git commit -m "test: cover order-side machine assignments"
```

### Task 5: Full verification

**Files:**
- Verify only; no planned production changes.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: evidence that database, unit, integration, browser, build, lint, and deployment configuration remain valid.

- [ ] **Step 1: Verify Prisma and migrations**

```bash
npm run db:generate
npx prisma validate
DATABASE_URL='postgresql://factory:factory_password@localhost:5432/factory?schema=public' npm run db:deploy
```

- [ ] **Step 2: Run all Vitest tests and lint**

```bash
DATABASE_URL='postgresql://factory:factory_password@localhost:5432/factory?schema=public' npm run test:run
npm run lint
```

- [ ] **Step 3: Run the production build**

```bash
DATABASE_URL='postgresql://factory:factory_password@localhost:5432/factory?schema=public' npm run build
```

- [ ] **Step 4: Run all desktop and mobile E2E tests**

```bash
NO_PROXY='127.0.0.1,localhost' no_proxy='127.0.0.1,localhost' DATABASE_URL='postgresql://factory:factory_password@localhost:5432/factory?schema=public' npm run test:e2e
```

- [ ] **Step 5: Check deployment config and repository cleanliness**

```bash
docker compose config >/tmp/factory-compose-config.yml
git diff --check
git status --short --branch
```

Expected: every command succeeds and the tracked worktree is clean after the final commit.
