import { prisma } from "@/lib/db";
import { validateProductionRecordInput } from "@/domain/factory";
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
};

export async function createProductionRecord(
  workspaceId: string,
  input: CreateProductionRecordInput,
) {
  validateProductionRecordInput(input);

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
    if (order.status !== "open") {
      throw new Error("订单已结单，不能录入记录");
    }

    return tx.productionRecord.create({
      data: {
        workspace: { connect: { id: workspaceId } },
        machine: {
          connect: { workspaceId_id: { workspaceId, id: machine.id } },
        },
        order: {
          connect: { workspaceId_id: { workspaceId, id: machine.currentOrderId } },
        },
        recordedAt: input.recordedAt,
        completedQuantity: input.completedQuantity,
        shippedQuantity: input.shippedQuantity,
        notes: input.notes.trim() || null,
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
    if (order?.status !== "open") {
      throw new Error("订单已结单，不能删除记录");
    }

    return tx.productionRecord.delete({
      where: { id: record.id },
    });
  });
}

export async function listProductionRecords(
  workspaceId: string,
  filters: {
    machineId?: string;
    orderId?: string;
    from?: Date;
    to?: Date;
  },
) {
  return prisma.productionRecord.findMany({
    where: {
      workspaceId,
      machineId: filters.machineId,
      orderId: filters.orderId,
      recordedAt: {
        gte: filters.from,
        lte: filters.to,
      },
    },
    include: {
      machine: true,
      order: true,
    },
    orderBy: { recordedAt: "desc" },
  });
}
