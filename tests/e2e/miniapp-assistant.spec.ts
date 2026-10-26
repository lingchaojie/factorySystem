import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { test, expect } from "@playwright/test";

test("assistant queries an isolated factory through the live gateway without changing business data", async ({ request, baseURL }) => {
  test.setTimeout(120000);
  if (!baseURL) throw new Error("A running website is required");
  const gateway = process.env.MINIAPP_GATEWAY_URL;
  const proxy = async (event: { method?: string; path: string; token?: string; body?: object }) => {
    const response = gateway
      ? await request.post(gateway, { data: event })
      : await request.fetch("/api/miniapp" + event.path, { method: event.method || "GET", headers: event.token ? { Authorization: "Bearer " + event.token } : {}, data: event.body });
    return { status: response.status(), data: await response.json() };
  };
  const db = new PrismaClient();
  const workspace = await db.workspace.create({ data: { name: "Agent isolated verification" } });
  try {
    const username = "agent-check-" + randomUUID();
    const password = randomUUID();
    await db.user.create({ data: { workspaceId: workspace.id, username, displayName: "测试员工", role: "employee", passwordHash: await bcrypt.hash(password, 10) } });
    const machine = await db.machine.create({ data: { workspaceId: workspace.id, code: "CNC-AGENT-01", name: "助手测试机器" } });
    const order = await db.order.create({ data: { workspaceId: workspace.id, orderNo: "AGENT-DEMO-001", customerName: "虚构演示客户", partName: "测试轴套", plannedQuantity: 100, status: "in_progress" } });
    await db.machineOrderAssignment.create({ data: { workspaceId: workspace.id, machineId: machine.id, orderId: order.id } });
    await db.productionRecord.createMany({ data: [
      { workspaceId: workspace.id, machineId: machine.id, orderId: order.id, type: "completed", quantity: 11, recordedAt: new Date() },
      { workspaceId: workspace.id, machineId: machine.id, orderId: order.id, type: "shipped", quantity: 4, recordedAt: new Date() },
    ] });
    const login = await proxy({ method: "POST", path: "/auth/login", body: { username, password } });
    expect(login.status).toBe(200); const token = login.data.token;
    expect((await proxy({ path: "/assistant" })).status).toBe(401);
    expect((await proxy({ path: "/assistant", token })).data.configured).toBe(true);
    const created = await proxy({ method: "POST", path: "/assistant", token, body: { message: "查询 CNC-AGENT-01 的机器进度，以及 AGENT-DEMO-001 的累计加工和出货进度", history: [], requestId: randomUUID(), consent: true } });
    expect(created.status).toBe(202);
    const id = created.data.job.id;
    let job = created.data.job;
    for (let attempt = 0; attempt < 45 && job.state === "pending"; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      const polled = await proxy({ path: "/assistant/jobs/" + id, token });
      expect(polled.status).toBe(200); job = polled.data.job;
    }
    expect(job.state, job.error).toBe("completed");
    expect(job.answer.sources.some((s: { id: string }) => s.id === machine.id)).toBe(true);
    expect(JSON.stringify(job.answer.sources)).toContain("11");
    expect(JSON.stringify(job.answer.sources)).toContain("4");
    expect(JSON.stringify(job.answer)).not.toMatch(/password|unitPrice|虚构演示客户/);
    expect(await db.productionRecord.count({ where: { workspaceId: workspace.id } })).toBe(2);
    await proxy({ method: "POST", path: "/auth/logout", token });
    expect((await proxy({ path: "/assistant/jobs/" + id, token })).status).toBe(401);
  } finally { await db.workspace.delete({ where: { id: workspace.id } }); await db.$disconnect(); }
});
