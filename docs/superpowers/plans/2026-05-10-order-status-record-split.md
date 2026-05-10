# Order Status and Record Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the new CNC order status flow, optional order quantities, split machining/shipping records, and simplified machine naming.

**Architecture:** Keep the existing Next.js server action and Prisma service structure. Put status transitions in order/drawing/machine services, keep record splitting in the record service, and let pages remain mostly presentation/form wiring.

**Tech Stack:** Next.js App Router, React server components, Prisma, PostgreSQL, Vitest, Playwright.

---

## File Structure

- Modify `prisma/schema.prisma` and add one migration for nullable planned quantity, new order statuses, and split production record rows.
- Modify `src/domain/factory.ts` for optional planned quantities and typed record summaries.
- Modify `src/domain/money.ts` so order amount is unavailable when quantity is missing.
- Modify `src/components/status-badge.tsx` for new order status labels/classes.
- Modify `src/server/services/orders.ts`, `order-drawings.ts`, `machines.ts`, and `records.ts` for lifecycle transitions and record splitting.
- Modify `src/app/actions/orders.ts`, `machines.ts`, and `records.ts` for optional fields and manual status editing.
- Modify machine, order, and record pages under `src/app/(dashboard)` for UI labels, status editing, and record dialogs.
- Update unit, integration, page, and e2e tests under `tests/`.

## Tasks

### Task 1: Schema and Migration

- [ ] Update Prisma enums and models:

```prisma
enum OrderStatus {
  development_pending
  processing_pending
  in_progress
  completed
}

enum ProductionRecordType {
  completed
  shipped
}

model Order {
  plannedQuantity Int?
  status          OrderStatus @default(development_pending)
}

model ProductionRecord {
  type     ProductionRecordType
  quantity Int
}
```

- [ ] Add a SQL migration that replaces the status enum, makes planned quantity nullable, deletes old production rows, and replaces completed/shipped columns with `type`/`quantity`.
- [ ] Run `npx prisma generate`.

### Task 2: Domain and Services

- [ ] Update `summarizeOrder` to accept `plannedQuantity: number | null` and records shaped as `{ type, quantity }`.
- [ ] Update order creation so blank planned quantity is accepted and new orders default to `development_pending`.
- [ ] Add `updateOrderStatus(workspaceId, orderId, status)` and replace old close/reopen behavior.
- [ ] Update drawing replacement to move `development_pending` orders to `processing_pending`.
- [ ] Update machine linking to reject `completed` orders and move pending orders to `in_progress`.
- [ ] Update record creation to create one row per positive quantity while keeping the existing machine entry form inputs.

### Task 3: Actions and UI

- [ ] Update create order action to parse planned quantity as optional.
- [ ] Add/update order status action for manual status changes.
- [ ] Update order pages for the four statuses and optional quantity/amount displays.
- [ ] Update machine pages to use "机器名称" only and remove model/location display from detail.
- [ ] Update records page so each row has a `修改` dialog that edits one split record row.

### Task 4: Tests

- [ ] Update domain tests for optional planned quantities and split record summaries.
- [ ] Update action/service tests for status transitions and split record creation.
- [ ] Update page tests for new labels, dialogs, and optional fields.
- [ ] Update e2e flow expectations for the split records.

### Task 5: Verification and Data Reset

- [ ] Apply the migration to the local development database.
- [ ] Clear local business test data while preserving auth/workspace bootstrap data.
- [ ] Run `npm test`, `npm run lint`, and browser/e2e checks.
- [ ] Commit and push the implementation to `origin/factory-mvp`.
