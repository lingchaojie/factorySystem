"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parsePositiveQuantity } from "@/domain/factory";
import { parseOptionalYuanToCents } from "@/domain/money";
import { parseBusinessDate } from "@/lib/business-time";
import { requireWorkspaceId } from "@/lib/workspace";
import {
  closeOrder,
  createOrder,
  reopenOrder,
} from "@/server/services/orders";

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

export async function createOrderAction(formData: FormData) {
  const workspaceId = await requireWorkspaceId();

  const created = await createOrder(workspaceId, {
    customerName: getString(formData, "customerName"),
    partName: getString(formData, "partName"),
    plannedQuantity: parsePositiveQuantity(
      getString(formData, "plannedQuantity"),
      "计划数量",
    ),
    unitPriceCents: parseOptionalYuanToCents(getString(formData, "unitPrice")),
    dueDate: parseOptionalDueDate(formData.get("dueDate")),
    notes: getString(formData, "notes"),
  });

  revalidatePath("/orders");
  revalidatePath(`/orders/${created.id}`);
  redirect("/orders");
}

export async function closeOrderAction(formData: FormData) {
  const workspaceId = await requireWorkspaceId();
  const orderId = getOrderId(formData);

  await closeOrder(workspaceId, orderId);

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}`);
}

export async function reopenOrderAction(formData: FormData) {
  const workspaceId = await requireWorkspaceId();
  const orderId = getOrderId(formData);

  await reopenOrder(workspaceId, orderId);

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  redirect(`/orders/${orderId}`);
}
