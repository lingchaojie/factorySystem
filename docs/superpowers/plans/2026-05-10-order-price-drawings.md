# Order Price, Drawings, and Auto Order Numbers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add automatic order numbers, order pricing, order drawing upload/download with overwrite behavior, and order detail links from machine pages.

**Architecture:** Keep business rules in `src/server/services/*`, parse form input in `src/app/actions/orders.ts`, and render data in server components. Store drawing files on local disk under a configurable root and store metadata in PostgreSQL through Prisma so Docker can persist uploads with a mounted volume.

**Tech Stack:** Next.js App Router, React Server Components, Server Actions, Prisma, PostgreSQL, Vitest, React Testing Library, Playwright.

---

## File Structure

- Modify `prisma/schema.prisma` to add `Order.unitPriceCents`, a per-workspace unique order number constraint, and `OrderDrawing`.
- Add `prisma/migrations/<timestamp>_add_order_price_drawings/migration.sql` for database changes.
- Modify `src/server/services/orders.ts` for auto order numbers, price persistence, and drawing includes.
- Add `src/domain/money.ts` for yuan-to-cents parsing and currency formatting helpers.
- Add `src/server/services/order-drawings.ts` for overwrite upload, path sanitization, and download lookup.
- Modify `src/app/actions/orders.ts` for price parsing and drawing upload action.
- Add `src/app/api/order-drawings/[id]/route.ts` for protected downloads.
- Modify `src/app/(dashboard)/orders/page.tsx` and `src/app/(dashboard)/orders/[id]/page.tsx` for price and drawing UI.
- Modify `src/app/(dashboard)/machines/[id]/page.tsx` for order detail links.
- Modify `docker-compose.yml`, `.gitignore`, and `.dockerignore` to persist and ignore local upload storage.
- Update tests under `tests/actions`, `tests/integration`, `tests/pages`, and `tests/e2e`.

## Task 1: Schema and Migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260510120000_add_order_price_drawings/migration.sql`

- [ ] **Step 1: Write the expected schema shape**

Add these Prisma fields and relations:

```prisma
model Workspace {
  orderDrawings OrderDrawing[]
}

model Order {
  unitPriceCents Int?
  drawings       OrderDrawing[]

  @@unique([workspaceId, orderNo])
}

model OrderDrawing {
  id           String   @id @default(cuid())
  workspaceId  String
  orderId      String
  originalName String
  relativePath String
  storedPath   String
  sizeBytes    Int
  mimeType     String?
  createdAt    DateTime @default(now())

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  order     Order     @relation(fields: [workspaceId, orderId], references: [workspaceId, id], onDelete: Cascade)

  @@unique([workspaceId, id])
  @@index([workspaceId, orderId])
}
```

- [ ] **Step 2: Add SQL migration**

Migration SQL must:

```sql
ALTER TABLE "Order" ADD COLUMN "unitPriceCents" INTEGER;

UPDATE "Order"
SET "orderNo" = 'LEGACY-' || left("id", 12)
WHERE "orderNo" IS NULL OR btrim("orderNo") = '';

ALTER TABLE "Order" ALTER COLUMN "orderNo" SET NOT NULL;

CREATE UNIQUE INDEX "Order_workspaceId_orderNo_key" ON "Order"("workspaceId", "orderNo");

CREATE TABLE "OrderDrawing" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "relativePath" TEXT NOT NULL,
  "storedPath" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "mimeType" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderDrawing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderDrawing_workspaceId_id_key" ON "OrderDrawing"("workspaceId", "id");
CREATE INDEX "OrderDrawing_workspaceId_orderId_idx" ON "OrderDrawing"("workspaceId", "orderId");

ALTER TABLE "OrderDrawing"
ADD CONSTRAINT "OrderDrawing_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderDrawing"
ADD CONSTRAINT "OrderDrawing_workspaceId_orderId_fkey"
FOREIGN KEY ("workspaceId", "orderId") REFERENCES "Order"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Generate Prisma client**

Run:

```bash
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" npx prisma generate
```

Expected: Prisma client generation succeeds.

## Task 2: Money and Auto Order Numbers

**Files:**
- Create: `src/domain/money.ts`
- Modify: `src/server/services/orders.ts`
- Modify: `tests/actions/orders.test.ts`
- Modify: `tests/integration/factory-services.test.ts`

- [ ] **Step 1: Write failing action test**

Update `tests/actions/orders.test.ts` so `createOrderAction` ignores any submitted `orderNo` and passes `unitPriceCents`.

Expected assertion:

```ts
expect(ordersMock.createOrder).toHaveBeenCalledWith("workspace-1", {
  customerName: " 甲方工厂 ",
  partName: " 法兰盘 ",
  plannedQuantity: 25,
  dueDate: new Date("2026-05-09T16:00:00.000Z"),
  notes: " 加急 ",
  unitPriceCents: 1234,
});
```

- [ ] **Step 2: Run action test and verify red**

Run:

```bash
npm run test:run -- tests/actions/orders.test.ts
```

Expected: FAIL because `unitPriceCents` is not parsed and `orderNo` is still passed.

- [ ] **Step 3: Write failing service test**

Add an integration test that creates two orders without `orderNo` and asserts generated numbers match `ORD-YYYYMMDD-NNNN`, are unique, and store `unitPriceCents`.

Use:

```ts
expect(first.orderNo).toMatch(/^ORD-\d{8}-0001$/);
expect(second.orderNo).toMatch(/^ORD-\d{8}-0002$/);
expect(first.unitPriceCents).toBe(1250);
```

- [ ] **Step 4: Run service test and verify red**

Run:

```bash
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" npm run test:run -- tests/integration/factory-services.test.ts
```

Expected: FAIL because `CreateOrderInput` still requires `orderNo`.

- [ ] **Step 5: Implement money helper and order generation**

Add:

```ts
export function parseOptionalYuanToCents(value: string): number | null;
export function formatCnyFromCents(cents: number | null | undefined): string;
export function getOrderAmountCents(unitPriceCents: number | null, plannedQuantity: number): number | null;
```

Change `CreateOrderInput` to remove `orderNo` and add `unitPriceCents: number | null`.

Generate order numbers in `createOrder` by reading the highest existing `orderNo` with the current `ORD-YYYYMMDD-` prefix for the workspace, then retrying create up to 5 times on Prisma unique constraint `P2002`.

- [ ] **Step 6: Run tests and verify green**

Run:

```bash
npm run test:run -- tests/actions/orders.test.ts
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" npm run test:run -- tests/integration/factory-services.test.ts
```

Expected: both pass.

## Task 3: Drawing Storage Service

**Files:**
- Create: `src/server/services/order-drawings.ts`
- Modify: `tests/integration/factory-services.test.ts`

- [ ] **Step 1: Write failing overwrite test**

Add an integration test that creates an order, uploads two drawings, uploads one replacement drawing, and asserts only the replacement record and file remain.

Use Node `File` objects:

```ts
new File(["first"], "part-a.step", { type: "model/step" })
```

Set `process.env.ORDER_DRAWING_STORAGE_DIR` to a temporary directory in the test and clean it afterward.

- [ ] **Step 2: Run test and verify red**

Run:

```bash
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" npm run test:run -- tests/integration/factory-services.test.ts
```

Expected: FAIL because `replaceOrderDrawings` does not exist.

- [ ] **Step 3: Implement drawing service**

Create `replaceOrderDrawings(workspaceId, orderId, files)` and `getOrderDrawingFile(workspaceId, drawingId)`.

Rules:

```ts
const MAX_DRAWING_FILES = 200;
const MAX_DRAWING_FILE_BYTES = 100 * 1024 * 1024;
const MAX_DRAWING_TOTAL_BYTES = 500 * 1024 * 1024;
```

Sanitize path segments by trimming, replacing invalid characters with `_`, rejecting `..`, and generating duplicate suffixes such as `file-2.step`.

- [ ] **Step 4: Run integration test and verify green**

Run:

```bash
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" npm run test:run -- tests/integration/factory-services.test.ts
```

Expected: pass.

## Task 4: Actions, Download Route, and Order Pages

**Files:**
- Modify: `src/app/actions/orders.ts`
- Add: `src/app/api/order-drawings/[id]/route.ts`
- Modify: `src/app/(dashboard)/orders/page.tsx`
- Modify: `src/app/(dashboard)/orders/[id]/page.tsx`
- Modify: `tests/pages/orders-page.test.tsx`
- Modify: `tests/actions/orders.test.ts`

- [ ] **Step 1: Write failing page tests**

Update order page tests to assert:

```ts
expect(screen.queryByLabelText("订单号")).not.toBeInTheDocument();
expect(screen.getByLabelText("单价（元/件）")).toBeInTheDocument();
expect(screen.getByText("重新上传会覆盖原有图纸")).toBeInTheDocument();
```

- [ ] **Step 2: Run page tests and verify red**

Run:

```bash
npm run test:run -- tests/pages/orders-page.test.tsx
```

Expected: FAIL because UI has no price input or drawing section.

- [ ] **Step 3: Implement action and route**

Add `uploadOrderDrawingsAction(formData)`:

```ts
const orderId = getOrderId(formData);
const files = formData.getAll("drawings").filter((value): value is File => value instanceof File && value.size > 0);
await replaceOrderDrawings(workspaceId, orderId, files);
revalidatePath("/orders");
revalidatePath(`/orders/${orderId}`);
redirect(`/orders/${orderId}`);
```

Add route `GET /api/order-drawings/[id]` that calls `readSessionUser()`, returns 401 without a user, calls `getOrderDrawingFile(user.workspaceId, id)`, and returns the file bytes with `Content-Disposition: attachment`.

- [ ] **Step 4: Implement order list and detail UI**

Remove order number input from create form, add `unitPrice` number input, display unit price and total amount, include `drawings` in order detail service data, and render upload/download controls.

Use server components and avoid client state for upload forms.

- [ ] **Step 5: Run tests and verify green**

Run:

```bash
npm run test:run -- tests/actions/orders.test.ts tests/pages/orders-page.test.tsx
```

Expected: pass.

## Task 5: Machine Order Links

**Files:**
- Modify: `src/app/(dashboard)/machines/[id]/page.tsx`
- Modify: `src/app/(dashboard)/machines/page.tsx` if list currently shows current order as plain text.
- Modify: `tests/pages/machine-detail.test.tsx`

- [ ] **Step 1: Write failing page test**

Assert current order and record order links point to `/orders/order-1`.

```ts
expect(screen.getByRole("link", { name: /A-001/ })).toHaveAttribute("href", "/orders/order-1");
```

- [ ] **Step 2: Run test and verify red**

Run:

```bash
npm run test:run -- tests/pages/machine-detail.test.tsx
```

Expected: FAIL because order text is not linked.

- [ ] **Step 3: Implement links**

Wrap current order text and record order text in Next `Link` components with `href={`/orders/${order.id}`}` while keeping status badges unchanged.

- [ ] **Step 4: Run test and verify green**

Run:

```bash
npm run test:run -- tests/pages/machine-detail.test.tsx
```

Expected: pass.

## Task 6: Docker Storage and Full Verification

**Files:**
- Modify: `.gitignore`
- Modify: `.dockerignore`
- Modify: `docker-compose.yml`
- Modify: `tests/e2e/factory-flow.spec.ts`

- [ ] **Step 1: Add storage ignores and Docker volume**

Ignore local uploaded files:

```gitignore
storage/
```

Mount persistent storage in compose:

```yaml
volumes:
  order-drawings-data:

services:
  web:
    volumes:
      - order-drawings-data:/app/storage/order-drawings
```

- [ ] **Step 2: Update e2e flow**

Create an order with price, assert an auto order number is visible, link it to a machine, and click the machine page order link back to order detail.

- [ ] **Step 3: Apply migration locally**

Run:

```bash
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" npx prisma migrate dev
```

Expected: migration applies cleanly.

- [ ] **Step 4: Run full verification**

Run:

```bash
npm run lint
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" npm run test:run
npm run build
npm run test:e2e
docker compose config
```

Expected: all pass. Docker image pull may still depend on Docker Hub network; if `docker compose up --build` fails only because of registry timeout, record that separately.

- [ ] **Step 5: Restart dev server**

Restart Next dev server with:

```bash
env DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" BOOTSTRAP_USERNAME=admin BOOTSTRAP_PASSWORD=change-me-before-use APP_ORIGIN=http://localhost:3000 SESSION_COOKIE_SECURE=false npm run dev
```

Expected: Windows browser can open `http://localhost:3000`.
