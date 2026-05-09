import type { OrderStatus } from "@prisma/client";

const orderStatusFilters = new Set<OrderStatus>(["open", "closed"]);

export function parseOrderStatusFilter(
  value: string | undefined,
): OrderStatus | undefined {
  if (!value) return undefined;
  return orderStatusFilters.has(value as OrderStatus)
    ? (value as OrderStatus)
    : undefined;
}
