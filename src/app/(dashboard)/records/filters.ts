import type { OrderStatus, ProductionRecordType } from "@prisma/client";
import { businessDateRange } from "@/lib/business-time";

type QueryParamValue = string | string[] | undefined;

export type RecordSearchParams = {
  from?: QueryParamValue;
  to?: QueryParamValue;
  type?: QueryParamValue;
  orderId?: QueryParamValue;
  customerName?: QueryParamValue;
  status?: QueryParamValue;
};

type NormalizedRecordSearchParams = {
  from?: string;
  to?: string;
  type?: string;
  orderId?: string;
  customerName?: string;
  status?: string;
};

const orderStatusFilters = new Set<OrderStatus>([
  "development_pending",
  "processing_pending",
  "in_progress",
  "completed",
]);

const recordTypeFilters = new Set<ProductionRecordType>([
  "completed",
  "shipped",
]);

function firstValue(value: QueryParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

function parseOrderStatus(value: string | undefined): OrderStatus | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return orderStatusFilters.has(trimmed as OrderStatus)
    ? (trimmed as OrderStatus)
    : undefined;
}

function parseRecordType(
  value: string | undefined,
): ProductionRecordType | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return recordTypeFilters.has(trimmed as ProductionRecordType)
    ? (trimmed as ProductionRecordType)
    : undefined;
}

function parseDateRange(value: string | undefined, label: string) {
  if (!value) return undefined;
  const range = businessDateRange(value);
  if (Number.isNaN(range.start.getTime())) {
    throw new Error(`${label}无效`);
  }
  return range;
}

export function normalizeRecordSearchParams(
  params: RecordSearchParams,
): NormalizedRecordSearchParams {
  return {
    from: firstValue(params.from),
    to: firstValue(params.to),
    type: firstValue(params.type),
    orderId: firstValue(params.orderId),
    customerName: firstValue(params.customerName),
    status: firstValue(params.status),
  };
}

export function parseRecordFilters(params: RecordSearchParams) {
  const values = normalizeRecordSearchParams(params);
  const fromRange = parseDateRange(values.from, "开始日期");
  const toRange = parseDateRange(values.to, "结束日期");

  return {
    values,
    recordType: parseRecordType(values.type),
    orderId: values.orderId?.trim() || undefined,
    customerName: values.customerName?.trim() ?? "",
    orderStatus: parseOrderStatus(values.status),
    from: fromRange?.start,
    to: toRange?.end,
  };
}
