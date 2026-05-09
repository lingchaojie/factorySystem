import { OrderStatus, Prisma } from "@prisma/client";

export type LockedOrder = {
  id: string;
  status: OrderStatus;
  plannedQuantity: number;
  closedAt: Date | null;
};

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
