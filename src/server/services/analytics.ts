import type { OrderStatus } from "@prisma/client";
import { summarizeOrder } from "@/domain/factory";
import { prisma } from "@/lib/db";

export type AnalyticsFilters = {
  from: Date;
  to: Date;
};

export type DailyAnalytics = {
  date: string;
  revenueCents: number;
  completedQuantity: number;
  shippedQuantity: number;
};

export type CustomerRevenue = {
  customerName: string;
  revenueCents: number;
  shippedQuantity: number;
};

export type OrderStatusCount = {
  status: OrderStatus;
  count: number;
};

function businessDateCode(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function emptyDaily(date: string): DailyAnalytics {
  return {
    date,
    revenueCents: 0,
    completedQuantity: 0,
    shippedQuantity: 0,
  };
}

export async function getWorkspaceAnalytics(
  workspaceId: string,
  filters: AnalyticsFilters,
) {
  const [records, orders] = await Promise.all([
    prisma.productionRecord.findMany({
      where: {
        workspaceId,
        recordedAt: {
          gte: filters.from,
          lt: filters.to,
        },
      },
      include: { order: true },
      orderBy: { recordedAt: "asc" },
    }),
    prisma.order.findMany({
      where: { workspaceId },
      include: { productionRecords: true },
    }),
  ]);

  let revenueCents = 0;
  let completedQuantity = 0;
  let shippedQuantity = 0;
  let unpricedShippedQuantity = 0;
  const daily = new Map<string, DailyAnalytics>();
  const customerRevenue = new Map<string, CustomerRevenue>();

  for (const record of records) {
    const date = businessDateCode(record.recordedAt);
    const dailyRow = daily.get(date) ?? emptyDaily(date);
    daily.set(date, dailyRow);

    if (record.type === "completed") {
      completedQuantity += record.quantity;
      dailyRow.completedQuantity += record.quantity;
      continue;
    }

    shippedQuantity += record.quantity;
    dailyRow.shippedQuantity += record.quantity;

    if (record.order.unitPriceCents === null) {
      unpricedShippedQuantity += record.quantity;
      continue;
    }

    const recordRevenue = record.quantity * record.order.unitPriceCents;
    revenueCents += recordRevenue;
    dailyRow.revenueCents += recordRevenue;

    const existing = customerRevenue.get(record.order.customerName) ?? {
      customerName: record.order.customerName,
      revenueCents: 0,
      shippedQuantity: 0,
    };
    existing.revenueCents += recordRevenue;
    existing.shippedQuantity += record.quantity;
    customerRevenue.set(record.order.customerName, existing);
  }

  const statusCounts = new Map<OrderStatus, number>();
  const overPlannedOrders = [];
  const completedOrders = [];
  for (const order of orders) {
    statusCounts.set(order.status, (statusCounts.get(order.status) ?? 0) + 1);
    const summary = summarizeOrder({
      plannedQuantity: order.plannedQuantity,
      closedAt: order.closedAt,
      records: order.productionRecords.map((record) => ({
        type: record.type,
        quantity: record.quantity,
      })),
    });
    if (summary.isOverPlanned) overPlannedOrders.push({ ...order, ...summary });
    if (order.status === "completed") completedOrders.push({ ...order, ...summary });
  }

  return {
    revenueCents,
    completedQuantity,
    shippedQuantity,
    unpricedShippedQuantity,
    dailySeries: Array.from(daily.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
    customerRevenue: Array.from(customerRevenue.values()).sort(
      (a, b) => b.revenueCents - a.revenueCents,
    ),
    orderStatusDistribution: Array.from(statusCounts.entries()).map(
      ([status, count]) => ({ status, count }),
    ),
    overPlannedOrders,
    completedOrders: completedOrders
      .sort((a, b) => (b.closedAt?.getTime() ?? 0) - (a.closedAt?.getTime() ?? 0))
      .slice(0, 8),
  };
}
