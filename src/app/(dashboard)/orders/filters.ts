import type { OrderStatus } from "@prisma/client";

type QueryParamValue = string | string[] | undefined;

const orderStatusFilters = new Set<OrderStatus>([
  "development_pending",
  "processing_pending",
  "in_progress",
  "completed",
]);

function queryValues(value: QueryParamValue) {
  return (Array.isArray(value) ? value : [value])
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseOrderStatusFilters(
  value: QueryParamValue,
): OrderStatus[] | undefined {
  const statuses = queryValues(value).filter((item, index, items) => {
    return (
      orderStatusFilters.has(item as OrderStatus) &&
      items.indexOf(item) === index
    );
  }) as OrderStatus[];
  return statuses.length > 0 ? statuses : undefined;
}

export function parseOrderStatusFilter(
  value: QueryParamValue,
): OrderStatus | undefined {
  return parseOrderStatusFilters(value)?.[0];
}
