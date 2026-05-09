import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createMachine, linkMachineToOrder } from "@/server/services/machines";
import { createOrder, getOrderWithSummary } from "@/server/services/orders";
import {
  createProductionRecord,
  deleteProductionRecord,
} from "@/server/services/records";

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
