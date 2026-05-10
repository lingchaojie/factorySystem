import { OrderStatus, ProductionRecordType } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  validateMachineRecordInput,
  validateProductionRecordInput,
} from "@/domain/factory";
import {
  lockMachineForUpdate,
  lockOrderForUpdate,
} from "@/server/services/order-locks";

export type CreateProductionRecordInput = {
  machineId: string;
  recordedAt: Date;
  completedQuantity: number;
  shippedQuantity: number;
  notes: string;
  actorUserId?: string;
};

export type UpdateProductionRecordInput = {
  recordedAt: Date;
  type: ProductionRecordType;
  quantity: number;
  notes: string;
  actorUserId?: string;
};

function validateRecordMutationInput(input: UpdateProductionRecordInput) {
  if (Number.isNaN(input.recordedAt.getTime())) {
    throw new Error("记录时间无效");
  }
  validateProductionRecordInput(input);
}

function validateMachineRecordMutationInput(input: CreateProductionRecordInput) {
  if (Number.isNaN(input.recordedAt.getTime())) {
    throw new Error("记录时间无效");
  }
  validateMachineRecordInput(input);
}

export async function createProductionRecord(
  workspaceId: string,
  input: CreateProductionRecordInput,
) {
  validateMachineRecordMutationInput(input);

  return prisma.$transaction(async (tx) => {
    const machine = await lockMachineForUpdate(tx, workspaceId, input.machineId);
    if (!machine) {
      throw new Error("机器不存在");
    }
    if (!machine.currentOrderId) {
      throw new Error("机器未关联订单，不能录入记录");
    }

    const order = await lockOrderForUpdate(
      tx,
      workspaceId,
      machine.currentOrderId,
    );
    if (!order) {
      throw new Error("订单不存在");
    }
    if (order.status === "completed") {
      throw new Error("订单已完成，不能录入记录");
    }

    const rows: Array<{ type: ProductionRecordType; quantity: number }> = [];
    if (input.completedQuantity > 0) {
      rows.push({ type: "completed", quantity: input.completedQuantity });
    }
    if (input.shippedQuantity > 0) {
      rows.push({ type: "shipped", quantity: input.shippedQuantity });
    }

    const records = [];
    for (const row of rows) {
      records.push(
        await tx.productionRecord.create({
          data: {
            workspace: { connect: { id: workspaceId } },
            machine: {
              connect: { workspaceId_id: { workspaceId, id: machine.id } },
            },
            order: {
              connect: {
                workspaceId_id: { workspaceId, id: machine.currentOrderId },
              },
            },
            recordedAt: input.recordedAt,
            type: row.type,
            quantity: row.quantity,
            notes: input.notes.trim() || null,
            createdByUser: input.actorUserId
              ? { connect: { id: input.actorUserId } }
              : undefined,
            updatedByUser: input.actorUserId
              ? { connect: { id: input.actorUserId } }
              : undefined,
          },
        }),
      );
    }

    return { machineId: machine.id, orderId: machine.currentOrderId, records };
  });
}

export async function updateProductionRecord(
  workspaceId: string,
  recordId: string,
  input: UpdateProductionRecordInput,
) {
  validateRecordMutationInput(input);

  return prisma.$transaction(async (tx) => {
    const record = await tx.productionRecord.findFirstOrThrow({
      where: { id: recordId, workspaceId },
      select: { id: true, machineId: true, orderId: true },
    });

    const order = await lockOrderForUpdate(tx, workspaceId, record.orderId);
    if (order?.status === "completed") {
      throw new Error("订单已完成，不能修改记录");
    }

    return tx.productionRecord.update({
      where: { id: record.id },
      data: {
        recordedAt: input.recordedAt,
        type: input.type,
        quantity: input.quantity,
        notes: input.notes.trim() || null,
        updatedByUser: input.actorUserId
          ? { connect: { id: input.actorUserId } }
          : undefined,
      },
    });
  });
}

export async function deleteProductionRecord(
  workspaceId: string,
  recordId: string,
) {
  return prisma.$transaction(async (tx) => {
    const record = await tx.productionRecord.findFirstOrThrow({
      where: { id: recordId, workspaceId },
      select: { id: true, orderId: true },
    });

    const order = await lockOrderForUpdate(tx, workspaceId, record.orderId);
    if (order?.status === "completed") {
      throw new Error("订单已完成，不能删除记录");
    }

    return tx.productionRecord.delete({
      where: { id: record.id },
    });
  });
}

export async function listProductionRecords(
  workspaceId: string,
  filters: {
    type?: ProductionRecordType;
    types?: ProductionRecordType[];
    orderId?: string;
    orderIds?: string[];
    customerName?: string;
    orderStatus?: OrderStatus;
    orderStatuses?: OrderStatus[];
    from?: Date;
    to?: Date;
  },
) {
  const types = filters.types?.length
    ? filters.types
    : filters.type
      ? [filters.type]
      : undefined;
  const orderIds = filters.orderIds?.length
    ? filters.orderIds
    : filters.orderId
      ? [filters.orderId]
      : undefined;
  const orderStatuses = filters.orderStatuses?.length
    ? filters.orderStatuses
    : filters.orderStatus
      ? [filters.orderStatus]
      : undefined;

  return prisma.productionRecord.findMany({
    where: {
      workspaceId,
      type: types ? { in: types } : undefined,
      orderId: orderIds ? { in: orderIds } : undefined,
      order:
        filters.customerName || orderStatuses
          ? {
              customerName: filters.customerName
                ? { contains: filters.customerName, mode: "insensitive" }
                : undefined,
              status: orderStatuses ? { in: orderStatuses } : undefined,
            }
          : undefined,
      recordedAt: {
        gte: filters.from,
        lt: filters.to,
      },
    },
    include: {
      machine: true,
      order: true,
      createdByUser: true,
      updatedByUser: true,
    },
    orderBy: { recordedAt: "desc" },
  });
}
