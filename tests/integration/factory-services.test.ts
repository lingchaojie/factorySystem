import { randomUUID } from "node:crypto";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  createMachine,
  deleteMachine,
  linkMachineToOrder,
  listMachines,
  updateMachine,
} from "@/server/services/machines";
import {
  getOrderDrawingArchive,
  replaceOrderDrawings,
} from "@/server/services/order-drawings";
import {
  createOrder,
  deleteOrder,
  getOrderWithSummary,
  listOrders,
  updateOrderStatus,
} from "@/server/services/orders";
import {
  createProductionRecord,
  deleteProductionRecord,
  listProductionRecords,
  updateProductionRecord,
} from "@/server/services/records";
import {
  createWorkspaceWithInitialAccount,
  listCustomerAccounts,
  updateCustomerUser,
} from "@/server/services/platform-admin";

async function createWorkspace() {
  const workspace = await prisma.workspace.create({
    data: { name: `Test Workspace ${randomUUID()}` },
  });
  workspaceIds.push(workspace.id);
  return workspace;
}

function createDrawingFile(content: string, name: string, type: string) {
  const bytes = Buffer.from(content);
  return {
    name,
    type,
    size: bytes.byteLength,
    arrayBuffer: async () =>
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ),
  } as File;
}

const workspaceIds: string[] = [];
const drawingStorageDirs: string[] = [];
const originalDrawingStorageDir = process.env.ORDER_DRAWING_STORAGE_DIR;

describe("factory services", () => {
  afterEach(async () => {
    await prisma.workspace.deleteMany({
      where: { id: { in: workspaceIds.splice(0) } },
    });
    await Promise.all(
      drawingStorageDirs.splice(0).map((dir) =>
        rm(dir, { recursive: true, force: true }),
      ),
    );
    if (originalDrawingStorageDir === undefined) {
      delete process.env.ORDER_DRAWING_STORAGE_DIR;
    } else {
      process.env.ORDER_DRAWING_STORAGE_DIR = originalDrawingStorageDir;
    }
  });

  it("generates daily order numbers and stores optional quantities and prices", async () => {
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
      plannedQuantity: null,
      unitPriceCents: null,
      dueDate: null,
      notes: "",
    });

    expect(first.orderNo).toMatch(/^ORD-\d{8}-0001$/);
    expect(second.orderNo).toMatch(/^ORD-\d{8}-0002$/);
    expect(first.orderNo).not.toBe(second.orderNo);
    expect(first.status).toBe("development_pending");
    expect(first.unitPriceCents).toBe(1250);
    expect(second.plannedQuantity).toBeNull();
    expect(second.unitPriceCents).toBeNull();
  });

  it("updates machine status and notes", async () => {
    const workspace = await createWorkspace();
    const machine = await createMachine(workspace.id, {
      code: "1",
      name: "1号机",
      model: "",
      location: "",
      status: "active",
      notes: "",
    });

    const updated = await updateMachine(workspace.id, machine.id, {
      status: "maintenance",
      notes: "等待换刀",
    });

    expect(updated.status).toBe("maintenance");
    expect(updated.notes).toBe("等待换刀");
  });

  it("deletes orders only when they have no linked machines or production records", async () => {
    const workspace = await createWorkspace();
    const order = await createOrder(workspace.id, {
      customerName: "甲方",
      partName: "法兰",
      plannedQuantity: 100,
      unitPriceCents: null,
      dueDate: null,
      notes: "",
    });

    await deleteOrder(workspace.id, order.id);

    await expect(listOrders(workspace.id, {})).resolves.toHaveLength(0);
  });

  it("rejects order deletion when machines or records still reference it", async () => {
    const workspace = await createWorkspace();
    const machine = await createMachine(workspace.id, {
      code: "1",
      name: "1号机",
      model: "",
      location: "",
      status: "active",
      notes: "",
    });
    const order = await createOrder(workspace.id, {
      customerName: "甲方",
      partName: "法兰",
      plannedQuantity: 100,
      unitPriceCents: null,
      dueDate: null,
      notes: "",
    });
    await linkMachineToOrder(workspace.id, machine.id, order.id);

    await expect(deleteOrder(workspace.id, order.id)).rejects.toThrow(
      "订单仍有关联机器，不能删除",
    );
  });

  it("deletes machines only when they have no production records", async () => {
    const workspace = await createWorkspace();
    const machine = await createMachine(workspace.id, {
      code: "1",
      name: "1号机",
      model: "",
      location: "",
      status: "active",
      notes: "",
    });

    await deleteMachine(workspace.id, machine.id);

    await expect(listMachines(workspace.id)).resolves.toHaveLength(0);
  });

  it("rejects machine deletion after production records exist", async () => {
    const workspace = await createWorkspace();
    const machine = await createMachine(workspace.id, {
      code: "1",
      name: "1号机",
      model: "",
      location: "",
      status: "active",
      notes: "",
    });
    const order = await createOrder(workspace.id, {
      customerName: "甲方",
      partName: "法兰",
      plannedQuantity: 100,
      unitPriceCents: null,
      dueDate: null,
      notes: "",
    });
    await linkMachineToOrder(workspace.id, machine.id, order.id);
    await createProductionRecord(workspace.id, {
      machineId: machine.id,
      recordedAt: new Date("2026-05-10T08:00:00.000Z"),
      completedQuantity: 10,
      shippedQuantity: 0,
      notes: "",
    });

    await expect(deleteMachine(workspace.id, machine.id)).rejects.toThrow(
      "已有生产记录，不能删除机器",
    );
  });

  it("stores and updates customer visible passwords for the admin console", async () => {
    const workspace = await createWorkspaceWithInitialAccount({
      workspaceName: `Admin Workspace ${randomUUID()}`,
      username: `factory-${randomUUID()}`,
      displayName: "王经理",
      password: "initial-secret",
      role: "manager",
    });
    workspaceIds.push(workspace.id);
    const user = workspace.users[0];

    let account = (await listCustomerAccounts()).find(
      (item) => item.id === user.id,
    );
    expect(account?.passwordPlaintext).toBe("initial-secret");

    await updateCustomerUser({
      userId: user.id,
      workspaceId: workspace.id,
      username: user.username,
      displayName: "李四",
      password: "new-secret",
      role: "employee",
    });

    account = (await listCustomerAccounts()).find((item) => item.id === user.id);
    expect(account?.displayName).toBe("李四");
    expect(account?.role).toBe("employee");
    expect(account?.passwordPlaintext).toBe("new-secret");
  });

  it("filters machines, orders, and records with multi-select values", async () => {
    const workspace = await createWorkspace();
    const activeMachine = await createMachine(workspace.id, {
      code: "1",
      name: "1号机",
      model: "",
      location: "",
      status: "active",
      notes: "",
    });
    const maintenanceMachine = await createMachine(workspace.id, {
      code: "2",
      name: "2号机",
      model: "",
      location: "",
      status: "maintenance",
      notes: "",
    });
    await createMachine(workspace.id, {
      code: "3",
      name: "3号机",
      model: "",
      location: "",
      status: "disabled",
      notes: "",
    });

    const inProgressOrder = await createOrder(workspace.id, {
      customerName: "甲方",
      partName: "法兰",
      plannedQuantity: 100,
      unitPriceCents: null,
      dueDate: null,
      notes: "",
    });
    const completedOrder = await createOrder(workspace.id, {
      customerName: "乙方",
      partName: "底座",
      plannedQuantity: 80,
      unitPriceCents: null,
      dueDate: null,
      notes: "",
    });
    const excludedOrder = await createOrder(workspace.id, {
      customerName: "丙方",
      partName: "垫片",
      plannedQuantity: 60,
      unitPriceCents: null,
      dueDate: null,
      notes: "",
    });

    await linkMachineToOrder(workspace.id, activeMachine.id, inProgressOrder.id);
    await createProductionRecord(workspace.id, {
      machineId: activeMachine.id,
      recordedAt: new Date("2026-05-10T08:00:00.000Z"),
      completedQuantity: 10,
      shippedQuantity: 4,
      notes: "",
    });
    await linkMachineToOrder(workspace.id, maintenanceMachine.id, completedOrder.id);
    await createProductionRecord(workspace.id, {
      machineId: maintenanceMachine.id,
      recordedAt: new Date("2026-05-10T09:00:00.000Z"),
      completedQuantity: 8,
      shippedQuantity: 0,
      notes: "",
    });
    await updateOrderStatus(workspace.id, completedOrder.id, "completed");

    const machines = await listMachines(workspace.id, {
      statuses: ["active", "maintenance"],
    });
    expect(machines.map((machine) => machine.code)).toEqual(["1", "2"]);

    const exactMachineMatches = await listMachines(workspace.id, {
      query: "1",
    });
    expect(exactMachineMatches.map((machine) => machine.code)).toEqual(["1"]);

    const partialMachineMatches = await listMachines(workspace.id, {
      query: "号机",
    });
    expect(partialMachineMatches).toHaveLength(0);

    const orders = await listOrders(workspace.id, {
      statuses: ["in_progress", "completed"],
    });
    expect(orders.map((order) => order.id).sort()).toEqual(
      [inProgressOrder.id, completedOrder.id].sort(),
    );
    expect(orders.map((order) => order.id)).not.toContain(excludedOrder.id);

    const namedOrders = await listOrders(workspace.id, {
      query: "甲方 / 法兰",
    });
    expect(namedOrders.map((order) => order.id)).toEqual([inProgressOrder.id]);

    const records = await listProductionRecords(workspace.id, {
      types: ["completed", "shipped"],
      orderIds: [inProgressOrder.id, completedOrder.id],
      orderStatuses: ["in_progress", "completed"],
    });
    expect(records.map((record) => record.orderId).sort()).toEqual(
      [completedOrder.id, inProgressOrder.id, inProgressOrder.id].sort(),
    );

    const namedRecords = await listProductionRecords(workspace.id, {
      orderQuery: "甲方 / 法兰",
    });
    expect(namedRecords.map((record) => record.orderId).sort()).toEqual(
      [inProgressOrder.id, inProgressOrder.id].sort(),
    );

    const partRecords = await listProductionRecords(workspace.id, {
      orderQuery: "底座",
    });
    expect(partRecords.map((record) => record.orderId)).toEqual([
      completedOrder.id,
    ]);
  });

  it("replaces existing drawing records and files when uploading again", async () => {
    const workspace = await createWorkspace();
    const storageDir = await mkdtemp(path.join(tmpdir(), "factory-drawings-"));
    drawingStorageDirs.push(storageDir);
    process.env.ORDER_DRAWING_STORAGE_DIR = storageDir;
    const order = await createOrder(workspace.id, {
      customerName: "甲方工厂",
      partName: "法兰盘",
      plannedQuantity: 100,
      unitPriceCents: null,
      dueDate: null,
      notes: "",
    });

    const initial = await replaceOrderDrawings(workspace.id, order.id, [
      createDrawingFile("first", "part-a.step", "model/step"),
      createDrawingFile("second", "part-b.pdf", "application/pdf"),
    ]);

    expect(initial).toHaveLength(2);
    expect(
      await prisma.orderDrawing.count({
        where: { workspaceId: workspace.id, orderId: order.id },
      }),
    ).toBe(2);
    expect(
      await readFile(path.join(storageDir, initial[0].storedPath), "utf8"),
    ).toBe("first");
    await expect(
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
    ).resolves.toMatchObject({ status: "processing_pending" });

    const replacement = await replaceOrderDrawings(workspace.id, order.id, [
      createDrawingFile("replacement", "replacement.pdf", "application/pdf"),
    ]);

    const records = await prisma.orderDrawing.findMany({
      where: { workspaceId: workspace.id, orderId: order.id },
      orderBy: { createdAt: "asc" },
    });
    expect(replacement).toHaveLength(1);
    expect(records).toHaveLength(1);
    expect(records[0].relativePath).toBe("replacement.pdf");
    await expect(
      access(path.join(storageDir, initial[0].storedPath)),
    ).rejects.toThrow();
    expect(
      await readFile(path.join(storageDir, replacement[0].storedPath), "utf8"),
    ).toBe("replacement");
  });

  it("builds a zip archive for a drawing folder prefix", async () => {
    const workspace = await createWorkspace();
    const storageDir = await mkdtemp(path.join(tmpdir(), "factory-drawings-"));
    drawingStorageDirs.push(storageDir);
    process.env.ORDER_DRAWING_STORAGE_DIR = storageDir;
    const order = await createOrder(workspace.id, {
      customerName: "甲方工厂",
      partName: "法兰盘",
      plannedQuantity: 100,
      unitPriceCents: null,
      dueDate: null,
      notes: "",
    });

    await replaceOrderDrawings(workspace.id, order.id, [
      createDrawingFile("step", "fixture/a.step", "model/step"),
      createDrawingFile("pdf", "fixture/docs/a.pdf", "application/pdf"),
      createDrawingFile("other", "other/b.step", "model/step"),
    ]);

    const archive = await getOrderDrawingArchive(
      workspace.id,
      order.id,
      "fixture",
    );
    const archiveText = archive.data.toString("latin1");

    expect(archive.filename).toBe("fixture.zip");
    expect(archive.mimeType).toBe("application/zip");
    expect(archive.data.subarray(0, 2).toString()).toBe("PK");
    expect(archiveText).toContain("fixture/a.step");
    expect(archiveText).toContain("fixture/docs/a.pdf");
    expect(archiveText).not.toContain("other/b.step");
  });

  it("creates split records from one machine entry and recomputes summary after deletion", async () => {
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
      partName: "法兰盘",
      plannedQuantity: 100,
      unitPriceCents: null,
      dueDate: null,
      notes: "",
    });

    await linkMachineToOrder(workspace.id, machine.id, order.id);
    const created = await createProductionRecord(workspace.id, {
      machineId: machine.id,
      recordedAt: new Date("2026-05-10T08:00:00.000Z"),
      completedQuantity: 120,
      shippedQuantity: 80,
      notes: "白班",
    });
    expect(created.records).toHaveLength(2);
    expect(
      created.records.map((record) => ({
        type: record.type,
        quantity: record.quantity,
      })),
    ).toEqual([
      { type: "completed", quantity: 120 },
      { type: "shipped", quantity: 80 },
    ]);

    let summary = await getOrderWithSummary(workspace.id, order.id);
    expect(summary.completedQuantity).toBe(120);
    expect(summary.shippedQuantity).toBe(80);
    expect(summary.isOverPlanned).toBe(true);
    expect(summary.canClose).toBe(false);

    const shippedRecord = created.records.find((record) => record.type === "shipped");
    expect(shippedRecord).toBeDefined();
    await deleteProductionRecord(workspace.id, shippedRecord?.id ?? "");
    summary = await getOrderWithSummary(workspace.id, order.id);
    expect(summary.completedQuantity).toBe(120);
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
      partName: "法兰盘",
      plannedQuantity: 100,
      unitPriceCents: null,
      dueDate: null,
      notes: "",
    });
    const otherOrder = await createOrder(workspace.id, {
      customerName: "乙方工厂",
      partName: "轴套",
      plannedQuantity: 50,
      unitPriceCents: null,
      dueDate: null,
      notes: "",
    });

    await linkMachineToOrder(workspace.id, machine.id, order.id);
    const created = await createProductionRecord(workspace.id, {
      machineId: machine.id,
      recordedAt: new Date("2026-05-10T08:00:00.000Z"),
      completedQuantity: 20,
      shippedQuantity: 0,
      notes: "白班",
    });
    await linkMachineToOrder(workspace.id, machine.id, otherOrder.id);

    const updated = await updateProductionRecord(workspace.id, created.records[0].id, {
      recordedAt: new Date("2026-05-10T09:30:00.000Z"),
      type: "shipped",
      quantity: 40,
      notes: "复核后调整",
    });

    expect(updated.orderId).toBe(order.id);
    expect(updated.machineId).toBe(machine.id);
    expect(updated.type).toBe("shipped");
    expect(updated.quantity).toBe(40);
    expect(updated.notes).toBe("复核后调整");

    const originalSummary = await getOrderWithSummary(workspace.id, order.id);
    expect(originalSummary.completedQuantity).toBe(0);
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
      partName: "法兰盘",
      plannedQuantity: 100,
      unitPriceCents: null,
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

    const secondShipped = second.records.find((record) => record.type === "shipped");
    expect(secondShipped).toBeDefined();
    await deleteProductionRecord(workspace.id, secondShipped?.id ?? "");

    summary = await getOrderWithSummary(workspace.id, order.id);
    expect(summary.completedQuantity).toBe(110);
    expect(summary.shippedQuantity).toBe(20);
    expect(summary.remainingQuantity).toBe(80);
    expect(summary.isOverPlanned).toBe(true);
  });

  it("updates order status manually", async () => {
    const workspace = await createWorkspace();
    const order = await createOrder(workspace.id, {
      customerName: "甲方工厂",
      partName: "轴套",
      plannedQuantity: 100,
      unitPriceCents: null,
      dueDate: null,
      notes: "",
    });

    const completedOrder = await updateOrderStatus(
      workspace.id,
      order.id,
      "completed",
    );
    expect(completedOrder.status).toBe("completed");
    expect(completedOrder.closedAt).not.toBeNull();

    const reopened = await updateOrderStatus(
      workspace.id,
      order.id,
      "in_progress",
    );
    expect(reopened.status).toBe("in_progress");
    expect(reopened.closedAt).toBeNull();
  });

  it("rejects records for a machine linked to a completed order", async () => {
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
      partName: "端盖",
      plannedQuantity: 100,
      unitPriceCents: null,
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
    await updateOrderStatus(workspace.id, order.id, "completed");

    await expect(
      createProductionRecord(workspace.id, {
        machineId: machine.id,
        recordedAt: new Date("2026-05-10T11:00:00.000Z"),
        completedQuantity: 1,
        shippedQuantity: 0,
        notes: "返工",
      }),
    ).rejects.toThrow("订单已完成，不能录入记录");
  });

  it("rejects linking a machine to a completed order", async () => {
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
      partName: "支架",
      plannedQuantity: 100,
      unitPriceCents: null,
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
    await updateOrderStatus(workspace.id, order.id, "completed");

    await expect(
      linkMachineToOrder(workspace.id, targetMachine.id, order.id),
    ).rejects.toThrow("订单已完成，不能关联机器");
  });

  it("rejects linking a missing machine to an order", async () => {
    const workspace = await createWorkspace();
    const order = await createOrder(workspace.id, {
      customerName: "戊方工厂",
      partName: "压板",
      plannedQuantity: 100,
      unitPriceCents: null,
      dueDate: null,
      notes: "",
    });

    await expect(
      linkMachineToOrder(workspace.id, randomUUID(), order.id),
    ).rejects.toThrow("机器不存在");
  });

  it("rejects deleting records from a completed order", async () => {
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
      partName: "支架",
      plannedQuantity: 100,
      unitPriceCents: null,
      dueDate: null,
      notes: "",
    });

    await linkMachineToOrder(workspace.id, machine.id, order.id);
    const created = await createProductionRecord(workspace.id, {
      machineId: machine.id,
      recordedAt: new Date("2026-05-10T12:00:00.000Z"),
      completedQuantity: 100,
      shippedQuantity: 100,
      notes: "完工",
    });
    await updateOrderStatus(workspace.id, order.id, "completed");

    await expect(
      deleteProductionRecord(workspace.id, created.records[0].id),
    ).rejects.toThrow("订单已完成，不能删除记录");

    const summary = await getOrderWithSummary(workspace.id, order.id);
    expect(summary.status).toBe("completed");
    expect(summary.completedQuantity).toBe(100);
    expect(summary.shippedQuantity).toBe(100);
    expect(summary.canClose).toBe(false);
  });

  it("rejects updating records from a completed order", async () => {
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
      partName: "支架",
      plannedQuantity: 100,
      unitPriceCents: null,
      dueDate: null,
      notes: "",
    });

    await linkMachineToOrder(workspace.id, machine.id, order.id);
    const created = await createProductionRecord(workspace.id, {
      machineId: machine.id,
      recordedAt: new Date("2026-05-10T12:00:00.000Z"),
      completedQuantity: 100,
      shippedQuantity: 100,
      notes: "完工",
    });
    await updateOrderStatus(workspace.id, order.id, "completed");

    await expect(
      updateProductionRecord(workspace.id, created.records[0].id, {
        recordedAt: new Date("2026-05-10T13:00:00.000Z"),
        type: "completed",
        quantity: 101,
        notes: "返工",
      }),
    ).rejects.toThrow("订单已完成，不能修改记录");
  });

  it("filters orders by created date range and includes machine info in order detail records", async () => {
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
      partName: "底座",
      plannedQuantity: 10,
      unitPriceCents: null,
      dueDate: new Date("2026-05-10T00:00:00.000Z"),
      notes: "",
    });
    const laterOrder = await createOrder(workspace.id, {
      customerName: "己方工厂",
      partName: "垫片",
      plannedQuantity: 10,
      unitPriceCents: null,
      dueDate: new Date("2026-05-12T00:00:00.000Z"),
      notes: "",
    });
    await prisma.order.update({
      where: { id: dueOrder.id },
      data: { createdAt: new Date("2026-05-10T00:00:00.000Z") },
    });
    await prisma.order.update({
      where: { id: laterOrder.id },
      data: { createdAt: new Date("2026-05-12T00:00:00.000Z") },
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
      createdAtFrom: new Date("2026-05-09T00:00:00.000Z"),
      createdAtTo: new Date("2026-05-11T00:00:00.000Z"),
    });
    expect(filtered.map((order) => order.orderNo)).toEqual([dueOrder.orderNo]);

    const detail = await getOrderWithSummary(workspace.id, dueOrder.id);
    expect(detail.productionRecords[0].machine.code).toBe("5");
    expect(detail.currentMachines[0].code).toBe("5");
  });
});
