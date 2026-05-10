# Order Drawing Tree Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two drawing upload controls with one upload entry, render drawings as a directory tree, and allow folder/all drawing downloads as zip archives.

**Architecture:** Keep file and archive logic in `src/server/services/order-drawings.ts`, expose zip download through a protected route, and move drag/drop upload behavior into a focused client component. The order detail server component builds the directory tree from `relativePath` and renders file/folder download links.

**Tech Stack:** Next.js App Router, React Server Components, Client Components, Server Actions, Prisma, PostgreSQL, Vitest, Playwright.

---

## File Structure

- Modify `src/server/services/order-drawings.ts` to add no-compression zip archive creation and prefix filtering.
- Add `src/app/api/order-drawings/archive/route.ts` for protected folder/all downloads.
- Add `src/app/(dashboard)/orders/[id]/order-drawing-upload.tsx` as the single visible upload client component.
- Modify `src/app/(dashboard)/orders/[id]/page.tsx` to build and render the drawing tree.
- Modify `tests/integration/factory-services.test.ts` for archive behavior.
- Modify `tests/auth/order-drawings-route.test.ts` for archive route behavior.
- Modify `tests/pages/orders-page.test.tsx` for single upload control and directory tree rendering.

## Task 1: Archive Service

**Files:**
- Modify: `src/server/services/order-drawings.ts`
- Modify: `tests/integration/factory-services.test.ts`

- [ ] **Step 1: Write failing archive service test**

Add a test that uploads `fixture/a.step`, `fixture/docs/a.pdf`, and `other/b.step`, then calls:

```ts
const archive = await getOrderDrawingArchive(workspace.id, order.id, "fixture");
```

Assert:

```ts
expect(archive.filename).toBe("fixture.zip");
expect(archive.mimeType).toBe("application/zip");
expect(archive.data.subarray(0, 2).toString()).toBe("PK");
expect(archive.data.toString("latin1")).toContain("fixture/a.step");
expect(archive.data.toString("latin1")).toContain("fixture/docs/a.pdf");
expect(archive.data.toString("latin1")).not.toContain("other/b.step");
```

- [ ] **Step 2: Run test and verify red**

Run:

```bash
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" npm run test:run -- tests/integration/factory-services.test.ts
```

Expected: FAIL because `getOrderDrawingArchive` does not exist.

- [ ] **Step 3: Implement archive service**

Add `getOrderDrawingArchive(workspaceId, orderId, prefix)` and helper functions:

```ts
function normalizeArchivePrefix(prefix: string | null | undefined): string;
function buildStoredZip(entries: Array<{ name: string; data: Buffer; date: Date }>): Buffer;
function crc32(buffer: Buffer): number;
```

Use ZIP store mode (compression method 0). Limit stays covered by existing upload size rules.

- [ ] **Step 4: Run test and verify green**

Run:

```bash
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" npm run test:run -- tests/integration/factory-services.test.ts
```

Expected: pass.

## Task 2: Archive Route

**Files:**
- Add: `src/app/api/order-drawings/archive/route.ts`
- Modify: `tests/auth/order-drawings-route.test.ts`

- [ ] **Step 1: Write failing route tests**

Add tests for:

```ts
GET /api/order-drawings/archive?orderId=order-1&prefix=fixture
```

Unauthenticated request returns 401. Authenticated request calls:

```ts
getOrderDrawingArchive("workspace-1", "order-1", "fixture")
```

and returns `application/zip`.

- [ ] **Step 2: Run route tests and verify red**

Run:

```bash
npm run test:run -- tests/auth/order-drawings-route.test.ts
```

Expected: FAIL because archive route does not exist.

- [ ] **Step 3: Implement archive route**

Create route handler:

```ts
const user = await readSessionUser();
if (!user) return new Response("Unauthorized", { status: 401 });
const orderId = url.searchParams.get("orderId");
const prefix = url.searchParams.get("prefix");
if (!orderId) return new Response("Bad Request", { status: 400 });
const archive = await getOrderDrawingArchive(user.workspaceId, orderId, prefix);
return new Response(new Uint8Array(archive.data), { headers: ... });
```

- [ ] **Step 4: Run route tests and verify green**

Run:

```bash
npm run test:run -- tests/auth/order-drawings-route.test.ts
```

Expected: pass.

## Task 3: Single Upload UI and Directory Tree

**Files:**
- Add: `src/app/(dashboard)/orders/[id]/order-drawing-upload.tsx`
- Modify: `src/app/(dashboard)/orders/[id]/page.tsx`
- Modify: `tests/pages/orders-page.test.tsx`

- [ ] **Step 1: Write failing page test**

Update order detail page test to assert:

```ts
expect(screen.getByRole("button", { name: "上传图纸" })).toBeInTheDocument();
expect(screen.queryByText("上传文件")).not.toBeInTheDocument();
expect(screen.queryByText("上传文件夹")).not.toBeInTheDocument();
expect(screen.getByRole("link", { name: /fixture/ })).toHaveAttribute("href", "/api/order-drawings/archive?orderId=order-1&prefix=fixture");
expect(screen.getByRole("link", { name: /fixture.step/ })).toHaveAttribute("href", "/api/order-drawings/drawing-1");
```

- [ ] **Step 2: Run page test and verify red**

Run:

```bash
npm run test:run -- tests/pages/orders-page.test.tsx
```

Expected: FAIL because the page still has two upload controls and a flat table.

- [ ] **Step 3: Implement upload component and tree render**

Client component:

```ts
"use client";
```

It renders one button, hidden `multiple` file input, and a drop zone. It submits files with `FormData` to `uploadOrderDrawingsAction`; drag/drop directories use `webkitGetAsEntry()` recursion.

Server page:

Build tree from `relativePath`, render folders as archive links and files as file links.

- [ ] **Step 4: Run page test and verify green**

Run:

```bash
npm run test:run -- tests/pages/orders-page.test.tsx
```

Expected: pass.

## Task 4: Full Verification and Push

**Files:**
- No new files unless verification reveals a needed fix.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm run test:run -- tests/pages/orders-page.test.tsx tests/auth/order-drawings-route.test.ts
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" npm run test:run -- tests/integration/factory-services.test.ts
```

Expected: pass.

- [ ] **Step 2: Run full verification**

Run:

```bash
npm run lint
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" npm run test:run
npm run build
npm run test:e2e
docker compose config
```

Expected: all pass.

- [ ] **Step 3: Commit and push**

Run:

```bash
git status --short
git add <changed files>
git commit -m "feat: improve order drawing uploads"
git push
```

Expected: branch `factory-mvp` updates on `origin`.
