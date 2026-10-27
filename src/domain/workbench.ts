import { businessTodayBounds } from "@/lib/business-time";

const DAY = 86_400_000;
export type WorkbenchOrder = {
  id: string; orderNo: string; partName: string; status: string; closedAt: Date | null;
  plannedQuantity: number | null; dueDate: Date | null; createdAt: Date;
  completedQuantity: number; shippedQuantity: number; lastCompletedAt: Date | null;
  machines: { id: string; code: string; name: string; status: string }[];
};
export type WorkbenchView = "risks" | "todos" | "shipments";
export function buildWorkbench(orders: WorkbenchOrder[], now = new Date()) {
  const { start } = businessTodayBounds(now);
  const dateLabel = (date: Date) => new Date(date.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
  const rows = orders.filter(o => o.status !== "completed" && !o.closedAt).map(order => {
    const { completedQuantity, shippedQuantity, plannedQuantity } = order;
    const remainingQuantity = plannedQuantity === null ? null : Math.max(plannedQuantity - shippedQuantity, 0);
    const remainingProcessing = plannedQuantity === null ? null : Math.max(plannedQuantity - completedQuantity, 0);
    const anomaly = shippedQuantity > completedQuantity || (plannedQuantity !== null && (completedQuantity > plannedQuantity || shippedQuantity > plannedQuantity));
    // A quantity mismatch needs reconciliation before suggesting a shipment quantity.
    const readyQuantity = anomaly ? 0 : Math.max(completedQuantity - shippedQuantity, 0);
    const outstanding = remainingQuantity === null || remainingQuantity > 0;
    const dueInDays = order.dueDate ? Math.round((businessTodayBounds(order.dueDate).start.getTime() - start.getTime()) / DAY) : null;
    const overdue = outstanding && dueInDays !== null && dueInDays < 0;
    const dueSoon = outstanding && dueInDays !== null && dueInDays >= 0 && dueInDays <= 3;
    const staleDays = Math.floor((start.getTime() - businessTodayBounds(order.lastCompletedAt ?? order.createdAt).start.getTime()) / DAY);
    const stalled = order.status === "in_progress" && (remainingProcessing === null || remainingProcessing > 0) && staleDays >= 3;
    const affectedMachines = order.machines.filter(m => m.status === "maintenance" || m.status === "disabled");
    const machineConcern = (remainingProcessing === null || remainingProcessing > 0) && affectedMachines.length > 0;
    const reasons: string[] = [];
    const actions: string[] = [];
    if (anomaly) { reasons.push("加工、出货或计划数量异常"); actions.push("先核对生产记录与计划数量"); }
    if (overdue) { reasons.push(`交期已过 ${-dueInDays!} 天`); actions.push("确认交付安排并优先跟进"); }
    if (dueSoon) { reasons.push(dueInDays === 0 ? "今天到期" : `${dueInDays} 天后到期`); actions.push("核对剩余加工与出货安排"); }
    if (machineConcern) { reasons.push(`关联维护/停用机器：${affectedMachines.map(m => m.code).join("、")}`); actions.push("核实设备影响，必要时在网站调整排机"); }
    if (stalled) { reasons.push(`${staleDays} 天未报工${order.lastCompletedAt ? "" : "（尚无报工）"}`); actions.push("确认现场进度并补录实际加工"); }
    if (order.status === "development_pending" || order.status === "processing_pending") { reasons.push(order.status === "development_pending" ? "待开发" : "待加工"); actions.push("在网站确认开发或排产安排"); }
    if (outstanding && !order.dueDate) { reasons.push("尚未设置交期"); actions.push("在网站补充交期"); }
    if (plannedQuantity === null) { reasons.push("尚未设置计划数量"); actions.push("在网站补充计划数量"); }
    if (readyQuantity > 0) { reasons.push(`已加工未出货 ${readyQuantity} 件`); actions.push("核对实物、质检与出货条件后录入出货"); }
    if (remainingQuantity === 0) { reasons.push("已按计划出货，待关闭订单"); actions.push("在网站核对并关闭订单"); }
    const risk = overdue || dueSoon || stalled || machineConcern || anomaly;
    const priority = anomaly ? 0 : overdue ? 1 : dueSoon ? 2 : machineConcern ? 3 : stalled ? 4 : readyQuantity > 0 ? 5 : 6;
    return { id: order.id, orderNo: order.orderNo, partName: order.partName, status: order.status,
      plannedQuantity, completedQuantity, shippedQuantity, remainingQuantity, remainingProcessing, readyQuantity,
      dueDate: order.dueDate ? dateLabel(order.dueDate) : null, dueInDays,
      lastCompletedDate: order.lastCompletedAt ? dateLabel(order.lastCompletedAt) : null,
      machines: order.machines, overdue, dueSoon, stalled, machineConcern, anomaly, risk, priority, reasons, actions,
      shipmentLabel: plannedQuantity === null ? "未设计划，需核对" : remainingProcessing === 0 ? "加工完成，可核对出货" : "部分加工，可核对分批出货" };
  }).sort((a, b) => a.priority - b.priority || (a.dueInDays ?? Infinity) - (b.dueInDays ?? Infinity) || a.orderNo.localeCompare(b.orderNo));
  const risks = rows.filter(o => o.risk);
  const todos = rows.filter(o => o.reasons.length > 0);
  const shipments = rows.filter(o => o.readyQuantity > 0);
  return { queriedAt: now.toISOString(), businessDate: dateLabel(start),
    summary: { openOrders: rows.length, riskOrders: risks.length, overdueOrders: rows.filter(o => o.overdue).length,
      dueSoonOrders: rows.filter(o => o.dueSoon).length, todoOrders: todos.length, shipmentOrders: shipments.length,
      readyQuantity: shipments.reduce((sum, o) => sum + o.readyQuantity, 0), anomalyOrders: rows.filter(o => o.anomaly).length },
    risks, todos, shipments };
}
