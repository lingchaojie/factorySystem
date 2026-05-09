import { MachineStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { lockOrderForUpdate } from "@/server/services/order-locks";

export type CreateMachineInput = {
  code: string;
  name: string;
  model: string;
  location: string;
  status: MachineStatus;
  notes: string;
};

export async function createMachine(
  workspaceId: string,
  input: CreateMachineInput,
) {
  if (!input.code.trim()) throw new Error("机器编号必填");
  if (!input.name.trim()) throw new Error("机器名称必填");

  return prisma.machine.create({
    data: {
      workspaceId,
      code: input.code.trim(),
      name: input.name.trim(),
      model: input.model.trim() || null,
      location: input.location.trim() || null,
      status: input.status,
      notes: input.notes.trim() || null,
    },
  });
}

export async function linkMachineToOrder(
  workspaceId: string,
  machineId: string,
  orderId: string,
) {
  return prisma.$transaction(async (tx) => {
    const order = await lockOrderForUpdate(tx, workspaceId, orderId);
    if (!order) {
      await tx.order.findFirstOrThrow({
        where: { id: orderId, workspaceId },
        select: { id: true },
      });
      throw new Error("订单不存在");
    }
    if (order.status !== "open") {
      throw new Error("订单已结单，不能关联机器");
    }

    const machine = await tx.machine.findFirstOrThrow({
      where: { id: machineId, workspaceId },
      select: { id: true },
    });

    return tx.machine.update({
      where: { id: machine.id },
      data: {
        currentOrder: {
          connect: { workspaceId_id: { workspaceId, id: order.id } },
        },
      },
    });
  });
}

export async function listMachines(
  workspaceId: string,
  filters: {
    status?: MachineStatus;
    query?: string;
  },
) {
  return prisma.machine.findMany({
    where: {
      workspaceId,
      status: filters.status,
      OR: filters.query
        ? [
            { code: { contains: filters.query, mode: "insensitive" } },
            { name: { contains: filters.query, mode: "insensitive" } },
          ]
        : undefined,
    },
    include: { currentOrder: true, productionRecords: true },
    orderBy: { code: "asc" },
  });
}

export async function getMachine(workspaceId: string, machineId: string) {
  return prisma.machine.findFirstOrThrow({
    where: { id: machineId, workspaceId },
    include: {
      currentOrder: true,
      productionRecords: {
        include: { order: true },
        orderBy: { recordedAt: "desc" },
      },
    },
  });
}
