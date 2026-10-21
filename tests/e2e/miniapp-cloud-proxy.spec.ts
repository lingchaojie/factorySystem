import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { expect, test } from "@playwright/test";

const require = createRequire(import.meta.url);
const { createProxy } = require("../../cloudfunctions/factoryProxy/index.js") as {
  createProxy: (origin: string) => (event: object) => Promise<{ statusCode: number; data: Record<string, unknown> }>;
};

test("cloud-function proxy writes share the website database and preserve access rules", async ({ request, baseURL }) => {
  if (!baseURL) throw new Error("A running website baseURL is required");
  const proxy = createProxy(baseURL);
  const db = new PrismaClient();
  const username = `cloud-mini-${randomUUID()}`;
  const password = "cloud-demo-test-password";
  const workspace = await db.workspace.create({ data: { name: "Cloud proxy isolated test" } });
  try {
    await db.user.create({ data: { username, displayName: "云函数测试操作人", role: "employee",
      passwordHash: await bcrypt.hash(password, 10), workspaceId: workspace.id } });
    const machine = await db.machine.create({ data: { workspaceId: workspace.id, code: "CLOUD-1", name: "云函数测试机" } });
    const order = await db.order.create({ data: { workspaceId: workspace.id, orderNo: "CLOUD-DEMO", customerName: "测试客户",
      partName: "轴套", plannedQuantity: 100, unitPriceCents: 1234, status: "in_progress" } });
    await db.machineOrderAssignment.create({ data: { workspaceId: workspace.id, machineId: machine.id, orderId: order.id } });
    const login = await proxy({ method: "POST", path: "/auth/login", body: { username, password } });
    expect(login.statusCode).toBe(200);
    const token = login.data.token;
    expect(typeof token).toBe("string");
    expect((await proxy({ path: "/machines", token })).statusCode).toBe(200);
    expect((await proxy({ path: "/orders?query=" + encodeURIComponent("轴套") + "&status=in_progress", token })).statusCode).toBe(200);
    const saved = await proxy({ method: "POST", path: "/records", token, body: {
      machineId: machine.id, orderId: order.id, completedQuantity: 11, shippedQuantity: 4, notes: "免费云函数转发联调记录",
    } });
    expect(saved.statusCode).toBe(201); expect(saved.data.records).toHaveLength(2);
    const detail = await proxy({ path: `/orders/${order.id}`, token });
    expect(detail.data.order).toMatchObject({ completedQuantity: 11, shippedQuantity: 4 });
    expect(detail.data.order).not.toHaveProperty("unitPriceCents");
    const browserLogin = await request.post("/api/auth/login", { form: { username, password }, maxRedirects: 0 });
    expect(browserLogin.status()).toBe(303);
    const page = await request.get(`/orders/${order.id}`);
    expect(page.status()).toBe(200); expect(await page.text()).toContain("免费云函数转发联调记录");
    expect((await proxy({ method: "POST", path: "/records", token, body: {
      machineId: "missing-machine", orderId: order.id, completedQuantity: 1, shippedQuantity: 0,
    } })).statusCode).toBe(400);
    await db.order.update({ where: { id: order.id }, data: { status: "completed" } });
    expect((await proxy({ method: "POST", path: "/records", token, body: {
      machineId: machine.id, orderId: order.id, completedQuantity: 1, shippedQuantity: 0,
    } })).statusCode).toBe(400);
    expect((await proxy({ method: "POST", path: "/auth/logout", token })).statusCode).toBe(200);
    expect((await proxy({ path: "/auth/me", token })).statusCode).toBe(401);
    expect((await request.get(`/orders/${order.id}`)).status()).toBe(200);
  } finally {
    await db.workspace.delete({ where: { id: workspace.id } });
    await db.$disconnect();
  }
});
