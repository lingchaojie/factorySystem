import { prisma } from "@/lib/db";
import { buildWorkbench } from "@/domain/workbench";

export async function getWorkbench(workspaceId: string, query = "", id = "") {
  // Both queries, including relation reads, are scoped by the authenticated workspace.
  // Aggregate in the database instead of loading every historical production record.
  return prisma.$transaction(async tx => {
    const orders = await tx.order.findMany({ where: { workspaceId, closedAt: null, status: { not: "completed" },
      ...(id ? { id } : query ? { OR: [
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
    return buildWorkbench(orders.map(o => ({ ...o, ...byOrder.get(o.id)!, machines: o.machineAssignments.map(a => a.machine) })));
  }, { isolationLevel: "RepeatableRead" });
}
