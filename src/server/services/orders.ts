import { OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parsePositiveQuantity, summarizeOrder } from "@/domain/factory";
import { lockOrderForUpdate } from "@/server/services/order-locks";

export type CreateOrderInput = {
  customerName: string;
  orderNo: string;
  partName: string;
  plannedQuantity: number;
  dueDate: Date | null;
  notes: string;
};

export async function createOrder(workspaceId: string, input: CreateOrderInput) {
  if (!input.customerName.trim()) throw new Error("客户名称必填");
  if (!input.partName.trim()) throw new Error("工件名称必填");
  parsePositiveQuantity(String(input.plannedQuantity), "计划数量");

  return prisma.order.create({
    data: {
      workspaceId,
      customerName: input.customerName.trim(),
      orderNo: input.orderNo.trim() || null,
      partName: input.partName.trim(),
      plannedQuantity: input.plannedQuantity,
      dueDate: input.dueDate,
      notes: input.notes.trim() || null,
    },
  });
}

export async function getOrderWithSummary(workspaceId: string, orderId: string) {
  const order = await prisma.order.findFirstOrThrow({
    where: { id: orderId, workspaceId },
    include: { productionRecords: true, currentMachines: true },
  });
  const summary = summarizeOrder({
    plannedQuantity: order.plannedQuantity,
    closedAt: order.closedAt,
    records: order.productionRecords.map((record) => ({
      completedQuantity: record.completedQuantity,
      shippedQuantity: record.shippedQuantity,
    })),
  });
  return { ...order, ...summary };
}

export async function listOrders(
  workspaceId: string,
  filters: {
    customerName?: string;
    status?: OrderStatus;
    query?: string;
  },
) {
  const orders = await prisma.order.findMany({
    where: {
      workspaceId,
      status: filters.status,
      customerName: filters.customerName
        ? { contains: filters.customerName, mode: "insensitive" }
        : undefined,
      OR: filters.query
        ? [
            { orderNo: { contains: filters.query, mode: "insensitive" } },
            { partName: { contains: filters.query, mode: "insensitive" } },
          ]
        : undefined,
    },
    include: { productionRecords: true },
    orderBy: { createdAt: "desc" },
  });

  return orders.map((order) => ({
    ...order,
    ...summarizeOrder({
      plannedQuantity: order.plannedQuantity,
      closedAt: order.closedAt,
      records: order.productionRecords.map((record) => ({
        completedQuantity: record.completedQuantity,
        shippedQuantity: record.shippedQuantity,
      })),
    }),
  }));
}

export async function closeOrder(workspaceId: string, orderId: string) {
  return prisma.$transaction(async (tx) => {
    const order = await lockOrderForUpdate(tx, workspaceId, orderId);
    if (!order) {
      await tx.order.findFirstOrThrow({
        where: { id: orderId, workspaceId },
        select: { id: true },
      });
      throw new Error("订单不存在");
    }
    if (order.status === "closed") {
      throw new Error("订单已结单");
    }

    const productionRecords = await tx.productionRecord.findMany({
      where: { orderId: order.id, workspaceId },
      select: { completedQuantity: true, shippedQuantity: true },
    });
    const summary = summarizeOrder({
      plannedQuantity: order.plannedQuantity,
      closedAt: order.closedAt,
      records: productionRecords.map((record) => ({
        completedQuantity: record.completedQuantity,
        shippedQuantity: record.shippedQuantity,
      })),
    });
    if (!summary.canClose) {
      throw new Error("订单出货数量未达到计划数量，不能结单");
    }

    return tx.order.update({
      where: { id: order.id },
      data: { status: "closed", closedAt: new Date() },
    });
  });
}

export async function reopenOrder(workspaceId: string, orderId: string) {
  const order = await prisma.order.findFirstOrThrow({
    where: { id: orderId, workspaceId },
    select: { id: true },
  });

  return prisma.order.update({
    where: { id: order.id },
    data: { status: "open", closedAt: null },
  });
}
