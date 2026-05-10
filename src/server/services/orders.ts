import { OrderStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parsePositiveQuantity, summarizeOrder } from "@/domain/factory";
import {
  lockMachineForUpdate,
  lockOrderForUpdate,
} from "@/server/services/order-locks";
import { deleteOrderDrawingDirectory } from "@/server/services/order-drawings";

export type CreateOrderInput = {
  actorUserId?: string;
  customerName: string;
  partName: string;
  plannedQuantity: number | null;
  unitPriceCents: number | null;
  dueDate: Date | null;
  notes: string;
  machineIds?: string[];
};

export type UpdateOrderDetailsInput = CreateOrderInput & {
  status: OrderStatus;
};

const orderStatuses = new Set<OrderStatus>([
  "development_pending",
  "processing_pending",
  "in_progress",
  "completed",
]);

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

function normalizeMachineIds(machineIds: string[] | undefined) {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const machineId of machineIds ?? []) {
    const value = machineId.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

async function linkMachinesToCreatedOrder(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  orderId: string,
  machineIds: string[],
) {
  for (const machineId of machineIds) {
    const machine = await lockMachineForUpdate(tx, workspaceId, machineId);
    if (!machine) {
      throw new Error("机器不存在");
    }

    if (machine.currentOrderId) {
      const currentOrder = await lockOrderForUpdate(
        tx,
        workspaceId,
        machine.currentOrderId,
      );

      if (!currentOrder || currentOrder.status !== "completed") {
        throw new Error("机器正在加工其他订单，不能关联");
      }
    }

    await tx.machine.update({
      where: { workspaceId_id: { workspaceId, id: machine.id } },
      data: {
        currentOrder: {
          connect: { workspaceId_id: { workspaceId, id: orderId } },
        },
      },
    });
  }
}

export async function createOrder(workspaceId: string, input: CreateOrderInput) {
  if (!input.customerName.trim()) throw new Error("客户名称必填");
  if (!input.partName.trim()) throw new Error("工件名称必填");
  if (input.plannedQuantity !== null) {
    parsePositiveQuantity(String(input.plannedQuantity), "计划数量");
  }

  const prefix = `ORD-${getOrderDateCode()}-`;
  let sequence = await getNextOrderSequence(workspaceId, prefix);
  const machineIds = normalizeMachineIds(input.machineIds);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            workspaceId,
            createdByUserId: input.actorUserId,
            updatedByUserId: input.actorUserId,
            customerName: input.customerName.trim(),
            orderNo: formatOrderNo(prefix, sequence),
            partName: input.partName.trim(),
            plannedQuantity: input.plannedQuantity,
            unitPriceCents: input.unitPriceCents,
            dueDate: input.dueDate,
            notes: input.notes.trim() || null,
          },
        });

        if (machineIds.length === 0) {
          return order;
        }

        await linkMachinesToCreatedOrder(tx, workspaceId, order.id, machineIds);
        return tx.order.update({
          where: { id: order.id },
          data: { status: "in_progress", closedAt: null },
        });
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
      createdByUser: true,
      updatedByUser: true,
      drawings: { orderBy: { createdAt: "desc" } },
      productionRecords: {
        include: {
          machine: true,
          createdByUser: true,
          updatedByUser: true,
        },
        orderBy: { recordedAt: "desc" },
      },
    },
  });
  const summary = summarizeOrder({
    plannedQuantity: order.plannedQuantity,
    closedAt: order.closedAt,
    records: order.productionRecords.map((record) => ({
      type: record.type,
      quantity: record.quantity,
    })),
  });
  return { ...order, ...summary };
}

export async function listOrders(
  workspaceId: string,
  filters: {
    customerName?: string;
    status?: OrderStatus;
    statuses?: OrderStatus[];
    query?: string;
    createdAtFrom?: Date;
    createdAtTo?: Date;
    dueDateFrom?: Date;
    dueDateTo?: Date;
  },
) {
  const statuses = filters.statuses?.length
    ? filters.statuses
    : filters.status
      ? [filters.status]
      : undefined;
  const queryFilter = buildOrderNameQueryFilter(filters.query);

  const orders = await prisma.order.findMany({
    where: {
      workspaceId,
      ...queryFilter,
      status: statuses ? { in: statuses } : undefined,
      customerName: filters.customerName
        ? { contains: filters.customerName, mode: "insensitive" }
        : undefined,
      createdAt:
        filters.createdAtFrom || filters.createdAtTo
          ? {
              gte: filters.createdAtFrom,
              lt: filters.createdAtTo,
            }
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
        type: record.type,
        quantity: record.quantity,
      })),
    }),
  }));
}

function buildOrderNameQueryFilter(
  query: string | undefined,
): Prisma.OrderWhereInput | undefined {
  const value = query?.trim();
  if (!value) return undefined;

  const [customerName, ...partNameParts] = value.split("/");
  const partName = partNameParts.join("/").trim();
  const customer = customerName.trim();

  if (customer && partName) {
    return {
      AND: [
        { customerName: { contains: customer, mode: "insensitive" } },
        { partName: { contains: partName, mode: "insensitive" } },
      ],
    };
  }

  return {
    OR: [
      { customerName: { contains: value, mode: "insensitive" } },
      { partName: { contains: value, mode: "insensitive" } },
    ],
  };
}

export async function updateOrderStatus(
  workspaceId: string,
  orderId: string,
  status: OrderStatus,
  actorUserId?: string,
) {
  if (!orderStatuses.has(status)) {
    throw new Error("订单状态无效");
  }
  const order = await prisma.order.findFirstOrThrow({
    where: { id: orderId, workspaceId },
    select: { id: true },
  });

  return prisma.order.update({
    where: { id: order.id },
    data: {
      status,
      updatedByUserId: actorUserId,
      closedAt: status === "completed" ? new Date() : null,
    },
  });
}

export async function updateOrderDetails(
  workspaceId: string,
  orderId: string,
  input: UpdateOrderDetailsInput,
) {
  if (!input.customerName.trim()) throw new Error("客户名称必填");
  if (!input.partName.trim()) throw new Error("工件名称必填");
  if (input.plannedQuantity !== null) {
    parsePositiveQuantity(String(input.plannedQuantity), "计划数量");
  }
  if (!orderStatuses.has(input.status)) {
    throw new Error("订单状态无效");
  }

  const order = await prisma.order.findFirstOrThrow({
    where: { id: orderId, workspaceId },
    select: { id: true, closedAt: true },
  });

  return prisma.order.update({
    where: { id: order.id },
    data: {
      customerName: input.customerName.trim(),
      partName: input.partName.trim(),
      plannedQuantity: input.plannedQuantity,
      unitPriceCents: input.unitPriceCents,
      dueDate: input.dueDate,
      status: input.status,
      notes: input.notes.trim() || null,
      updatedByUserId: input.actorUserId,
      closedAt:
        input.status === "completed" ? (order.closedAt ?? new Date()) : null,
    },
  });
}

export async function deleteOrder(workspaceId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, workspaceId },
    select: {
      id: true,
      _count: {
        select: {
          currentMachines: true,
          productionRecords: true,
        },
      },
    },
  });

  if (!order) throw new Error("订单不存在");
  if (order._count.currentMachines > 0) {
    throw new Error("订单仍有关联机器，不能删除");
  }
  if (order._count.productionRecords > 0) {
    throw new Error("已有生产记录，不能删除订单");
  }

  await prisma.order.delete({
    where: { id: order.id },
  });
  await deleteOrderDrawingDirectory(workspaceId, order.id);
}
