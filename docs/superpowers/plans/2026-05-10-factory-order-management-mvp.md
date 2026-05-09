# Factory Order Management MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first usable CNC factory order management web app with login, machine management, order management, machine-based production/shipping records, filtering, and two-container Docker Compose deployment.

**Architecture:** A Next.js App Router application owns the UI, server actions, route handlers, authentication, and Prisma data access. PostgreSQL stores workspaces, users, sessions, machines, orders, and production records, with every business table scoped by `workspace_id` for future multi-user expansion.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, Prisma, PostgreSQL, Vitest, Playwright, Docker Compose.

---

## Scope Check

This plan implements the approved MVP spec in one integrated pass because the core flows depend on shared data contracts: auth scopes all data, machines link to orders, records drive order summaries, and pages share the same service layer. Features explicitly out of scope remain out of implementation: multi-employee accounts, roles, open registration, scheduling, inventory, file uploads, exports, audit logs, and automatic closing.

## File Structure

Create or modify these files:

- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `tailwind.config.ts`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `.env.example`
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `docker-entrypoint.sh`
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`
- Create: `src/app/globals.css`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/login/page.tsx`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/app/(dashboard)/layout.tsx`
- Create: `src/app/(dashboard)/machines/page.tsx`
- Create: `src/app/(dashboard)/machines/[id]/page.tsx`
- Create: `src/app/(dashboard)/orders/page.tsx`
- Create: `src/app/(dashboard)/orders/[id]/page.tsx`
- Create: `src/app/(dashboard)/records/page.tsx`
- Create: `src/app/actions/machines.ts`
- Create: `src/app/actions/orders.ts`
- Create: `src/app/actions/records.ts`
- Create: `src/components/app-shell.tsx`
- Create: `src/components/forms.tsx`
- Create: `src/components/status-badge.tsx`
- Create: `src/domain/factory.ts`
- Create: `src/lib/auth.ts`
- Create: `src/lib/db.ts`
- Create: `src/lib/password.ts`
- Create: `src/lib/session.ts`
- Create: `src/lib/workspace.ts`
- Create: `src/server/services/machines.ts`
- Create: `src/server/services/orders.ts`
- Create: `src/server/services/records.ts`
- Create: `tests/domain/factory.test.ts`
- Create: `tests/auth/password.test.ts`
- Create: `tests/integration/factory-services.test.ts`
- Create: `tests/e2e/factory-flow.spec.ts`
- Modify: `.gitignore`

## Task 1: Project Skeleton

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.ts`
- Create: `postcss.config.mjs`
- Create: `tailwind.config.ts`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: Create the Next.js project files**

Run:

```bash
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

Expected: the command creates a Next.js App Router project in the current directory.

- [ ] **Step 2: Install runtime and test dependencies**

Run:

```bash
npm install @prisma/client bcryptjs clsx date-fns lucide-react zod
npm install -D prisma tsx vitest jsdom @testing-library/react @testing-library/jest-dom @playwright/test
```

Expected: `package-lock.json` is created and dependencies are installed without errors.

- [ ] **Step 3: Replace `package.json` scripts**

Update the `scripts` section to this:

```json
{
  "dev": "next dev --hostname 0.0.0.0",
  "build": "prisma generate && next build",
  "start": "next start --hostname 0.0.0.0",
  "lint": "next lint",
  "test": "vitest",
  "test:run": "vitest run",
  "test:e2e": "playwright test",
  "db:generate": "prisma generate",
  "db:migrate": "prisma migrate dev",
  "db:deploy": "prisma migrate deploy",
  "db:seed": "tsx prisma/seed.ts"
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["./tests/setup.ts"],
  },
});
```

- [ ] **Step 5: Create `tests/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 6: Create `playwright.config.ts`**

```ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
  ],
});
```

- [ ] **Step 7: Create `.env.example`**

```dotenv
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public"
BOOTSTRAP_WORKSPACE_NAME="CNC Factory"
BOOTSTRAP_USERNAME="admin"
BOOTSTRAP_PASSWORD="change-me-before-use"
SESSION_COOKIE_NAME="factory_session"
SESSION_TTL_DAYS="30"
```

- [ ] **Step 8: Update `.gitignore`**

Ensure these lines exist:

```gitignore
.env
.env.local
.env.*.local
node_modules/
.next/
coverage/
test-results/
playwright-report/
postgres-data/
```

- [ ] **Step 9: Run the baseline checks**

Run:

```bash
npm run lint
npm run test:run
```

Expected: lint passes or reports only generated-template issues to fix immediately; tests pass with no test files or the setup file only.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts postcss.config.mjs tailwind.config.ts eslint.config.mjs vitest.config.ts playwright.config.ts .env.example .gitignore src tests
git commit -m "chore: scaffold next factory app"
```

## Task 2: Domain Rules and Validation

**Files:**
- Create: `src/domain/factory.ts`
- Create: `tests/domain/factory.test.ts`

- [ ] **Step 1: Write the failing domain tests**

Create `tests/domain/factory.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ProductionRecordInput,
  parseNonNegativeQuantity,
  summarizeOrder,
  validateProductionRecordInput,
} from "@/domain/factory";

describe("factory domain rules", () => {
  it("summarizes order progress from production records", () => {
    const summary = summarizeOrder({
      plannedQuantity: 100,
      closedAt: null,
      records: [
        { completedQuantity: 40, shippedQuantity: 10 },
        { completedQuantity: 70, shippedQuantity: 95 },
      ],
    });

    expect(summary.completedQuantity).toBe(110);
    expect(summary.shippedQuantity).toBe(105);
    expect(summary.remainingQuantity).toBe(0);
    expect(summary.isOverPlanned).toBe(true);
    expect(summary.canClose).toBe(true);
  });

  it("does not mark closed orders as closable again", () => {
    const summary = summarizeOrder({
      plannedQuantity: 20,
      closedAt: new Date("2026-05-10T08:00:00.000Z"),
      records: [{ completedQuantity: 20, shippedQuantity: 20 }],
    });

    expect(summary.canClose).toBe(false);
  });

  it("rejects records where both quantities are zero", () => {
    const input: ProductionRecordInput = {
      completedQuantity: 0,
      shippedQuantity: 0,
    };

    expect(() => validateProductionRecordInput(input)).toThrow(
      "加工数量和出货数量不能同时为 0",
    );
  });

  it("rejects negative quantities", () => {
    expect(() => parseNonNegativeQuantity("-1", "加工数量")).toThrow(
      "加工数量不能为负数",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:run -- tests/domain/factory.test.ts
```

Expected: FAIL because `src/domain/factory.ts` does not exist.

- [ ] **Step 3: Implement `src/domain/factory.ts`**

```ts
export type ProductionRecordInput = {
  completedQuantity: number;
  shippedQuantity: number;
};

export type OrderSummaryInput = {
  plannedQuantity: number;
  closedAt: Date | null;
  records: ProductionRecordInput[];
};

export type OrderSummary = {
  completedQuantity: number;
  shippedQuantity: number;
  remainingQuantity: number;
  isOverPlanned: boolean;
  canClose: boolean;
};

export function parsePositiveQuantity(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label}必须是整数`);
  }
  if (parsed <= 0) {
    throw new Error(`${label}必须大于 0`);
  }
  return parsed;
}

export function parseNonNegativeQuantity(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label}必须是整数`);
  }
  if (parsed < 0) {
    throw new Error(`${label}不能为负数`);
  }
  return parsed;
}

export function validateProductionRecordInput(input: ProductionRecordInput): ProductionRecordInput {
  if (!Number.isInteger(input.completedQuantity) || input.completedQuantity < 0) {
    throw new Error("加工数量不能为负数");
  }
  if (!Number.isInteger(input.shippedQuantity) || input.shippedQuantity < 0) {
    throw new Error("出货数量不能为负数");
  }
  if (input.completedQuantity === 0 && input.shippedQuantity === 0) {
    throw new Error("加工数量和出货数量不能同时为 0");
  }
  return input;
}

export function summarizeOrder(input: OrderSummaryInput): OrderSummary {
  const completedQuantity = input.records.reduce(
    (total, record) => total + record.completedQuantity,
    0,
  );
  const shippedQuantity = input.records.reduce(
    (total, record) => total + record.shippedQuantity,
    0,
  );
  return {
    completedQuantity,
    shippedQuantity,
    remainingQuantity: Math.max(input.plannedQuantity - shippedQuantity, 0),
    isOverPlanned:
      completedQuantity > input.plannedQuantity ||
      shippedQuantity > input.plannedQuantity,
    canClose: input.closedAt === null && shippedQuantity >= input.plannedQuantity,
  };
}
```

- [ ] **Step 4: Run the domain test to verify it passes**

Run:

```bash
npm run test:run -- tests/domain/factory.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/factory.ts tests/domain/factory.test.ts
git commit -m "feat: add factory domain rules"
```

## Task 3: Prisma Schema and Bootstrap Seed

**Files:**
- Create: `prisma/schema.prisma`
- Create: `prisma/seed.ts`
- Create: `src/lib/db.ts`
- Create: `src/lib/password.ts`
- Create: `tests/auth/password.test.ts`

- [ ] **Step 1: Write the failing password test**

Create `tests/auth/password.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/password";

describe("password hashing", () => {
  it("verifies the original password and rejects a different password", async () => {
    const hash = await hashPassword("correct-password");

    await expect(verifyPassword("correct-password", hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
    expect(hash).not.toContain("correct-password");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test:run -- tests/auth/password.test.ts
```

Expected: FAIL because `src/lib/password.ts` does not exist.

- [ ] **Step 3: Implement `src/lib/password.ts`**

```ts
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

- [ ] **Step 4: Run the password test**

Run:

```bash
npm run test:run -- tests/auth/password.test.ts
```

Expected: PASS.

- [ ] **Step 5: Create `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum MachineStatus {
  active
  idle
  maintenance
  disabled
}

enum OrderStatus {
  open
  closed
}

model Workspace {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  users             User[]
  machines          Machine[]
  orders            Order[]
  productionRecords ProductionRecord[]
}

model User {
  id           String   @id @default(cuid())
  workspaceId  String
  username     String
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  sessions  Session[]

  @@unique([workspaceId, username])
  @@index([workspaceId])
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  tokenHash String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
}

model Machine {
  id             String        @id @default(cuid())
  workspaceId    String
  code           String
  name           String
  model          String?
  location       String?
  status         MachineStatus @default(active)
  notes          String?
  currentOrderId String?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  workspace         Workspace          @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  currentOrder      Order?             @relation("CurrentMachineOrder", fields: [currentOrderId], references: [id], onDelete: SetNull)
  productionRecords ProductionRecord[]

  @@unique([workspaceId, code])
  @@index([workspaceId])
  @@index([workspaceId, status])
  @@index([currentOrderId])
}

model Order {
  id              String      @id @default(cuid())
  workspaceId     String
  customerName    String
  orderNo         String?
  partName        String
  plannedQuantity Int
  dueDate         DateTime?
  status          OrderStatus @default(open)
  notes           String?
  closedAt        DateTime?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  workspace         Workspace          @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  currentMachines   Machine[]          @relation("CurrentMachineOrder")
  productionRecords ProductionRecord[]

  @@index([workspaceId])
  @@index([workspaceId, status])
  @@index([workspaceId, customerName])
  @@index([workspaceId, dueDate])
}

model ProductionRecord {
  id                String   @id @default(cuid())
  workspaceId       String
  machineId         String
  orderId           String
  recordedAt        DateTime
  completedQuantity Int      @default(0)
  shippedQuantity   Int      @default(0)
  notes             String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  machine   Machine   @relation(fields: [machineId], references: [id], onDelete: Restrict)
  order     Order     @relation(fields: [orderId], references: [id], onDelete: Restrict)

  @@index([workspaceId, recordedAt])
  @@index([workspaceId, machineId])
  @@index([workspaceId, orderId])
}
```

- [ ] **Step 6: Create `src/lib/db.ts`**

```ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 7: Create `prisma/seed.ts`**

```ts
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";

async function main() {
  const workspaceName = process.env.BOOTSTRAP_WORKSPACE_NAME ?? "CNC Factory";
  const username = process.env.BOOTSTRAP_USERNAME;
  const password = process.env.BOOTSTRAP_PASSWORD;

  if (!username || !password) {
    throw new Error("BOOTSTRAP_USERNAME and BOOTSTRAP_PASSWORD are required");
  }

  const workspace = await prisma.workspace.upsert({
    where: { id: "bootstrap-workspace" },
    update: { name: workspaceName },
    create: { id: "bootstrap-workspace", name: workspaceName },
  });

  const passwordHash = await hashPassword(password);

  await prisma.user.upsert({
    where: {
      workspaceId_username: {
        workspaceId: workspace.id,
        username,
      },
    },
    update: { passwordHash },
    create: {
      workspaceId: workspace.id,
      username,
      passwordHash,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 8: Validate Prisma schema**

Run:

```bash
npx prisma validate
```

Expected: Prisma reports the schema is valid.

- [ ] **Step 9: Create the initial migration**

If no PostgreSQL server is already available, start one for development:

```bash
docker run --name factory-dev-db \
  -e POSTGRES_DB=factory \
  -e POSTGRES_USER=factory \
  -e POSTGRES_PASSWORD=factory_password \
  -p 5432:5432 \
  -d postgres:16-alpine
```

Then run:

```bash
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" npx prisma migrate dev --name init
```

Expected: Prisma creates `prisma/migrations/<timestamp>_init/migration.sql` and generates the Prisma client.

- [ ] **Step 10: Seed the bootstrap account**

Run:

```bash
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" \
BOOTSTRAP_USERNAME="admin" \
BOOTSTRAP_PASSWORD="change-me-before-use" \
npm run db:seed
```

Expected: the command exits successfully and creates the bootstrap workspace and user.

- [ ] **Step 11: Run all current unit tests**

Run:

```bash
npm run test:run
```

Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add prisma/schema.prisma prisma/migrations prisma/seed.ts src/lib/db.ts src/lib/password.ts tests/auth/password.test.ts
git commit -m "feat: add database schema and bootstrap seed"
```

## Task 4: Authentication and Workspace Session

**Files:**
- Create: `src/lib/session.ts`
- Create: `src/lib/auth.ts`
- Create: `src/lib/workspace.ts`
- Create: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/logout/route.ts`
- Create: `src/app/login/page.tsx`
- Create: `src/app/page.tsx`

- [ ] **Step 1: Write the session helper code**

Create `src/lib/session.ts`:

```ts
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const sessionCookieName =
  process.env.SESSION_COOKIE_NAME ?? "factory_session";

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function getSessionTtlDays(): number {
  const value = Number(process.env.SESSION_TTL_DAYS ?? "30");
  return Number.isFinite(value) && value > 0 ? value : 30;
}

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + getSessionTtlDays() * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt,
    },
  });

  return token;
}

export async function readSessionUser() {
  const token = cookies().get(sessionCookieName)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });

  if (!session || session.expiresAt <= new Date()) return null;
  return session.user;
}

export async function destroyCurrentSession(): Promise<void> {
  const token = cookies().get(sessionCookieName)?.value;
  if (!token) return;

  await prisma.session.deleteMany({
    where: { tokenHash: sha256(token) },
  });
}
```

- [ ] **Step 2: Create `src/lib/auth.ts`**

```ts
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession, readSessionUser, sessionCookieName } from "@/lib/session";
import { verifyPassword } from "@/lib/password";
import { cookies } from "next/headers";

export async function loginWithPassword(username: string, password: string) {
  const user = await prisma.user.findFirst({
    where: { username },
  });

  if (!user) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  const token = await createSession(user.id);
  cookies().set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  return user;
}

export async function requireUser() {
  const user = await readSessionUser();
  if (!user) redirect("/login");
  return user;
}
```

- [ ] **Step 3: Create `src/lib/workspace.ts`**

```ts
import { requireUser } from "@/lib/auth";

export async function requireWorkspaceId(): Promise<string> {
  const user = await requireUser();
  return user.workspaceId;
}
```

- [ ] **Step 4: Create login/logout route handlers**

Create `src/app/api/auth/login/route.ts`:

```ts
import { NextResponse } from "next/server";
import { loginWithPassword } from "@/lib/auth";

export async function POST(request: Request) {
  const form = await request.formData();
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");

  const user = await loginWithPassword(username, password);
  if (!user) {
    return NextResponse.redirect(new URL("/login?error=1", request.url));
  }

  return NextResponse.redirect(new URL("/machines", request.url));
}
```

Create `src/app/api/auth/logout/route.ts`:

```ts
import { NextResponse } from "next/server";
import { destroyCurrentSession, sessionCookieName } from "@/lib/session";

export async function POST(request: Request) {
  await destroyCurrentSession();
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.delete(sessionCookieName);
  return response;
}
```

- [ ] **Step 5: Create login and home pages**

Create `src/app/login/page.tsx`:

```tsx
export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <form action="/api/auth/login" method="post" className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-950">CNC 工厂管理</h1>
        <p className="mt-1 text-sm text-slate-600">登录你的工厂账户</p>
        {searchParams.error ? (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">账号或密码不正确</p>
        ) : null}
        <label className="mt-5 block text-sm font-medium text-slate-700">
          账号
          <input name="username" className="mt-1 w-full rounded-md border px-3 py-2" autoComplete="username" required />
        </label>
        <label className="mt-4 block text-sm font-medium text-slate-700">
          密码
          <input name="password" type="password" className="mt-1 w-full rounded-md border px-3 py-2" autoComplete="current-password" required />
        </label>
        <button className="mt-6 w-full rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white">登录</button>
      </form>
    </main>
  );
}
```

Create `src/app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/machines");
}
```

- [ ] **Step 6: Run checks**

Run:

```bash
npm run lint
npm run test:run
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/session.ts src/lib/auth.ts src/lib/workspace.ts src/app/api/auth src/app/login src/app/page.tsx
git commit -m "feat: add login and session auth"
```

## Task 5: Service Layer and Integration Tests

**Files:**
- Create: `tests/integration/factory-services.test.ts`
- Create: `src/server/services/machines.ts`
- Create: `src/server/services/orders.ts`
- Create: `src/server/services/records.ts`

- [ ] **Step 1: Write integration tests for core business flow**

Create `tests/integration/factory-services.test.ts`:

```ts
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createMachine, linkMachineToOrder } from "@/server/services/machines";
import { createOrder, getOrderWithSummary } from "@/server/services/orders";
import { createProductionRecord, deleteProductionRecord } from "@/server/services/records";

async function createWorkspace() {
  return prisma.workspace.create({
    data: { name: `Test Workspace ${randomUUID()}` },
  });
}

describe("factory services", () => {
  it("creates records from a machine and recomputes order summary after deletion", async () => {
    const workspace = await createWorkspace();
    const machine = await createMachine(workspace.id, {
      code: "1",
      name: "1号机",
      model: "VMC",
      location: "A区",
      status: "active",
      notes: "",
    });
    const order = await createOrder(workspace.id, {
      customerName: "甲方工厂",
      orderNo: "A-001",
      partName: "法兰盘",
      plannedQuantity: 100,
      dueDate: null,
      notes: "",
    });

    await linkMachineToOrder(workspace.id, machine.id, order.id);
    const record = await createProductionRecord(workspace.id, {
      machineId: machine.id,
      recordedAt: new Date("2026-05-10T08:00:00.000Z"),
      completedQuantity: 120,
      shippedQuantity: 80,
      notes: "白班",
    });

    let summary = await getOrderWithSummary(workspace.id, order.id);
    expect(summary.completedQuantity).toBe(120);
    expect(summary.shippedQuantity).toBe(80);
    expect(summary.isOverPlanned).toBe(true);
    expect(summary.canClose).toBe(false);

    await deleteProductionRecord(workspace.id, record.id);
    summary = await getOrderWithSummary(workspace.id, order.id);
    expect(summary.completedQuantity).toBe(0);
    expect(summary.shippedQuantity).toBe(0);
  });
});
```

- [ ] **Step 2: Run integration test to verify it fails**

Run with a test database available:

```bash
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" npm run test:run -- tests/integration/factory-services.test.ts
```

Expected: FAIL because service files do not exist.

- [ ] **Step 3: Implement `src/server/services/orders.ts`**

Implement these exported functions:

```ts
import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parsePositiveQuantity, summarizeOrder } from "@/domain/factory";

export type CreateOrderInput = {
  customerName: string;
  orderNo: string;
  partName: string;
  plannedQuantity: number;
  dueDate: Date | null;
  notes: string;
};

export async function createOrder(workspaceId: string, input: CreateOrderInput) {
  if (!input.customerName.trim()) throw new Error("客户名称必填");
  if (!input.partName.trim()) throw new Error("工件名称必填");
  parsePositiveQuantity(String(input.plannedQuantity), "计划数量");

  return prisma.order.create({
    data: {
      workspaceId,
      customerName: input.customerName.trim(),
      orderNo: input.orderNo.trim() || null,
      partName: input.partName.trim(),
      plannedQuantity: input.plannedQuantity,
      dueDate: input.dueDate,
      notes: input.notes.trim() || null,
    },
  });
}

export async function getOrderWithSummary(workspaceId: string, orderId: string) {
  const order = await prisma.order.findFirstOrThrow({
    where: { id: orderId, workspaceId },
    include: { productionRecords: true, currentMachines: true },
  });
  const summary = summarizeOrder({
    plannedQuantity: order.plannedQuantity,
    closedAt: order.closedAt,
    records: order.productionRecords.map((record) => ({
      completedQuantity: record.completedQuantity,
      shippedQuantity: record.shippedQuantity,
    })),
  });
  return { ...order, ...summary };
}

export async function listOrders(workspaceId: string, filters: {
  customerName?: string;
  status?: OrderStatus;
  query?: string;
}) {
  const orders = await prisma.order.findMany({
    where: {
      workspaceId,
      status: filters.status,
      customerName: filters.customerName
        ? { contains: filters.customerName, mode: "insensitive" }
        : undefined,
      OR: filters.query
        ? [
            { orderNo: { contains: filters.query, mode: "insensitive" } },
            { partName: { contains: filters.query, mode: "insensitive" } },
          ]
        : undefined,
    },
    include: { productionRecords: true },
    orderBy: { createdAt: "desc" },
  });

  return orders.map((order) => ({
    ...order,
    ...summarizeOrder({
      plannedQuantity: order.plannedQuantity,
      closedAt: order.closedAt,
      records: order.productionRecords.map((record) => ({
        completedQuantity: record.completedQuantity,
        shippedQuantity: record.shippedQuantity,
      })),
    }),
  }));
}

export async function closeOrder(workspaceId: string, orderId: string) {
  const order = await prisma.order.findFirstOrThrow({
    where: { id: orderId, workspaceId },
    select: { id: true },
  });

  return prisma.order.update({
    where: { id: order.id },
    data: { status: "closed", closedAt: new Date() },
  });
}

export async function reopenOrder(workspaceId: string, orderId: string) {
  const order = await prisma.order.findFirstOrThrow({
    where: { id: orderId, workspaceId },
    select: { id: true },
  });

  return prisma.order.update({
    where: { id: order.id },
    data: { status: "open", closedAt: null },
  });
}
```

- [ ] **Step 4: Implement `src/server/services/machines.ts`**

Implement these exported functions:

```ts
import { MachineStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

export type CreateMachineInput = {
  code: string;
  name: string;
  model: string;
  location: string;
  status: MachineStatus;
  notes: string;
};

export async function createMachine(workspaceId: string, input: CreateMachineInput) {
  if (!input.code.trim()) throw new Error("机器编号必填");
  if (!input.name.trim()) throw new Error("机器名称必填");

  return prisma.machine.create({
    data: {
      workspaceId,
      code: input.code.trim(),
      name: input.name.trim(),
      model: input.model.trim() || null,
      location: input.location.trim() || null,
      status: input.status,
      notes: input.notes.trim() || null,
    },
  });
}

export async function linkMachineToOrder(workspaceId: string, machineId: string, orderId: string) {
  const order = await prisma.order.findFirstOrThrow({
    where: { id: orderId, workspaceId, status: "open" },
  });
  const machine = await prisma.machine.findFirstOrThrow({
    where: { id: machineId, workspaceId },
    select: { id: true },
  });

  return prisma.machine.update({
    where: { id: machine.id },
    data: { currentOrderId: order.id },
  });
}

export async function listMachines(workspaceId: string, filters: {
  status?: MachineStatus;
  query?: string;
}) {
  return prisma.machine.findMany({
    where: {
      workspaceId,
      status: filters.status,
      OR: filters.query
        ? [
            { code: { contains: filters.query, mode: "insensitive" } },
            { name: { contains: filters.query, mode: "insensitive" } },
          ]
        : undefined,
    },
    include: { currentOrder: true, productionRecords: true },
    orderBy: { code: "asc" },
  });
}

export async function getMachine(workspaceId: string, machineId: string) {
  return prisma.machine.findFirstOrThrow({
    where: { id: machineId, workspaceId },
    include: {
      currentOrder: true,
      productionRecords: {
        include: { order: true },
        orderBy: { recordedAt: "desc" },
      },
    },
  });
}
```

- [ ] **Step 5: Implement `src/server/services/records.ts`**

Implement these exported functions:

```ts
import { prisma } from "@/lib/db";
import { validateProductionRecordInput } from "@/domain/factory";

export type CreateProductionRecordInput = {
  machineId: string;
  recordedAt: Date;
  completedQuantity: number;
  shippedQuantity: number;
  notes: string;
};

export async function createProductionRecord(
  workspaceId: string,
  input: CreateProductionRecordInput,
) {
  validateProductionRecordInput(input);

  const machine = await prisma.machine.findFirstOrThrow({
    where: { id: input.machineId, workspaceId },
  });
  if (!machine.currentOrderId) {
    throw new Error("机器未关联订单，不能录入记录");
  }

  return prisma.productionRecord.create({
    data: {
      workspaceId,
      machineId: machine.id,
      orderId: machine.currentOrderId,
      recordedAt: input.recordedAt,
      completedQuantity: input.completedQuantity,
      shippedQuantity: input.shippedQuantity,
      notes: input.notes.trim() || null,
    },
  });
}

export async function deleteProductionRecord(workspaceId: string, recordId: string) {
  const record = await prisma.productionRecord.findFirstOrThrow({
    where: { id: recordId, workspaceId },
    select: { id: true },
  });

  return prisma.productionRecord.delete({
    where: { id: record.id },
  });
}

export async function listProductionRecords(workspaceId: string, filters: {
  machineId?: string;
  orderId?: string;
  from?: Date;
  to?: Date;
}) {
  return prisma.productionRecord.findMany({
    where: {
      workspaceId,
      machineId: filters.machineId,
      orderId: filters.orderId,
      recordedAt: {
        gte: filters.from,
        lte: filters.to,
      },
    },
    include: {
      machine: true,
      order: true,
    },
    orderBy: { recordedAt: "desc" },
  });
}
```

- [ ] **Step 6: Run integration test**

Run:

```bash
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" npm run test:run -- tests/integration/factory-services.test.ts
```

Expected: PASS after a PostgreSQL test database is available and migrations have been applied.

- [ ] **Step 7: Commit**

```bash
git add tests/integration/factory-services.test.ts src/server/services
git commit -m "feat: add factory service layer"
```

## Task 6: Dashboard Shell and Shared UI

**Files:**
- Create: `src/app/globals.css`
- Create: `src/app/layout.tsx`
- Create: `src/app/(dashboard)/layout.tsx`
- Create: `src/components/app-shell.tsx`
- Create: `src/components/forms.tsx`
- Create: `src/components/status-badge.tsx`

- [ ] **Step 1: Implement shared layout**

Create an app shell with a fixed desktop sidebar and compact mobile navigation. Navigation items must be `机器`, `订单`, and `记录`. The logout form posts to `/api/auth/logout`.

- [ ] **Step 2: Implement shared form primitives**

Create `TextInput`, `NumberInput`, `DateInput`, `Textarea`, `SelectInput`, and `SubmitButton` components in `src/components/forms.tsx`. Each component should render a visible label, native form control, and consistent Tailwind styles.

- [ ] **Step 3: Implement status badge**

Create `src/components/status-badge.tsx` with machine status and order status label mappings:

```ts
export const machineStatusLabels = {
  active: "正常",
  idle: "空闲",
  maintenance: "维护中",
  disabled: "停用",
} as const;

export const orderStatusLabels = {
  open: "进行中",
  closed: "已结单",
} as const;
```

- [ ] **Step 4: Protect dashboard routes**

In `src/app/(dashboard)/layout.tsx`, call `requireUser()` before rendering children. Unauthenticated users must redirect to `/login`.

- [ ] **Step 5: Run checks**

Run:

```bash
npm run lint
npm run test:run
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx src/app/'(dashboard)' src/components
git commit -m "feat: add dashboard shell"
```

## Task 7: Machines Flow

**Files:**
- Create: `src/app/actions/machines.ts`
- Create: `src/app/(dashboard)/machines/page.tsx`
- Create: `src/app/(dashboard)/machines/[id]/page.tsx`
- Modify: `src/server/services/machines.ts`
- Modify: `src/server/services/records.ts`

- [ ] **Step 1: Add machine server actions**

Create actions for `createMachineAction`, `linkMachineAction`, and `createMachineRecordAction`. Each action must call `requireWorkspaceId()`, parse `FormData`, call the relevant service, and `revalidatePath("/machines")`.

- [ ] **Step 2: Build machines list page**

Implement `/machines` with:

- Filters for machine query and status.
- Machine cards/table showing code, name, status, current order, today completed quantity, and today shipped quantity.
- New machine form with code, name, model, location, status, notes.
- Link to `/machines/[id]`.

- [ ] **Step 3: Build machine detail page**

Implement `/machines/[id]` with:

- Machine metadata.
- Current order selector limited to open orders.
- Record form with recorded time, completed quantity, shipped quantity, notes.
- Disabled record form when no current order exists.
- History table showing recorded time, order, completed quantity, shipped quantity, notes.

- [ ] **Step 4: Run manual machine flow**

Run:

```bash
npm run dev
```

Expected manual result:

- Login succeeds.
- Creating machine `1` succeeds.
- Creating a duplicate machine code shows an error.
- Machine without an order cannot create a production record.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/machines.ts src/app/'(dashboard)'/machines src/server/services/machines.ts src/server/services/records.ts
git commit -m "feat: add machine management flow"
```

## Task 8: Orders Flow

**Files:**
- Create: `src/app/actions/orders.ts`
- Create: `src/app/(dashboard)/orders/page.tsx`
- Create: `src/app/(dashboard)/orders/[id]/page.tsx`
- Modify: `src/server/services/orders.ts`

- [ ] **Step 1: Add order server actions**

Create actions for `createOrderAction`, `closeOrderAction`, and `reopenOrderAction`. Each action must scope by `workspace_id`, validate form values, and revalidate `/orders` plus the affected detail page.

- [ ] **Step 2: Build orders list page**

Implement `/orders` with:

- Filters for customer name, search query, status, and due date range.
- New order form with customer name, order number, part name, planned quantity, due date, notes.
- Table/card list showing planned, completed, shipped, remaining, status, over-plan warning, and closable warning.

- [ ] **Step 3: Build order detail page**

Implement `/orders/[id]` with:

- Order metadata.
- Summary metrics.
- Current machines linked to the order.
- Production record history.
- Manual close button when `canClose` is true.
- Reopen button when status is closed.

- [ ] **Step 4: Run order checks**

Run:

```bash
npm run lint
npm run test:run
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/orders.ts src/app/'(dashboard)'/orders src/server/services/orders.ts
git commit -m "feat: add order management flow"
```

## Task 9: Records Flow

**Files:**
- Create: `src/app/actions/records.ts`
- Create: `src/app/(dashboard)/records/page.tsx`
- Modify: `src/server/services/records.ts`

- [ ] **Step 1: Add record edit/delete support in services**

Add `updateProductionRecord` and keep `deleteProductionRecord`. Updates must preserve the original `order_id` snapshot unless the record is deleted and recreated through a machine page.

- [ ] **Step 2: Add record server actions**

Create `updateRecordAction` and `deleteRecordAction`. Each action must scope by `workspace_id`, validate non-negative quantities, and revalidate `/records`, `/orders`, and `/machines`.

- [ ] **Step 3: Build records page**

Implement `/records` with:

- Filters for date range, machine, order, customer, and order status.
- Table/card list with recorded time, machine, customer, order number, part name, completed quantity, shipped quantity, and notes.
- Inline edit controls or a compact edit form per row.
- Delete button with a browser confirmation.

- [ ] **Step 4: Verify recalculation**

Manual flow:

```text
Create order planned quantity 100.
Link machine 1 to the order.
Create two records: completed 60 shipped 20, completed 50 shipped 90.
Confirm order shows completed 110, shipped 110, remaining 0, over-plan warning.
Delete the second record.
Confirm order shows completed 60, shipped 20, remaining 80, no over-plan warning.
```

- [ ] **Step 5: Commit**

```bash
git add src/app/actions/records.ts src/app/'(dashboard)'/records src/server/services/records.ts
git commit -m "feat: add production record management"
```

## Task 10: Docker Compose Deployment

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `docker-entrypoint.sh`
- Modify: `.env.example`

- [ ] **Step 1: Create `Dockerfile`**

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
```

- [ ] **Step 2: Create `docker-entrypoint.sh`**

```sh
#!/bin/sh
set -eu

npx prisma migrate deploy
npm run db:seed

exec "$@"
```

- [ ] **Step 3: Create `docker-compose.yml`**

```yaml
services:
  web:
    build: .
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://factory:factory_password@db:5432/factory?schema=public
      BOOTSTRAP_WORKSPACE_NAME: ${BOOTSTRAP_WORKSPACE_NAME:-CNC Factory}
      BOOTSTRAP_USERNAME: ${BOOTSTRAP_USERNAME:-admin}
      BOOTSTRAP_PASSWORD: ${BOOTSTRAP_PASSWORD:-change-me-before-use}
      SESSION_COOKIE_NAME: ${SESSION_COOKIE_NAME:-factory_session}
      SESSION_TTL_DAYS: ${SESSION_TTL_DAYS:-30}
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: factory
      POSTGRES_USER: factory
      POSTGRES_PASSWORD: factory_password
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U factory -d factory"]
      interval: 5s
      timeout: 5s
      retries: 20

volumes:
  postgres-data:
```

- [ ] **Step 4: Run Docker deployment**

Run:

```bash
docker compose up --build
```

Expected:

- `db` becomes healthy.
- `web` runs migrations and seed.
- App is reachable at `http://localhost:3000`.
- Login works with `BOOTSTRAP_USERNAME` and `BOOTSTRAP_PASSWORD`.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml docker-entrypoint.sh .env.example
git commit -m "chore: add docker compose deployment"
```

## Task 11: End-to-End and Responsive Verification

**Files:**
- Create: `tests/e2e/factory-flow.spec.ts`
- Modify: any files found broken by the test

- [ ] **Step 1: Write E2E test**

Create `tests/e2e/factory-flow.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("factory order flow", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("账号").fill(process.env.BOOTSTRAP_USERNAME ?? "admin");
  await page.getByLabel("密码").fill(process.env.BOOTSTRAP_PASSWORD ?? "change-me-before-use");
  await page.getByRole("button", { name: "登录" }).click();

  await expect(page.getByRole("link", { name: "机器" })).toBeVisible();
  await page.getByRole("link", { name: "订单" }).click();
  await page.getByLabel("客户").fill("甲方工厂");
  await page.getByLabel("订单号").fill("A-001");
  await page.getByLabel("工件").fill("法兰盘");
  await page.getByLabel("计划数量").fill("100");
  await page.getByRole("button", { name: "新增订单" }).click();
  await expect(page.getByText("A-001")).toBeVisible();

  await page.getByRole("link", { name: "机器" }).click();
  await page.getByLabel("机器编号").fill("1");
  await page.getByLabel("机器名称").fill("1号机");
  await page.getByRole("button", { name: "新增机器" }).click();
  await expect(page.getByText("1号机")).toBeVisible();
});
```

- [ ] **Step 2: Run E2E test on desktop and mobile projects**

Run:

```bash
npm run test:e2e
```

Expected: PASS in both `chromium-desktop` and `mobile-chrome`.

- [ ] **Step 3: Run final verification suite**

Run:

```bash
npm run lint
npm run test:run
npm run build
npm run test:e2e
docker compose up --build
```

Expected: all commands pass; Docker app starts and can be logged into from a browser.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/factory-flow.spec.ts src Dockerfile docker-compose.yml
git commit -m "test: verify factory mvp flow"
```

## Final Acceptance Checklist

- Login uses `.env` bootstrap credentials.
- Same account can be logged in from multiple browsers.
- Machine codes are unique per workspace.
- Orders directly store customer name.
- One machine has one current order.
- Records are entered from machine pages.
- A machine can have multiple records per day.
- Each record stores the order snapshot at creation time.
- Order summaries are recalculated from records.
- Over-plan quantities are allowed and visibly warned.
- Orders close only through manual action.
- Records can be edited and deleted.
- Desktop layout uses a sidebar workbench.
- Mobile layout supports viewing, filtering, and simple entry.
- `docker compose` starts exactly `web` and `db` services.
