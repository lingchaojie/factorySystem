import type { OrderStatus, ProductionRecordType } from "@prisma/client";
import { businessDateRange } from "@/lib/business-time";

type QueryParamValue = string | string[] | undefined;

export type RecordSearchParams = {
  from?: QueryParamValue;
  to?: QueryParamValue;
  type?: QueryParamValue;
  orderId?: QueryParamValue;
  orderQuery?: QueryParamValue;
  customerName?: QueryParamValue;
  status?: QueryParamValue;
};

type NormalizedRecordSearchParams = {
  from?: string;
  to?: string;
  type: string[];
  orderId: string[];
  orderQuery?: string;
  customerName?: string;
  status: string[];
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

function queryValues(value: QueryParamValue) {
  return (Array.isArray(value) ? value : [value])
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function uniqueValues<T extends string>(values: string[], allowed: Set<T>) {
  const selected = values.filter((item, index, items) => {
    return allowed.has(item as T) && items.indexOf(item) === index;
  }) as T[];
  return selected.length > 0 ? selected : undefined;
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
    type: queryValues(params.type),
    orderId: queryValues(params.orderId).filter(
      (item, index, items) => items.indexOf(item) === index,
    ),
    orderQuery: firstValue(params.orderQuery),
    customerName: firstValue(params.customerName),
    status: queryValues(params.status),
  };
}

export function parseRecordFilters(params: RecordSearchParams) {
  const values = normalizeRecordSearchParams(params);
  const fromRange = parseDateRange(values.from, "开始日期");
  const toRange = parseDateRange(values.to, "结束日期");
  const recordTypes = uniqueValues(values.type, recordTypeFilters);
  const orderStatuses = uniqueValues(values.status, orderStatusFilters);
  const orderIds = values.orderId.length > 0 ? values.orderId : undefined;

  return {
    values,
    recordType: recordTypes?.[0],
    recordTypes,
    orderId: orderIds?.[0],
    orderIds,
    orderQuery: values.orderQuery?.trim() ?? "",
    customerName: values.customerName?.trim() ?? "",
    orderStatus: orderStatuses?.[0],
    orderStatuses,
    from: fromRange?.start,
    to: toRange?.end,
  };
}
