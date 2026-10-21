// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticatePassword: vi.fn(), createSession: vi.fn(), readSessionTokenUser: vi.fn(), destroySessionToken: vi.fn(),
  listMachines: vi.fn(), getMachine: vi.fn(), listOrders: vi.fn(), getOrderWithSummary: vi.fn(),
  createProductionRecord: vi.fn(), revalidatePath: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ authenticatePassword: mocks.authenticatePassword }));
vi.mock("@/lib/session", () => ({ createSession: mocks.createSession,
  readSessionTokenUser: mocks.readSessionTokenUser, destroySessionToken: mocks.destroySessionToken }));
vi.mock("@/server/services/machines", () => ({ listMachines: mocks.listMachines, getMachine: mocks.getMachine }));
vi.mock("@/server/services/orders", () => ({ listOrders: mocks.listOrders, getOrderWithSummary: mocks.getOrderWithSummary }));
vi.mock("@/server/services/records", () => ({ createProductionRecord: mocks.createProductionRecord }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { POST as login } from "@/app/api/miniapp/auth/login/route";
import { POST as logout } from "@/app/api/miniapp/auth/logout/route";
import { GET as me } from "@/app/api/miniapp/auth/me/route";
import { GET as machines } from "@/app/api/miniapp/machines/route";
import { GET as machine } from "@/app/api/miniapp/machines/[id]/route";
import { GET as orders } from "@/app/api/miniapp/orders/route";
import { GET as order } from "@/app/api/miniapp/orders/[id]/route";
import { POST as record } from "@/app/api/miniapp/records/route";

const user = { id: "u1", workspaceId: "w1", username: "worker", displayName: "张三", role: "employee",
  workspace: { name: "测试工厂" }, passwordHash: "secret-hash", passwordPlaintext: "secret-password" };
const orderRow = { id: "o1", orderNo: "ORD-001", customerName: "客户", partName: "轴套", status: "in_progress",
  plannedQuantity: 100, unitPriceCents: 1234, dueDate: null, notes: null, closedAt: null,
  productionRecords: [{ type: "completed", quantity: 10 }, { type: "shipped", quantity: 3 }],
  createdByUser: user, updatedByUser: user, workspaceId: "w1" };
function request(path: string, body?: unknown) {
  return new Request("http://factory.test/api/miniapp" + path, {
    method: body === undefined ? "GET" : "POST", headers: { authorization: "Bearer token", "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const input = { machineId: "m1", orderId: "o1", completedQuantity: 12, shippedQuantity: 4, notes: "白班" };

describe("mini program API", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.readSessionTokenUser.mockResolvedValue(user); });
  it("logs in with an opaque token and only public account fields", async () => {
    mocks.authenticatePassword.mockResolvedValue(user);
    mocks.createSession.mockResolvedValue("opaque-token");
    const response = await login(request("/auth/login", { username: " worker ", password: "password" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(await response.json()).toEqual({ token: "opaque-token", user: {
      id: "u1", username: "worker", displayName: "张三", role: "employee", workspaceName: "测试工厂",
    } });
    expect(mocks.authenticatePassword).toHaveBeenCalledWith("worker", "password");
  });
  it("rejects bad credentials without creating a session", async () => {
    mocks.authenticatePassword.mockResolvedValue(null);
    expect((await login(request("/auth/login", { username: "worker", password: "wrong" }))).status).toBe(401);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
  it("rejects malformed JSON and empty credentials", async () => {
    expect((await login(new Request("http://factory.test", { method: "POST", body: "{" }))).status).toBe(400);
    expect((await login(request("/auth/login", { username: "", password: "" }))).status).toBe(400);
  });
  it("does not accept a browser cookie as mini program authentication", async () => {
    mocks.readSessionTokenUser.mockResolvedValue(null);
    const response = await machines(new Request("http://factory.test/api/miniapp/machines", { headers: { cookie: "factory_session=token" } }));
    expect(response.status).toBe(401);
    expect(mocks.readSessionTokenUser).toHaveBeenCalledWith(undefined);
    expect(mocks.listMachines).not.toHaveBeenCalled();
  });
  it("returns account details and revokes exactly the supplied token", async () => {
    expect((await me(request("/auth/me"))).status).toBe(200);
    expect(mocks.readSessionTokenUser).toHaveBeenCalledWith("token");
    expect((await logout(request("/auth/logout", {}))).status).toBe(200);
    expect(mocks.destroySessionToken).toHaveBeenCalledWith("token");
  });
  it("scopes lists to the authenticated factory and strips prices and nested secrets", async () => {
    mocks.listOrders.mockResolvedValue([orderRow]);
    const response = await orders(request("/orders?query=轴套&status=in_progress&workspaceId=other"));
    expect(mocks.listOrders).toHaveBeenCalledWith("w1", { query: "轴套", status: "in_progress" });
    const data = await response.json();
    expect(data.orders[0]).toMatchObject({ completedQuantity: 10, shippedQuantity: 3, remainingQuantity: 97 });
    expect(JSON.stringify(data)).not.toMatch(/unitPrice|secret|password|createdByUser|updatedByUser|workspaceId/);
  });
  it("returns manager prices and rejects invalid status filters", async () => {
    mocks.readSessionTokenUser.mockResolvedValue({ ...user, role: "manager" });
    mocks.listOrders.mockResolvedValue([orderRow]);
    expect((await (await orders(request("/orders"))).json()).orders[0].unitPriceCents).toBe(1234);
    expect((await orders(request("/orders?status=invalid"))).status).toBe(400);
  });
  it("filters sensitive fields in machine assignments and order record operators too", async () => {
    const row = { id: "m1", code: "1", name: "1号机", status: "active", notes: null,
      orderAssignments: [{ order: orderRow }], productionRecords: [] };
    mocks.listMachines.mockResolvedValue([row]); mocks.getMachine.mockResolvedValue(row);
    const list = await (await machines(request("/machines"))).json();
    expect(list.machines[0].orders[0].partName).toBe("轴套");
    const detail = await machine(request("/machines/m1"), { params: Promise.resolve({ id: "m1" }) });
    expect(mocks.getMachine).toHaveBeenCalledWith("w1", "m1");
    expect(await detail.text()).not.toMatch(/unitPrice|password|secret/);
    mocks.getOrderWithSummary.mockResolvedValue({ ...orderRow, machineAssignments: [{ machine: row }],
      productionRecords: [{ id: "r1", type: "completed", quantity: 10, recordedAt: new Date(), notes: null, machine: row, createdByUser: user }] });
    const result = await order(request("/orders/o1"), { params: Promise.resolve({ id: "o1" }) });
    const data = await result.json();
    expect(mocks.getOrderWithSummary).toHaveBeenCalledWith("w1", "o1");
    expect(data.order.records[0].operatorName).toBe("张三");
    expect(JSON.stringify(data)).not.toMatch(/unitPrice|password|secret/);
  });
  it("uses the shared production service, server time and authenticated actor, then invalidates web pages", async () => {
    mocks.createProductionRecord.mockResolvedValue({ machineId: "m1", orderId: "o1",
      records: [{ id: "r1", type: "completed", quantity: 12, recordedAt: new Date() }] });
    const response = await record(request("/records", { ...input, workspaceId: "other", actorUserId: "other", recordedAt: "2000-01-01" }));
    expect(response.status).toBe(201);
    expect(mocks.createProductionRecord).toHaveBeenCalledWith("w1", { ...input, actorUserId: "u1", recordedAt: expect.any(Date) });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/records");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/orders/o1");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/analytics");
  });
  it.each([
    { ...input, completedQuantity: -1 }, { ...input, shippedQuantity: 0.5 },
    { ...input, completedQuantity: "12" }, { ...input, completedQuantity: 0, shippedQuantity: 0 },
    { ...input, completedQuantity: 2147483648 }, { ...input, notes: "a".repeat(2001) },
  ])("rejects invalid record input without writing", async body => {
    expect((await record(request("/records", body))).status).toBe(400);
    expect(mocks.createProductionRecord).not.toHaveBeenCalled();
  });
  it.each(["机器不存在", "订单不存在", "机器未关联该订单，不能录入记录", "订单已完成，不能录入记录"])("preserves service restrictions: %s", async message => {
    mocks.createProductionRecord.mockRejectedValue(new Error(message));
    const response = await record(request("/records", input));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: message });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
