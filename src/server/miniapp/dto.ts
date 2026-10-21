import type { AuthenticatedUser } from "@/lib/session";
import { summarizeOrder } from "@/domain/factory";
import { businessTodayBounds } from "@/lib/business-time";
import type { getMachine } from "@/server/services/machines";
import type { getOrderWithSummary, listOrders } from "@/server/services/orders";

export function userDto(user: AuthenticatedUser) {
  return { id: user.id, username: user.username, displayName: user.displayName,
    role: user.role, workspaceName: user.workspace.name };
}

type OrderRow = Awaited<ReturnType<typeof listOrders>>[number];
type OrderBase = Pick<OrderRow, "id" | "orderNo" | "customerName" | "partName" | "status" |
  "plannedQuantity" | "unitPriceCents" | "dueDate" | "notes" | "closedAt" | "productionRecords">;

// Explicit allowlists: service results can contain full user rows and private prices.
export function orderDto(order: OrderBase, role: AuthenticatedUser["role"]) {
  return { id: order.id, orderNo: order.orderNo, customerName: order.customerName,
    partName: order.partName, status: order.status, plannedQuantity: order.plannedQuantity,
    dueDate: order.dueDate, notes: order.notes,
    ...summarizeOrder({ plannedQuantity: order.plannedQuantity, closedAt: order.closedAt,
      records: order.productionRecords }),
    ...(role === "manager" ? { unitPriceCents: order.unitPriceCents } : {}),
  };
}

type MachineRow = Awaited<ReturnType<typeof getMachine>>;
export function machineDto(machine: Pick<MachineRow, "id" | "code" | "name" | "status" |
  "notes" | "orderAssignments"> & { productionRecords: Array<{
    recordedAt: Date; type: "completed" | "shipped"; quantity: number;
  }> }, role: AuthenticatedUser["role"]) {
  const { start, end } = businessTodayBounds();
  const today = machine.productionRecords.filter(r => r.recordedAt >= start && r.recordedAt < end);
  return { id: machine.id, code: machine.code, name: machine.name, status: machine.status,
    notes: machine.notes,
    todayCompleted: today.filter(r => r.type === "completed").reduce((n, r) => n + r.quantity, 0),
    todayShipped: today.filter(r => r.type === "shipped").reduce((n, r) => n + r.quantity, 0),
    orders: machine.orderAssignments.map(a => orderDto(a.order, role)),
  };
}

export function orderDetailDto(order: Awaited<ReturnType<typeof getOrderWithSummary>>, role: AuthenticatedUser["role"]) {
  return { ...orderDto(order, role), machines: order.machineAssignments.map(a => ({
    id: a.machine.id, name: a.machine.name, code: a.machine.code,
  })), records: order.productionRecords.map(r => ({
    id: r.id, type: r.type, quantity: r.quantity, recordedAt: r.recordedAt,
    notes: r.notes, machineName: r.machine.name, operatorName: r.createdByUser?.displayName ?? "",
  })) };
}
