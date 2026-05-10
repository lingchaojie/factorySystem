import type { OrderStatus } from "@prisma/client";

const orderStatusFilters = new Set<OrderStatus>([
  "development_pending",
  "processing_pending",
  "in_progress",
  "completed",
]);

export function parseOrderStatusFilter(
  value: string | undefined,
): OrderStatus | undefined {
  if (!value) return undefined;
  return orderStatusFilters.has(value as OrderStatus)
    ? (value as OrderStatus)
    : undefined;
}
