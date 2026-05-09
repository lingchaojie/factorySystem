import { prisma } from "@/lib/db";
import { validateProductionRecordInput } from "@/domain/factory";

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

  const machine = await prisma.machine.findFirstOrThrow({
    where: { id: input.machineId, workspaceId },
    include: { currentOrder: true },
  });
  if (!machine.currentOrderId) {
    throw new Error("机器未关联订单，不能录入记录");
  }
  if (machine.currentOrder?.status !== "open") {
    throw new Error("订单已结单，不能录入记录");
  }

  return prisma.productionRecord.create({
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
}

export async function deleteProductionRecord(
  workspaceId: string,
  recordId: string,
) {
  const record = await prisma.productionRecord.findFirstOrThrow({
    where: { id: recordId, workspaceId },
    select: { id: true },
  });

  return prisma.productionRecord.delete({
    where: { id: record.id },
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
