# Admin Roles Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a platform admin area for creating workspaces and customer accounts, customer roles, manager-only analytics, workspace branding, and production-record user attribution.

**Architecture:** Store platform admins, customer user roles, display names, and record attribution in Postgres through Prisma migrations. Keep platform admin authentication separate from customer authentication with a separate cookie/session table, and enforce customer permissions in server actions plus server-rendered UI. Analytics is a manager-only server-rendered dashboard computed from production records and order prices.

**Tech Stack:** Next.js App Router, Prisma/Postgres, bcryptjs, server actions, Tailwind CSS, Vitest, Playwright.

---

### Task 1: Data Model And Seed

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260510170000_admin_roles_analytics/migration.sql`
- Modify: `prisma/seed.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing model-oriented tests**

Add tests in `tests/auth/auth.test.ts`, `tests/auth/session.test.ts`, and `tests/integration/factory-services.test.ts` expecting:

```ts
expect(result).toMatchObject({
  username: "operator",
  displayName: "张三",
  role: "manager",
  workspace: { name: "精密加工一厂" },
});
```

and production record users:

```ts
expect(record.createdByUserId).toBe(user.id);
expect(record.updatedByUserId).toBe(user.id);
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
DATABASE_URL='postgresql://factory:factory_password@localhost:5432/factory?schema=public' npm test -- --run tests/auth/auth.test.ts tests/auth/session.test.ts tests/integration/factory-services.test.ts
```

Expected: fail because role/displayName/workspace/admin models and record attribution fields do not exist.

- [ ] **Step 3: Add Prisma schema and migration**

Add:

```prisma
enum UserRole {
  manager
  employee
}

model PlatformAdmin {
  id           String   @id @default(cuid())
  username     String   @unique
  displayName  String
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  sessions PlatformAdminSession[]
}

model PlatformAdminSession {
  id        String   @id @default(cuid())
  adminId   String
  tokenHash String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())

  admin PlatformAdmin @relation(fields: [adminId], references: [id], onDelete: Cascade)

  @@index([adminId])
  @@index([expiresAt])
}
```

Update `User`:

```prisma
displayName  String
role         UserRole @default(manager)
@@unique([username])
```

Update `ProductionRecord`:

```prisma
createdByUserId String?
updatedByUserId String?
createdByUser   User? @relation("ProductionRecordCreatedBy", fields: [createdByUserId], references: [id], onDelete: SetNull)
updatedByUser   User? @relation("ProductionRecordUpdatedBy", fields: [updatedByUserId], references: [id], onDelete: SetNull)
```

Add matching relation arrays on `User`.

- [ ] **Step 4: Update seed**

Seed a platform admin from `PLATFORM_ADMIN_USERNAME`, `PLATFORM_ADMIN_PASSWORD`, `PLATFORM_ADMIN_DISPLAY_NAME`, falling back to the old `BOOTSTRAP_*` names for deploy-script compatibility. If bootstrap customer env vars are present, preserve a manager customer account for local continuity.

- [ ] **Step 5: Run migration/generate and tests**

Run:

```bash
DATABASE_URL='postgresql://factory:factory_password@localhost:5432/factory?schema=public' npx prisma migrate dev --name admin_roles_analytics
npm run db:generate
DATABASE_URL='postgresql://factory:factory_password@localhost:5432/factory?schema=public' npm test -- --run tests/auth/auth.test.ts tests/auth/session.test.ts tests/integration/factory-services.test.ts
```

Expected: tests pass after implementation.

### Task 2: Customer Authentication And Permission Helpers

**Files:**
- Modify: `src/lib/session.ts`
- Modify: `src/lib/auth.ts`
- Modify: `src/lib/workspace.ts`
- Modify: `src/components/app-shell.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Write failing tests**

Update auth tests to expect global username lookup:

```ts
expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
  where: { username: "operator" },
  select: expect.objectContaining({ role: true, displayName: true, workspace: true }),
});
```

Add app-shell test expecting workspace title and analytics hidden for employee:

```tsx
render(<AppShell user={{ username: "u", displayName: "张三", role: "employee", workspaceName: "精密加工一厂" }}>内容</AppShell>);
expect(screen.getByText("精密加工一厂")).toBeInTheDocument();
expect(screen.queryByRole("link", { name: "经营" })).not.toBeInTheDocument();
```

- [ ] **Step 2: Implement auth helpers**

`AuthenticatedUser` includes `displayName`, `role`, and `workspace.name`. `loginWithPassword` uses `where: { username }`. Add:

```ts
export async function requireManager() {
  const user = await requireUser();
  if (user.role !== "manager") redirect("/");
  return user;
}
```

- [ ] **Step 3: Update shell branding and nav**

`AppShell` displays `workspaceName` as the product title and adds manager-only `/analytics` nav item.

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- --run tests/auth/auth.test.ts tests/auth/session.test.ts tests/components/shared-ui.test.tsx
```

Expected: pass.

### Task 3: Platform Admin Authentication And Admin Console

**Files:**
- Create: `src/lib/admin-session.ts`
- Create: `src/lib/admin-auth.ts`
- Create: `src/server/services/platform-admin.ts`
- Create: `src/app/admin/login/page.tsx`
- Create: `src/app/api/admin/auth/login/route.ts`
- Create: `src/app/api/admin/auth/logout/route.ts`
- Create: `src/app/admin/layout.tsx`
- Create: `src/app/admin/page.tsx`
- Create: `src/app/admin/workspaces/page.tsx`
- Create: `src/app/admin/accounts/page.tsx`
- Create: `src/app/admin/admins/page.tsx`
- Create: `src/app/admin/actions.ts`
- Test: `tests/auth/admin-auth.test.ts`
- Test: `tests/actions/admin.test.ts`
- Test: `tests/pages/admin-pages.test.tsx`

- [ ] **Step 1: Write failing tests for admin login and actions**

Tests must verify:

```ts
await expect(createWorkspaceAction(form)).resolves.toBeUndefined();
expect(adminService.createWorkspaceWithAccount).toHaveBeenCalledWith({
  workspaceName: "精密加工一厂",
  username: "factory001",
  displayName: "王经理",
  password: "secret123",
  role: "manager",
});
```

and admin auth reads/writes `factory_admin_session`.

- [ ] **Step 2: Implement separate admin session/auth**

Use `PlatformAdminSession`, `factory_admin_session`, and `readPlatformAdminSession`.

- [ ] **Step 3: Implement admin services and actions**

Services create workspaces, customer users, and platform admins. Customer usernames are globally unique and passwords are hashed.

- [ ] **Step 4: Implement admin pages**

Pages include workspace creation, account creation with workspace select and role select, and platform admin creation. Keep UI utilitarian and table-based.

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- --run tests/auth/admin-auth.test.ts tests/actions/admin.test.ts tests/pages/admin-pages.test.tsx
```

Expected: pass.

### Task 4: Customer Role Enforcement

**Files:**
- Modify: `src/app/actions/orders.ts`
- Modify: `src/app/(dashboard)/orders/page.tsx`
- Modify: `src/app/(dashboard)/orders/[id]/page.tsx`
- Modify: `src/app/(dashboard)/orders/[id]/order-drawing-upload.tsx`
- Test: `tests/actions/orders.test.ts`
- Test: `tests/pages/orders-page.test.tsx`

- [ ] **Step 1: Write failing tests**

Expect employee cannot create or modify orders:

```ts
workspaceMock.requireManager.mockRejectedValue(new Error("需要经理权限"));
await expect(createOrderAction(form)).rejects.toThrow("需要经理权限");
expect(ordersMock.createOrder).not.toHaveBeenCalled();
```

Expect employee order pages do not render price fields:

```ts
expect(screen.queryByText("单价")).not.toBeInTheDocument();
expect(screen.queryByText("金额")).not.toBeInTheDocument();
expect(screen.queryByRole("button", { name: "新增订单" })).not.toBeInTheDocument();
```

- [ ] **Step 2: Gate server actions**

Use `requireManager()` in `createOrderAction`, `updateOrderStatusAction`, and `uploadOrderDrawingsAction`.

- [ ] **Step 3: Hide manager-only UI**

Use `requireUser()` in order pages, hide create/status/upload/price UI for employees.

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- --run tests/actions/orders.test.ts tests/pages/orders-page.test.tsx
```

Expected: pass.

### Task 5: Production Record User Attribution

**Files:**
- Modify: `src/app/actions/machines.ts`
- Modify: `src/app/actions/records.ts`
- Modify: `src/server/services/records.ts`
- Modify: `src/app/(dashboard)/records/page.tsx`
- Modify: `src/app/(dashboard)/machines/[id]/page.tsx`
- Modify: `src/app/(dashboard)/orders/[id]/page.tsx`
- Test: `tests/actions/machines.test.ts`
- Test: `tests/actions/records.test.ts`
- Test: `tests/pages/records-page.test.tsx`
- Test: `tests/pages/machine-detail.test.tsx`

- [ ] **Step 1: Write failing tests**

Expect action user attribution:

```ts
authMock.requireUser.mockResolvedValue({ id: "user-1", workspaceId: "workspace-1", role: "employee" });
expect(recordsMock.createProductionRecord).toHaveBeenCalledWith("workspace-1", expect.objectContaining({ actorUserId: "user-1" }));
```

Expect pages show:

```ts
expect(screen.getByText("录入人")).toBeInTheDocument();
expect(screen.getByText("张三")).toBeInTheDocument();
expect(screen.getByText("修改人")).toBeInTheDocument();
```

- [ ] **Step 2: Update record services**

`createProductionRecord` accepts `actorUserId`, sets both created/updated user ids on split records. `updateProductionRecord` accepts `actorUserId` and updates `updatedByUserId`.

- [ ] **Step 3: Update pages**

Include `createdByUser` and `updatedByUser` in record queries and render display names.

- [ ] **Step 4: Run tests**

Run:

```bash
npm test -- --run tests/actions/machines.test.ts tests/actions/records.test.ts tests/pages/records-page.test.tsx tests/pages/machine-detail.test.tsx
```

Expected: pass.

### Task 6: Manager Analytics Dashboard

**Files:**
- Create: `src/server/services/analytics.ts`
- Create: `src/app/(dashboard)/analytics/page.tsx`
- Test: `tests/integration/analytics-services.test.ts`
- Test: `tests/pages/analytics-page.test.tsx`

- [ ] **Step 1: Write failing service test**

Create orders with prices and records, then expect:

```ts
expect(summary.revenueCents).toBe(120000);
expect(summary.completedQuantity).toBe(80);
expect(summary.shippedQuantity).toBe(60);
expect(summary.unpricedShippedQuantity).toBe(5);
expect(summary.customerRevenue[0]).toMatchObject({ customerName: "甲方", revenueCents: 120000 });
```

- [ ] **Step 2: Implement analytics service**

Compute revenue from shipped records only: `record.quantity * order.unitPriceCents`. Build daily series, customer revenue, order status distribution, and unpriced shipped warnings.

- [ ] **Step 3: Implement manager-only page**

Use `requireManager()`, date filters, KPI cards, CSS conic-gradient pie chart, daily trend bars, status distribution, and warning panels.

- [ ] **Step 4: Run tests**

Run:

```bash
DATABASE_URL='postgresql://factory:factory_password@localhost:5432/factory?schema=public' npm test -- --run tests/integration/analytics-services.test.ts tests/pages/analytics-page.test.tsx
```

Expected: pass.

### Task 7: Full Verification And Push

**Files:**
- Modify tests and source touched above

- [ ] **Step 1: Run focused tests**

Run all focused tests listed in tasks 1-6.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: `No ESLint warnings or errors`.

- [ ] **Step 3: Browser smoke test**

Use Playwright to check:

```txt
/admin/login renders
/admin/workspaces shows create workspace form after admin login
/orders as employee hides price columns
/analytics as manager renders KPI cards
/records shows created/updated user fields
```

- [ ] **Step 4: Commit and push**

Run:

```bash
git add .
git commit -m "feat: add admin roles and analytics"
git push origin factory-mvp
```

Expected: branch pushed cleanly.

## Self-Review

- Spec coverage: platform admin, multiple workspaces, multiple customer accounts per workspace, roles, workspace title, employee price hiding, manager analytics, and production record attribution are covered.
- Placeholder scan: no TODO/TBD items remain.
- Type consistency: `manager`/`employee`, `displayName`, `PlatformAdmin`, `PlatformAdminSession`, `createdByUserId`, and `updatedByUserId` are used consistently.
