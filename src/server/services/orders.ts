import { OrderStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parsePositiveQuantity, summarizeOrder } from "@/domain/factory";
import { lockOrderForUpdate } from "@/server/services/order-locks";

export type CreateOrderInput = {
  customerName: string;
  partName: string;
  plannedQuantity: number;
  unitPriceCents: number | null;
  dueDate: Date | null;
  notes: string;
};

function getOrderDateCode(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}${values.month}${values.day}`;
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

async function getNextOrderSequence(workspaceId: string, prefix: string) {
  const lastOrder = await prisma.order.findFirst({
    where: {
      workspaceId,
      orderNo: { startsWith: prefix },
    },
    orderBy: { orderNo: "desc" },
    select: { orderNo: true },
  });

  const lastSequence = lastOrder?.orderNo.slice(prefix.length);
  const next = lastSequence && /^\d+$/.test(lastSequence)
    ? Number(lastSequence) + 1
    : 1;
  return next;
}

function formatOrderNo(prefix: string, sequence: number) {
  return `${prefix}${String(sequence).padStart(4, "0")}`;
}

export async function createOrder(workspaceId: string, input: CreateOrderInput) {
  if (!input.customerName.trim()) throw new Error("客户名称必填");
  if (!input.partName.trim()) throw new Error("工件名称必填");
  parsePositiveQuantity(String(input.plannedQuantity), "计划数量");

  const prefix = `ORD-${getOrderDateCode()}-`;
  let sequence = await getNextOrderSequence(workspaceId, prefix);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prisma.order.create({
        data: {
          workspaceId,
          customerName: input.customerName.trim(),
          orderNo: formatOrderNo(prefix, sequence),
          partName: input.partName.trim(),
          plannedQuantity: input.plannedQuantity,
          unitPriceCents: input.unitPriceCents,
          dueDate: input.dueDate,
          notes: input.notes.trim() || null,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      sequence += 1;
    }
  }

  throw new Error("订单号生成失败，请重试");
}

export async function getOrderWithSummary(workspaceId: string, orderId: string) {
  const order = await prisma.order.findFirstOrThrow({
    where: { id: orderId, workspaceId },
    include: {
      currentMachines: true,
      drawings: { orderBy: { createdAt: "desc" } },
      productionRecords: {
        include: { machine: true },
        orderBy: { recordedAt: "desc" },
      },
    },
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
    dueDateFrom?: Date;
    dueDateTo?: Date;
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
      dueDate:
        filters.dueDateFrom || filters.dueDateTo
          ? {
              gte: filters.dueDateFrom,
              lt: filters.dueDateTo,
            }
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
