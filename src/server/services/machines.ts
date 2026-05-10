import { MachineStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  lockMachineForUpdate,
  lockOrderForUpdate,
} from "@/server/services/order-locks";

export type CreateMachineInput = {
  code: string;
  name: string;
  model: string;
  location: string;
  status: MachineStatus;
  notes: string;
};

export type UpdateMachineInput = {
  status: MachineStatus;
  notes: string;
};

export async function createMachine(
  workspaceId: string,
  input: CreateMachineInput,
) {
  if (!input.code.trim()) throw new Error("机器名称必填");
  const machineName = input.name.trim() || input.code.trim();

  try {
    return await prisma.machine.create({
      data: {
        workspaceId,
        code: input.code.trim(),
        name: machineName,
        model: input.model.trim() || null,
        location: input.location.trim() || null,
        status: input.status,
        notes: input.notes.trim() || null,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new Error("机器名称已存在");
    }
    throw error;
  }
}

export async function updateMachine(
  workspaceId: string,
  machineId: string,
  input: UpdateMachineInput,
) {
  return prisma.machine.update({
    where: { workspaceId_id: { workspaceId, id: machineId } },
    data: {
      status: input.status,
      notes: input.notes.trim() || null,
    },
  });
}

export async function deleteMachine(workspaceId: string, machineId: string) {
  const machine = await prisma.machine.findUnique({
    where: { workspaceId_id: { workspaceId, id: machineId } },
    select: {
      id: true,
      _count: { select: { productionRecords: true } },
    },
  });

  if (!machine) throw new Error("机器不存在");
  if (machine._count.productionRecords > 0) {
    throw new Error("已有生产记录，不能删除机器");
  }

  return prisma.machine.delete({
    where: { workspaceId_id: { workspaceId, id: machineId } },
  });
}

export async function linkMachineToOrder(
  workspaceId: string,
  machineId: string,
  orderId: string,
) {
  return prisma.$transaction(async (tx) => {
    const machine = await lockMachineForUpdate(tx, workspaceId, machineId);
    if (!machine) {
      throw new Error("机器不存在");
    }

    const order = await lockOrderForUpdate(tx, workspaceId, orderId);
    if (!order) {
      throw new Error("订单不存在");
    }
    if (order.status === "completed") {
      throw new Error("订单已完成，不能关联机器");
    }

    if (
      order.status === "development_pending" ||
      order.status === "processing_pending"
    ) {
      await tx.order.update({
        where: { id: order.id },
        data: { status: "in_progress", closedAt: null },
      });
    }

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
    statuses?: MachineStatus[];
    query?: string;
  } = {},
) {
  const statuses = filters.statuses?.length
    ? filters.statuses
    : filters.status
      ? [filters.status]
      : undefined;

  return prisma.machine.findMany({
    where: {
      workspaceId,
      status: statuses ? { in: statuses } : undefined,
      OR: filters.query
        ? [
            { code: { equals: filters.query, mode: "insensitive" } },
            { name: { equals: filters.query, mode: "insensitive" } },
          ]
        : undefined,
    },
    include: {
      currentOrder: {
        include: {
          productionRecords: true,
        },
      },
      productionRecords: true,
    },
    orderBy: { code: "asc" },
  });
}

export async function getMachine(workspaceId: string, machineId: string) {
  return prisma.machine.findFirstOrThrow({
    where: { id: machineId, workspaceId },
    include: {
      currentOrder: {
        include: {
          productionRecords: true,
        },
      },
      productionRecords: {
        include: {
          order: true,
          createdByUser: true,
          updatedByUser: true,
        },
        orderBy: { recordedAt: "desc" },
      },
    },
  });
}
