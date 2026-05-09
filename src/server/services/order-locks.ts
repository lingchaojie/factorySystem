import { OrderStatus, Prisma } from "@prisma/client";

export type LockedOrder = {
  id: string;
  status: OrderStatus;
  plannedQuantity: number;
  closedAt: Date | null;
};

export type LockedMachine = {
  id: string;
  currentOrderId: string | null;
};

export async function lockMachineForUpdate(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  machineId: string,
) {
  const machines = await tx.$queryRaw<LockedMachine[]>`
    SELECT "id", "currentOrderId"
    FROM "Machine"
    WHERE "workspaceId" = ${workspaceId}
      AND "id" = ${machineId}
    FOR UPDATE
  `;

  return machines[0] ?? null;
}

export async function lockOrderForUpdate(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  orderId: string,
) {
  const orders = await tx.$queryRaw<LockedOrder[]>`
    SELECT "id", "status", "plannedQuantity", "closedAt"
    FROM "Order"
    WHERE "workspaceId" = ${workspaceId}
      AND "id" = ${orderId}
    FOR UPDATE
  `;

  return orders[0] ?? null;
}
