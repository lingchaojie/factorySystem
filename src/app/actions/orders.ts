"use server";

import { OrderStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseOptionalPositiveQuantity } from "@/domain/factory";
import { parseOptionalYuanToCents } from "@/domain/money";
import { parseBusinessDate } from "@/lib/business-time";
import { requireManager } from "@/lib/auth";
import {
  createOrder,
  deleteOrder,
  updateOrderDetails,
  updateOrderStatus,
} from "@/server/services/orders";
import { replaceOrderDrawings } from "@/server/services/order-drawings";

const orderStatuses = new Set<OrderStatus>([
  "development_pending",
  "processing_pending",
  "in_progress",
  "completed",
]);

function getString(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

function parseOptionalDueDate(value: FormDataEntryValue | null): Date | null {
  if (!value || !String(value).trim()) return null;

  const dueDate = parseBusinessDate(String(value));
  if (Number.isNaN(dueDate.getTime())) {
    throw new Error("交期无效");
  }
  return dueDate;
}

function getOrderId(formData: FormData): string {
  const orderId = getString(formData, "orderId");
  if (!orderId) throw new Error("订单必填");
  return orderId;
}

function getMachineIds(formData: FormData): string[] {
  const machineIds: string[] = [];
  const seen = new Set<string>();

  for (const value of formData.getAll("machineId")) {
    const machineId = String(value ?? "").trim();
    if (!machineId || seen.has(machineId)) continue;
    seen.add(machineId);
    machineIds.push(machineId);
  }

  return machineIds;
}

function parseOrderStatus(value: FormDataEntryValue | null): OrderStatus {
  const status = String(value ?? "");
  if (!orderStatuses.has(status as OrderStatus)) {
    throw new Error("订单状态无效");
  }
  return status as OrderStatus;
}

function isUploadedFile(value: FormDataEntryValue): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    "size" in value
  );
}

export async function createOrderAction(formData: FormData) {
  const user = await requireManager();
  const machineIds = getMachineIds(formData);

  const created = await createOrder(user.workspaceId, {
    actorUserId: user.id,
    customerName: getString(formData, "customerName"),
    partName: getString(formData, "partName"),
    plannedQuantity: parseOptionalPositiveQuantity(
      getString(formData, "plannedQuantity"),
      "计划数量",
    ),
    unitPriceCents: parseOptionalYuanToCents(getString(formData, "unitPrice")),
    dueDate: parseOptionalDueDate(formData.get("dueDate")),
    notes: getString(formData, "notes"),
    ...(machineIds.length > 0 ? { machineIds } : {}),
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${created.id}`);
  redirect("/orders");
}

export async function updateOrderStatusAction(formData: FormData) {
  const user = await requireManager();
  const orderId = getOrderId(formData);
  const status = parseOrderStatus(formData.get("status"));

  await updateOrderStatus(user.workspaceId, orderId, status, user.id);

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}`);
}

export async function updateOrderDetailsAction(formData: FormData) {
  const user = await requireManager();
  const orderId = getOrderId(formData);

  await updateOrderDetails(user.workspaceId, orderId, {
    actorUserId: user.id,
    customerName: getString(formData, "customerName"),
    partName: getString(formData, "partName"),
    plannedQuantity: parseOptionalPositiveQuantity(
      getString(formData, "plannedQuantity"),
      "计划数量",
    ),
    unitPriceCents: parseOptionalYuanToCents(getString(formData, "unitPrice")),
    dueDate: parseOptionalDueDate(formData.get("dueDate")),
    status: parseOrderStatus(formData.get("status")),
    notes: getString(formData, "notes"),
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}`);
}

export async function deleteOrderAction(formData: FormData) {
  const user = await requireManager();
  const orderId = getOrderId(formData);

  await deleteOrder(user.workspaceId, orderId);

  revalidatePath("/orders");
  redirect("/orders");
}

export async function uploadOrderDrawingsAction(formData: FormData) {
  const user = await requireManager();
  const orderId = getOrderId(formData);
  const files = formData
    .getAll("drawings")
    .filter((value): value is File => isUploadedFile(value) && value.size > 0);

  await replaceOrderDrawings(user.workspaceId, orderId, files);

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}`);
}
