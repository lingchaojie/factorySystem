import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createMachine, linkMachineToOrder } from "@/server/services/machines";
import {
  closeOrder,
  createOrder,
  getOrderWithSummary,
  listOrders,
} from "@/server/services/orders";
import {
  createProductionRecord,
  deleteProductionRecord,
  updateProductionRecord,
} from "@/server/services/records";

async function createWorkspace() {
  const workspace = await prisma.workspace.create({
    data: { name: `Test Workspace ${randomUUID()}` },
  });
  workspaceIds.push(workspace.id);
  return workspace;
}

const workspaceIds: string[] = [];

describe("factory services", () => {
  afterEach(async () => {
    await prisma.workspace.deleteMany({
      where: { id: { in: workspaceIds.splice(0) } },
    });
  });

  it("generates daily order numbers and stores unit prices", async () => {
    const workspace = await createWorkspace();

    const first = await createOrder(workspace.id, {
      customerName: "甲方工厂",
      partName: "法兰盘",
      plannedQuantity: 100,
      unitPriceCents: 1250,
      dueDate: null,
      notes: "",
    });
    const second = await createOrder(workspace.id, {
      customerName: "乙方工厂",
      partName: "轴套",
      plannedQuantity: 50,
      unitPriceCents: null,
      dueDate: null,
      notes: "",
    });

    expect(first.orderNo).toMatch(/^ORD-\d{8}-0001$/);
    expect(second.orderNo).toMatch(/^ORD-\d{8}-0002$/);
    expect(first.orderNo).not.toBe(second.orderNo);
    expect(first.unitPriceCents).toBe(1250);
    expect(second.unitPriceCents).toBeNull();
  });

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

  it("updates a production record without moving it between orders", async () => {
    const workspace = await createWorkspace();
    const machine = await createMachine(workspace.id, {
      code: "1U",
      name: "1U号机",
      model: "VMC",
      location: "A区",
      status: "active",
      notes: "",
    });
    const order = await createOrder(workspace.id, {
      customerName: "甲方工厂",
      orderNo: "A-001-U",
      partName: "法兰盘",
      plannedQuantity: 100,
      dueDate: null,
      notes: "",
    });
    const otherOrder = await createOrder(workspace.id, {
      customerName: "乙方工厂",
      orderNo: "A-001-V",
      partName: "轴套",
      plannedQuantity: 50,
      dueDate: null,
      notes: "",
    });

    await linkMachineToOrder(workspace.id, machine.id, order.id);
    const record = await createProductionRecord(workspace.id, {
      machineId: machine.id,
      recordedAt: new Date("2026-05-10T08:00:00.000Z"),
      completedQuantity: 20,
      shippedQuantity: 10,
      notes: "白班",
    });
    await linkMachineToOrder(workspace.id, machine.id, otherOrder.id);

    const updated = await updateProductionRecord(workspace.id, record.id, {
      recordedAt: new Date("2026-05-10T09:30:00.000Z"),
      completedQuantity: 60,
      shippedQuantity: 40,
      notes: "复核后调整",
    });

    expect(updated.orderId).toBe(order.id);
    expect(updated.machineId).toBe(machine.id);
    expect(updated.completedQuantity).toBe(60);
    expect(updated.shippedQuantity).toBe(40);
    expect(updated.notes).toBe("复核后调整");

    const originalSummary = await getOrderWithSummary(workspace.id, order.id);
    expect(originalSummary.completedQuantity).toBe(60);
    expect(originalSummary.shippedQuantity).toBe(40);

    const otherSummary = await getOrderWithSummary(workspace.id, otherOrder.id);
    expect(otherSummary.completedQuantity).toBe(0);
    expect(otherSummary.shippedQuantity).toBe(0);
  });

  it("recomputes over-plan and remaining quantities after deleting a later record", async () => {
    const workspace = await createWorkspace();
    const machine = await createMachine(workspace.id, {
      code: "1D",
      name: "1D号机",
      model: "VMC",
      location: "A区",
      status: "active",
      notes: "",
    });
    const order = await createOrder(workspace.id, {
      customerName: "甲方工厂",
      orderNo: "A-001-D",
      partName: "法兰盘",
      plannedQuantity: 100,
      dueDate: null,
      notes: "",
    });

    await linkMachineToOrder(workspace.id, machine.id, order.id);
    await createProductionRecord(workspace.id, {
      machineId: machine.id,
      recordedAt: new Date("2026-05-10T08:00:00.000Z"),
      completedQuantity: 60,
      shippedQuantity: 20,
      notes: "首件",
    });
    const second = await createProductionRecord(workspace.id, {
      machineId: machine.id,
      recordedAt: new Date("2026-05-10T09:00:00.000Z"),
      completedQuantity: 50,
      shippedQuantity: 90,
      notes: "补出货",
    });

    let summary = await getOrderWithSummary(workspace.id, order.id);
    expect(summary.completedQuantity).toBe(110);
    expect(summary.shippedQuantity).toBe(110);
    expect(summary.remainingQuantity).toBe(0);
    expect(summary.isOverPlanned).toBe(true);

    await deleteProductionRecord(workspace.id, second.id);

    summary = await getOrderWithSummary(workspace.id, order.id);
    expect(summary.completedQuantity).toBe(60);
    expect(summary.shippedQuantity).toBe(20);
    expect(summary.remainingQuantity).toBe(80);
    expect(summary.isOverPlanned).toBe(false);
  });

  it("rejects closing incomplete orders and allows closing fully shipped orders", async () => {
    const workspace = await createWorkspace();
    const incompleteOrder = await createOrder(workspace.id, {
      customerName: "甲方工厂",
      orderNo: "A-002",
      partName: "轴套",
      plannedQuantity: 100,
      dueDate: null,
      notes: "",
    });

    await expect(closeOrder(workspace.id, incompleteOrder.id)).rejects.toThrow(
      "订单出货数量未达到计划数量，不能结单",
    );

    const machine = await createMachine(workspace.id, {
      code: "2",
      name: "2号机",
      model: "VMC",
      location: "A区",
      status: "active",
      notes: "",
    });
    const completeOrder = await createOrder(workspace.id, {
      customerName: "乙方工厂",
      orderNo: "A-003",
      partName: "齿轮",
      plannedQuantity: 100,
      dueDate: null,
      notes: "",
    });

    await linkMachineToOrder(workspace.id, machine.id, completeOrder.id);
    await createProductionRecord(workspace.id, {
      machineId: machine.id,
      recordedAt: new Date("2026-05-10T09:00:00.000Z"),
      completedQuantity: 100,
      shippedQuantity: 100,
      notes: "完工",
    });

    const closedOrder = await closeOrder(workspace.id, completeOrder.id);
    expect(closedOrder.status).toBe("closed");
    expect(closedOrder.closedAt).not.toBeNull();

    await expect(closeOrder(workspace.id, completeOrder.id)).rejects.toThrow(
      "订单已结单",
    );
  });

  it("rejects records for a machine linked to a closed order", async () => {
    const workspace = await createWorkspace();
    const machine = await createMachine(workspace.id, {
      code: "3",
      name: "3号机",
      model: "VMC",
      location: "B区",
      status: "active",
      notes: "",
    });
    const order = await createOrder(workspace.id, {
      customerName: "丙方工厂",
      orderNo: "A-004",
      partName: "端盖",
      plannedQuantity: 100,
      dueDate: null,
      notes: "",
    });

    await linkMachineToOrder(workspace.id, machine.id, order.id);
    await createProductionRecord(workspace.id, {
      machineId: machine.id,
      recordedAt: new Date("2026-05-10T10:00:00.000Z"),
      completedQuantity: 100,
      shippedQuantity: 100,
      notes: "完工",
    });
    await closeOrder(workspace.id, order.id);

    await expect(
      createProductionRecord(workspace.id, {
        machineId: machine.id,
        recordedAt: new Date("2026-05-10T11:00:00.000Z"),
        completedQuantity: 1,
        shippedQuantity: 0,
        notes: "返工",
      }),
    ).rejects.toThrow("订单已结单，不能录入记录");
  });

  it("rejects linking a machine to a closed order", async () => {
    const workspace = await createWorkspace();
    const sourceMachine = await createMachine(workspace.id, {
      code: "4A",
      name: "4A号机",
      model: "VMC",
      location: "B区",
      status: "active",
      notes: "",
    });
    const targetMachine = await createMachine(workspace.id, {
      code: "4B",
      name: "4B号机",
      model: "VMC",
      location: "B区",
      status: "active",
      notes: "",
    });
    const order = await createOrder(workspace.id, {
      customerName: "丁方工厂",
      orderNo: "A-005",
      partName: "支架",
      plannedQuantity: 100,
      dueDate: null,
      notes: "",
    });

    await linkMachineToOrder(workspace.id, sourceMachine.id, order.id);
    await createProductionRecord(workspace.id, {
      machineId: sourceMachine.id,
      recordedAt: new Date("2026-05-10T12:00:00.000Z"),
      completedQuantity: 100,
      shippedQuantity: 100,
      notes: "完工",
    });
    await closeOrder(workspace.id, order.id);

    await expect(
      linkMachineToOrder(workspace.id, targetMachine.id, order.id),
    ).rejects.toThrow("订单已结单，不能关联机器");
  });

  it("rejects linking a missing machine to an order", async () => {
    const workspace = await createWorkspace();
    const order = await createOrder(workspace.id, {
      customerName: "戊方工厂",
      orderNo: "A-006",
      partName: "压板",
      plannedQuantity: 100,
      dueDate: null,
      notes: "",
    });

    await expect(
      linkMachineToOrder(workspace.id, randomUUID(), order.id),
    ).rejects.toThrow("机器不存在");
  });

  it("rejects deleting records from a closed order", async () => {
    const workspace = await createWorkspace();
    const machine = await createMachine(workspace.id, {
      code: "4",
      name: "4号机",
      model: "VMC",
      location: "B区",
      status: "active",
      notes: "",
    });
    const order = await createOrder(workspace.id, {
      customerName: "丁方工厂",
      orderNo: "A-005",
      partName: "支架",
      plannedQuantity: 100,
      dueDate: null,
      notes: "",
    });

    await linkMachineToOrder(workspace.id, machine.id, order.id);
    const record = await createProductionRecord(workspace.id, {
      machineId: machine.id,
      recordedAt: new Date("2026-05-10T12:00:00.000Z"),
      completedQuantity: 100,
      shippedQuantity: 100,
      notes: "完工",
    });
    await closeOrder(workspace.id, order.id);

    await expect(deleteProductionRecord(workspace.id, record.id)).rejects.toThrow(
      "订单已结单，不能删除记录",
    );

    const summary = await getOrderWithSummary(workspace.id, order.id);
    expect(summary.status).toBe("closed");
    expect(summary.completedQuantity).toBe(100);
    expect(summary.shippedQuantity).toBe(100);
    expect(summary.canClose).toBe(false);
  });

  it("rejects updating records from a closed order", async () => {
    const workspace = await createWorkspace();
    const machine = await createMachine(workspace.id, {
      code: "4U",
      name: "4U号机",
      model: "VMC",
      location: "B区",
      status: "active",
      notes: "",
    });
    const order = await createOrder(workspace.id, {
      customerName: "丁方工厂",
      orderNo: "A-005-U",
      partName: "支架",
      plannedQuantity: 100,
      dueDate: null,
      notes: "",
    });

    await linkMachineToOrder(workspace.id, machine.id, order.id);
    const record = await createProductionRecord(workspace.id, {
      machineId: machine.id,
      recordedAt: new Date("2026-05-10T12:00:00.000Z"),
      completedQuantity: 100,
      shippedQuantity: 100,
      notes: "完工",
    });
    await closeOrder(workspace.id, order.id);

    await expect(
      updateProductionRecord(workspace.id, record.id, {
        recordedAt: new Date("2026-05-10T13:00:00.000Z"),
        completedQuantity: 101,
        shippedQuantity: 100,
        notes: "返工",
      }),
    ).rejects.toThrow("订单已结单，不能修改记录");
  });

  it("filters orders by due date range and includes machine info in order detail records", async () => {
    const workspace = await createWorkspace();
    const machine = await createMachine(workspace.id, {
      code: "5",
      name: "5号机",
      model: "VMC",
      location: "C区",
      status: "active",
      notes: "",
    });
    const dueOrder = await createOrder(workspace.id, {
      customerName: "己方工厂",
      orderNo: "A-007",
      partName: "底座",
      plannedQuantity: 10,
      dueDate: new Date("2026-05-10T00:00:00.000Z"),
      notes: "",
    });
    await createOrder(workspace.id, {
      customerName: "己方工厂",
      orderNo: "A-008",
      partName: "垫片",
      plannedQuantity: 10,
      dueDate: new Date("2026-05-12T00:00:00.000Z"),
      notes: "",
    });

    await linkMachineToOrder(workspace.id, machine.id, dueOrder.id);
    await createProductionRecord(workspace.id, {
      machineId: machine.id,
      recordedAt: new Date("2026-05-10T12:00:00.000Z"),
      completedQuantity: 6,
      shippedQuantity: 2,
      notes: "白班",
    });

    const filtered = await listOrders(workspace.id, {
      dueDateFrom: new Date("2026-05-09T00:00:00.000Z"),
      dueDateTo: new Date("2026-05-11T00:00:00.000Z"),
    });
    expect(filtered.map((order) => order.orderNo)).toEqual([dueOrder.orderNo]);

    const detail = await getOrderWithSummary(workspace.id, dueOrder.id);
    expect(detail.productionRecords[0].machine.code).toBe("5");
    expect(detail.currentMachines[0].code).toBe("5");
  });
});
