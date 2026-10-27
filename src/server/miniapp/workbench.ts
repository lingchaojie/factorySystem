import { prisma } from "@/lib/db";
import { buildWorkbench } from "@/domain/workbench";

export async function getWorkbench(workspaceId: string, query = "", id = "") {
  // Both queries, including relation reads, are scoped by the authenticated workspace.
  // Aggregate in the database instead of loading every historical production record.
  return prisma.$transaction(async tx => {
    // An exact machine code wins over fuzzy order numbers (CNC-01 also occurs in DEMO-CNC-013).
    const machine = !id && query ? await tx.machine.findFirst({ where: { workspaceId, code: { equals: query, mode: "insensitive" } }, select: { id: true, code: true } }) : null;
    const orders = await tx.order.findMany({ where: { workspaceId, closedAt: null, status: { not: "completed" },
      ...(id ? { id } : machine ? { machineAssignments: { some: { workspaceId, machineId: machine.id } } } : query ? { OR: [
        { orderNo: { contains: query, mode: "insensitive" } }, { partName: { contains: query, mode: "insensitive" } },
        { machineAssignments: { some: { workspaceId, machine: { OR: [{ code: { contains: query, mode: "insensitive" } }, { name: { contains: query, mode: "insensitive" } }] } } } },
      ] } : {}) }, select: { id: true, orderNo: true, partName: true, status: true, closedAt: true, plannedQuantity: true,
      dueDate: true, createdAt: true, machineAssignments: { where: { workspaceId }, select: { machine: { select: { id: true, code: true, name: true, status: true } } } } } });
    const totals = orders.length ? await tx.productionRecord.groupBy({ by: ["orderId", "type"],
      where: { workspaceId, orderId: { in: orders.map(o => o.id) } }, _sum: { quantity: true }, _max: { recordedAt: true } }) : [];
    const byOrder = new Map(orders.map(o => [o.id, { completedQuantity: 0, shippedQuantity: 0, lastCompletedAt: null as Date | null }]));
    for (const total of totals) {
      const row = byOrder.get(total.orderId)!;
      if (total.type === "completed") { row.completedQuantity = total._sum.quantity ?? 0; row.lastCompletedAt = total._max.recordedAt; }
      else row.shippedQuantity = total._sum.quantity ?? 0;
    }
    return { ...buildWorkbench(orders.map(o => ({ ...o, ...byOrder.get(o.id)!, machines: o.machineAssignments.map(a => a.machine) }))),
      scope: id ? "指定订单" : machine ? `机器 ${machine.code} 关联的未关闭订单` : query ? `关键词“${query}”匹配的未关闭订单` : "当前登录工厂全部未关闭订单" };
  }, { isolationLevel: "RepeatableRead" });
}
