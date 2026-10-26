import { prisma } from "@/lib/db";
import { businessTodayBounds } from "@/lib/business-time";
import { summarizeOrder } from "@/domain/factory";
import type { LookupInput, LookupResult } from "./agent";

const statuses: Record<string, string> = { active: "运行中", idle: "空闲", maintenance: "维护中", disabled: "停用",
  development_pending: "待开发", processing_pending: "待加工", in_progress: "进行中", completed: "已完成" };
const orderSelect = { id: true, orderNo: true, partName: true, status: true, plannedQuantity: true, closedAt: true,
  productionRecords: { select: { type: true, quantity: true } } } as const;
type Order = { plannedQuantity: number | null; closedAt: Date | null; productionRecords: { type: "completed" | "shipped"; quantity: number }[] };
function progress(order: Order) {
  const summary = summarizeOrder({ ...order, records: order.productionRecords });
  return `计划 ${order.plannedQuantity ?? "未设定"} 件，累计加工 ${summary.completedQuantity} 件，累计出货 ${summary.shippedQuantity} 件，剩余待出货 ${summary.remainingQuantity ?? "无法计算"} 件`;
}

// Queries are always scoped by a server-authenticated workspace, never model/client arguments.
// Deliberately exclude prices, customer identities, free-form notes and user/password rows.
export async function lookupProgress(workspaceId: string, args: LookupInput): Promise<LookupResult> {
  const query = args.query.trim();
  const queriedAt = new Date().toISOString();
  if (args.kind === "order") {
    const orders = await prisma.order.findMany({ where: { workspaceId, ...(args.id ? { id: args.id } : query ? {
      OR: [{ orderNo: { contains: query, mode: "insensitive" } }, { partName: { contains: query, mode: "insensitive" } }],
    } : {}) }, select: orderSelect, orderBy: { createdAt: "desc" }, take: 13 });
    return { queriedAt, hasMore: orders.length > 12, items: orders.slice(0, 12).map(order => ({ kind: "order", id: order.id,
      title: `${order.orderNo} · ${order.partName}`, status: statuses[order.status], summary: progress(order) })) };
  }
  const { start, end } = businessTodayBounds();
  const machines = await prisma.machine.findMany({ where: { workspaceId, ...(args.id ? { id: args.id } : query ? {
    OR: [{ code: { contains: query, mode: "insensitive" } }, { name: { contains: query, mode: "insensitive" } }],
  } : {}) }, take: 13, orderBy: { code: "asc" }, select: { id: true, code: true, name: true, status: true,
    productionRecords: { where: { recordedAt: { gte: start, lt: end } }, select: { type: true, quantity: true } },
    orderAssignments: { where: { order: { workspaceId, status: { not: "completed" } } }, take: 6, select: { order: { select: orderSelect } } },
    _count: { select: { orderAssignments: { where: { order: { workspaceId, status: { not: "completed" } } } } } },
  } });
  return { queriedAt, hasMore: machines.length > 12, items: machines.slice(0, 12).map(machine => ({ kind: "machine", id: machine.id,
    title: `${machine.code} · ${machine.name}`, status: statuses[machine.status],
    summary: `今日加工 ${machine.productionRecords.filter(r => r.type === "completed").reduce((sum, r) => sum + r.quantity, 0)} 件，今日出货 ${machine.productionRecords.filter(r => r.type === "shipped").reduce((sum, r) => sum + r.quantity, 0)} 件。关联未完成订单 ${machine._count.orderAssignments} 个。` +
      machine.orderAssignments.map(a => `${a.order.orderNo}（${a.order.partName}）：${progress(a.order)}`).join("；") +
      (machine._count.orderAssignments > 6 ? "；仅显示前 6 个关联订单，请按订单号继续查询。" : ""),
  })) };
}
