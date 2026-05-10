import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createMachine, linkMachineToOrder } from "@/server/services/machines";
import { createOrder } from "@/server/services/orders";
import { createProductionRecord } from "@/server/services/records";
import { getWorkspaceAnalytics } from "@/server/services/analytics";

const workspaceIds: string[] = [];

async function createWorkspace() {
  const workspace = await prisma.workspace.create({
    data: { name: `Analytics Workspace ${randomUUID()}` },
  });
  workspaceIds.push(workspace.id);
  return workspace;
}

describe("analytics services", () => {
  afterEach(async () => {
    await prisma.workspace.deleteMany({
      where: { id: { in: workspaceIds.splice(0) } },
    });
  });

  it("computes revenue from shipped quantity and flags unpriced shipments", async () => {
    const workspace = await createWorkspace();
    const pricedMachine = await createMachine(workspace.id, {
      code: "1",
      name: "1号机",
      model: "",
      location: "",
      status: "active",
      notes: "",
    });
    const unpricedMachine = await createMachine(workspace.id, {
      code: "2",
      name: "2号机",
      model: "",
      location: "",
      status: "active",
      notes: "",
    });
    const pricedOrder = await createOrder(workspace.id, {
      customerName: "甲方",
      partName: "法兰",
      plannedQuantity: 100,
      unitPriceCents: 2000,
      dueDate: null,
      notes: "",
    });
    const unpricedOrder = await createOrder(workspace.id, {
      customerName: "乙方",
      partName: "轴套",
      plannedQuantity: 20,
      unitPriceCents: null,
      dueDate: null,
      notes: "",
    });

    await linkMachineToOrder(workspace.id, pricedMachine.id, pricedOrder.id);
    await createProductionRecord(workspace.id, {
      machineId: pricedMachine.id,
      recordedAt: new Date("2026-05-10T02:00:00.000Z"),
      completedQuantity: 80,
      shippedQuantity: 60,
      notes: "",
    });
    await linkMachineToOrder(workspace.id, unpricedMachine.id, unpricedOrder.id);
    await createProductionRecord(workspace.id, {
      machineId: unpricedMachine.id,
      recordedAt: new Date("2026-05-10T03:00:00.000Z"),
      completedQuantity: 0,
      shippedQuantity: 5,
      notes: "",
    });

    const summary = await getWorkspaceAnalytics(workspace.id, {
      from: new Date("2026-05-10T00:00:00.000Z"),
      to: new Date("2026-05-11T00:00:00.000Z"),
    });

    expect(summary.revenueCents).toBe(120000);
    expect(summary.completedQuantity).toBe(80);
    expect(summary.shippedQuantity).toBe(65);
    expect(summary.unpricedShippedQuantity).toBe(5);
    expect(summary.customerRevenue[0]).toMatchObject({
      customerName: "甲方",
      revenueCents: 120000,
    });
    expect(summary.dailySeries).toContainEqual(
      expect.objectContaining({
        date: "2026-05-10",
        revenueCents: 120000,
        completedQuantity: 80,
        shippedQuantity: 65,
      }),
    );
    expect(summary.orderStatusDistribution).toContainEqual(
      expect.objectContaining({ status: "in_progress", count: 2 }),
    );
  });
});
