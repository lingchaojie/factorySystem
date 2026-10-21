// @vitest-environment node
import { randomUUID, createHash } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { createMachine, linkMachineToOrder } from "@/server/services/machines";
import { createOrder, getOrderWithSummary, updateOrderStatus } from "@/server/services/orders";
import { createProductionRecord } from "@/server/services/records";
import { POST as login } from "@/app/api/miniapp/auth/login/route";
import { POST as logout } from "@/app/api/miniapp/auth/logout/route";
import { GET as orders } from "@/app/api/miniapp/orders/route";
import { GET as machineDetail } from "@/app/api/miniapp/machines/[id]/route";
import { GET as orderDetail } from "@/app/api/miniapp/orders/[id]/route";
import { POST as record } from "@/app/api/miniapp/records/route";

const workspaceIds: string[] = [];
function req(path: string, token?: string, body?: unknown) {
  return new Request(`http://factory.test/api/miniapp${path}`, {
    method: body ? "POST" : "GET", headers: {
      "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}),
    }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("mini program shares real website data", () => {
  afterAll(async () => {
    await prisma.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await prisma.$disconnect();
  });

  it("authenticates website accounts, reads/writes shared records, enforces isolation and revokes sessions", async () => {
    const workspace = await prisma.workspace.create({ data: { name: `Miniapp Test ${randomUUID()}` } });
    const otherWorkspace = await prisma.workspace.create({ data: { name: `Miniapp Other ${randomUUID()}` } });
    workspaceIds.push(workspace.id, otherWorkspace.id);
    const username = `mini-${randomUUID()}`;
    const user = await prisma.user.create({ data: {
      username, workspaceId: workspace.id, displayName: "演示员工", role: "employee",
      passwordHash: await hashPassword("demo-password"),
    } });
    const machine = await createMachine(workspace.id, { code: "DEMO-1", name: "演示机", model: "", location: "", status: "active", notes: "" });
    const order = await createOrder(workspace.id, { customerName: "演示客户", partName: "轴套", plannedQuantity: 100,
      unitPriceCents: 1500, dueDate: null, notes: "网站创建" });
    const foreignOrder = await createOrder(otherWorkspace.id, { customerName: "其他工厂", partName: "隔离工件", plannedQuantity: 100,
      unitPriceCents: 9900, dueDate: null, notes: "不能访问" });
    await linkMachineToOrder(workspace.id, machine.id, order.id);

    const badLogin = await login(req("/auth/login", undefined, { username, password: "wrong" }));
    expect(badLogin.status).toBe(401);
    const response = await login(req("/auth/login", undefined, { username, password: "demo-password" }));
    expect(response.status).toBe(200);
    const { token } = await response.json();
    const session = await prisma.session.findUnique({ where: { tokenHash: createHash("sha256").update(token).digest("hex") } });
    expect(session?.userId).toBe(user.id);
    expect(session?.tokenHash).not.toBe(token);

    const list = await (await orders(req("/orders", token))).json();
    expect(list.orders.map((o: { id: string }) => o.id)).toEqual([order.id]);
    expect(JSON.stringify(list)).not.toMatch(/unitPrice|passwordHash|passwordPlaintext/);
    const machineData = await (await machineDetail(req(`/machines/${machine.id}`, token), { params: Promise.resolve({ id: machine.id }) })).json();
    expect(machineData.machine.orders[0].id).toBe(order.id);
    expect((await orderDetail(req(`/orders/${foreignOrder.id}`, token), { params: Promise.resolve({ id: foreignOrder.id }) })).status).toBe(404);

    const payload = { machineId: machine.id, orderId: order.id, completedQuantity: 12, shippedQuantity: 4, notes: "小程序录入" };
    expect((await record(req("/records", token, payload))).status).toBe(201);
    const websiteOrder = await getOrderWithSummary(workspace.id, order.id);
    expect(websiteOrder).toMatchObject({ completedQuantity: 12, shippedQuantity: 4 });
    expect(websiteOrder.productionRecords).toHaveLength(2);
    expect(websiteOrder.productionRecords.every(r => r.createdByUserId === user.id)).toBe(true);

    // The reverse direction: a write through the website's service appears in the mini program.
    await createProductionRecord(workspace.id, { ...payload, completedQuantity: 5, shippedQuantity: 2, recordedAt: new Date(), actorUserId: user.id });
    const miniOrder = await (await orderDetail(req(`/orders/${order.id}`, token), { params: Promise.resolve({ id: order.id }) })).json();
    expect(miniOrder.order).toMatchObject({ completedQuantity: 17, shippedQuantity: 6 });
    expect(miniOrder.order.records).toHaveLength(4);

    expect((await record(req("/records", token, { ...payload, orderId: foreignOrder.id }))).status).toBe(400);
    const unlinked = await createOrder(workspace.id, { customerName: "演示", partName: "未关联", plannedQuantity: null, unitPriceCents: null, dueDate: null, notes: "" });
    expect((await record(req("/records", token, { ...payload, orderId: unlinked.id }))).status).toBe(400);
    await updateOrderStatus(workspace.id, order.id, "completed");
    expect((await record(req("/records", token, payload))).status).toBe(400);
    expect((await getOrderWithSummary(workspace.id, order.id)).productionRecords).toHaveLength(4);

    await prisma.session.update({ where: { id: session!.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await orders(req("/orders", token))).status).toBe(401);
    const second = await (await login(req("/auth/login", undefined, { username, password: "demo-password" }))).json();
    expect((await logout(req("/auth/logout", second.token, {}))).status).toBe(200);
    expect((await orders(req("/orders", second.token))).status).toBe(401);
  }, 20000);
});
