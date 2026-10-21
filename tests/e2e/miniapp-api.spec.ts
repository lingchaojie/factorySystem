import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { expect, test } from "@playwright/test";

test("mini program HTTP writes appear on the authenticated website", async ({ request }) => {
  const db = new PrismaClient();
  const username = `http-mini-${randomUUID()}`;
  const password = "local-http-demo-password";
  const workspace = await db.workspace.create({ data: { name: "HTTP demo test" } });
  try {
    await db.user.create({ data: { username, displayName: "HTTP操作人", role: "employee",
      passwordHash: await bcrypt.hash(password, 10), workspaceId: workspace.id } });
    const machine = await db.machine.create({ data: { workspaceId: workspace.id, code: "HTTP-1", name: "HTTP演示机" } });
    const order = await db.order.create({ data: { workspaceId: workspace.id, orderNo: "HTTP-DEMO", customerName: "HTTP客户",
      partName: "HTTP轴套", plannedQuantity: 100, unitPriceCents: 1234, status: "in_progress" } });
    await db.machineOrderAssignment.create({ data: { workspaceId: workspace.id, machineId: machine.id, orderId: order.id } });

    const login = await request.post("/api/miniapp/auth/login", { data: { username, password } });
    expect(login.status()).toBe(200);
    const { token } = await login.json();
    const headers = { Authorization: `Bearer ${token}` };
    expect(login.headers()["set-cookie"]).toBeUndefined();
    expect((await request.get("/api/miniapp/machines", { headers })).status()).toBe(200);
    const posted = await request.post("/api/miniapp/records", { headers, data: {
      machineId: machine.id, orderId: order.id, completedQuantity: 11, shippedQuantity: 4, notes: "小程序HTTP联调记录",
    } });
    expect(posted.status()).toBe(201);
    expect((await posted.json()).records).toHaveLength(2);

    const browserLogin = await request.post("/api/auth/login", { form: { username, password }, maxRedirects: 0 });
    expect(browserLogin.status()).toBe(303);
    expect(browserLogin.headers()["set-cookie"]).toContain("factory_session=");
    const webPage = await request.get(`/orders/${order.id}`);
    expect(webPage.status()).toBe(200);
    expect(await webPage.text()).toContain("小程序HTTP联调记录");
    const detail = await (await request.get(`/api/miniapp/orders/${order.id}`, { headers })).json();
    expect(detail.order).toMatchObject({ completedQuantity: 11, shippedQuantity: 4 });
    expect(detail.order).not.toHaveProperty("unitPriceCents");

    await request.post("/api/miniapp/auth/logout", { headers });
    expect((await request.get("/api/miniapp/auth/me", { headers })).status()).toBe(401);
    // Revoking the mini-program token must leave the separate browser login usable.
    expect((await request.get(`/orders/${order.id}`)).status()).toBe(200);
  } finally {
    await db.workspace.delete({ where: { id: workspace.id } });
    await db.$disconnect();
  }
});
