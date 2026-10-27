// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { buildWorkbench, type WorkbenchOrder } from "@/domain/workbench";
const now = new Date("2026-10-27T15:59:00Z");
const date = (value: string) => new Date(value + "T00:00:00+08:00");
const order = (overrides: Partial<WorkbenchOrder> = {}): WorkbenchOrder => ({ id: "o1", orderNo: "D-001", partName: "轴套",
  status: "in_progress", closedAt: null, plannedQuantity: 100, dueDate: date("2026-10-28"), createdAt: date("2026-10-20"),
  completedQuantity: 70, shippedQuantity: 20, lastCompletedAt: date("2026-10-27"), machines: [], ...overrides });
describe("workbench business rules", () => {
  it("uses Beijing calendar days at midnight, including today and the 3-day boundary", () => {
    const orders = [-1, 0, 3, 4].map((delta, i) => order({ id: String(i), dueDate: date(`2026-10-${27 + delta}`) }));
    const result = buildWorkbench(orders, now);
    expect(result.summary).toMatchObject({ overdueOrders: 1, dueSoonOrders: 2, riskOrders: 3 });
    expect(result.businessDate).toBe("2026-10-27");
    expect(buildWorkbench([orders[1]], new Date("2026-10-27T16:00:00Z")).summary.overdueOrders).toBe(1);
  });
  it("separates remaining processing, remaining shipment and ready partial shipment", () => {
    const result = buildWorkbench([order()], now);
    expect(result.shipments[0]).toMatchObject({ remainingProcessing: 30, remainingQuantity: 80, readyQuantity: 50 });
    expect(result.shipments[0].shipmentLabel).toContain("分批");
    expect(result.summary.readyQuantity).toBe(50);
    const full = buildWorkbench([order({ completedQuantity: 100 })], now).shipments[0];
    expect(full.shipmentLabel).toContain("加工完成");
  });
  it("deduplicates tasks and highlights stale processing and machine concerns without predicting completion", () => {
    const result = buildWorkbench([order({ dueDate: date("2026-10-25"), lastCompletedAt: date("2026-10-24"),
      machines: [{ id: "m1", code: "VMC-03", name: "维护机", status: "maintenance" }] })], now);
    expect(result.summary).toMatchObject({ riskOrders: 1, todoOrders: 1 });
    expect(result.todos[0]).toMatchObject({ overdue: true, stalled: true, machineConcern: true });
    expect(result.todos[0].actions.join()).toContain("核实设备影响");
    expect(buildWorkbench([order({ completedQuantity: 100, lastCompletedAt: date("2026-10-20") })], now).todos[0].stalled).toBe(false);
  });
  it("does not imply unknown plans or dates are delivered and handles never-started work", () => {
    const result = buildWorkbench([order({ plannedQuantity: null, dueDate: null, lastCompletedAt: null })], now);
    expect(result.todos[0]).toMatchObject({ remainingQuantity: null, stalled: true, dueInDays: null });
    expect(result.todos[0].reasons.join()).toContain("尚未设置计划数量");
    expect(result.todos[0].reasons.join()).toContain("尚未设置交期");
    expect(buildWorkbench([order({ status: "processing_pending", lastCompletedAt: null })], now).todos[0].stalled).toBe(false);
  });
  it("excludes closed/completed orders, flags quantity mismatches, and suggests closing fulfilled orders", () => {
    const result = buildWorkbench([order({ id: "closed", closedAt: now }), order({ id: "completed", status: "completed" }),
      order({ id: "bad", shippedQuantity: 80 }), order({ id: "over", completedQuantity: 110 }),
      order({ id: "done", completedQuantity: 100, shippedQuantity: 100 })], now);
    expect(result.summary).toMatchObject({ openOrders: 3, anomalyOrders: 2, shipmentOrders: 0, overdueOrders: 0 });
    expect(result.todos.find(o => o.id === "done")?.actions.join()).toContain("关闭订单");
    expect(result.todos.find(o => o.id === "done")?.dueSoon).toBe(false);
  });
  it("aggregates every matching order instead of silently counting the first page", () => {
    const result = buildWorkbench(Array.from({ length: 45 }, (_, i) => order({ id: String(i) })), now);
    expect(result.summary).toMatchObject({ todoOrders: 45, shipmentOrders: 45, readyQuantity: 2250 });
  });
});

const mocks = vi.hoisted(() => ({ orders: vi.fn(), totals: vi.fn(), user: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("@/lib/session", () => ({ readSessionTokenUser: mocks.user }));
import { getWorkbench } from "@/server/miniapp/workbench";
import { GET } from "@/app/api/miniapp/workbench/route";
import { lookupProgress } from "@/server/assistant/lookup";
describe("workbench API and assistant isolation", () => {
  function setup(count = 1) {
    mocks.transaction.mockImplementation(callback => callback({ order: { findMany: mocks.orders }, productionRecord: { groupBy: mocks.totals } }));
    mocks.orders.mockResolvedValue(Array.from({ length: count }, (_, i) => ({ ...order({ id: `demo_${i}`, dueDate: date("2026-10-01") }), machineAssignments: [] })));
    mocks.totals.mockResolvedValue(Array.from({ length: count }, (_, i) => ({ orderId: `demo_${i}`, type: "completed", _sum: { quantity: 70 }, _max: { recordedAt: now } })));
    mocks.user.mockResolvedValue({ id: "demo-user", workspaceId: "demo-workspace", role: "employee" });
  }
  it("scopes orders, machine relations and record aggregates without customer, price or note fields", async () => {
    vi.clearAllMocks(); setup();
    await getWorkbench("demo-workspace", "CNC-01", "foreign-order");
    expect(mocks.orders.mock.calls[0][0].where).toMatchObject({ workspaceId: "demo-workspace", id: "foreign-order" });
    expect(mocks.orders.mock.calls[0][0].select.machineAssignments.where).toEqual({ workspaceId: "demo-workspace" });
    expect(mocks.totals.mock.calls[0][0].where).toEqual({ workspaceId: "demo-workspace", orderId: { in: ["demo_0"] } });
    expect(mocks.orders.mock.calls[0][0].select).not.toHaveProperty("unitPriceCents");
    expect(mocks.transaction.mock.calls[0][1]).toEqual({ isolationLevel: "RepeatableRead" });
  });
  it("authenticates first and rejects client-supplied workspaces and invalid pages", async () => {
    vi.clearAllMocks(); setup(); mocks.user.mockResolvedValue(null);
    expect((await GET(new Request("https://test/api/miniapp/workbench"))).status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
    setup();
    for (const query of ["workspaceId=other", "page=0", "page=1.2", "view=admin"])
      expect((await GET(new Request("https://test/api/miniapp/workbench?" + query))).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("paginates response data while keeping complete totals; assistant reuses the same scoped computation", async () => {
    vi.clearAllMocks(); setup(25);
    const response = await GET(new Request("https://test/api/miniapp/workbench?view=shipments&page=2"));
    const result = await response.json();
    expect(result).toMatchObject({ total: 25, page: 2, hasMore: false, summary: { shipmentOrders: 25, readyQuantity: 1750 } });
    expect(result.items).toHaveLength(5);
    for (const kind of ["risks", "todos", "shipments"] as const) {
      const answer = await lookupProgress("demo-workspace", { kind, query: "CNC", id: "" });
      expect(answer).toMatchObject({ total: 25, hasMore: true, summary: { shipmentOrders: 25 } });
      expect(answer.items).toHaveLength(12);
      expect(answer.items.every(o => o.kind === "order" && o.id.startsWith("demo_"))).toBe(true);
      expect(answer.scope).toContain("CNC");
      expect(JSON.stringify(answer)).not.toMatch(/unitPrice|customerName|password/);
    }
  });
});
