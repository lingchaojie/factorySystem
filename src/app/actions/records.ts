"use server";

import { revalidatePath } from "next/cache";
import { parseNonNegativeQuantity } from "@/domain/factory";
import { parseBusinessDateTimeLocal } from "@/lib/business-time";
import { requireWorkspaceId } from "@/lib/workspace";
import {
  deleteProductionRecord,
  updateProductionRecord,
} from "@/server/services/records";

function getString(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

function getRecordId(formData: FormData): string {
  const recordId = getString(formData, "recordId");
  if (!recordId) throw new Error("记录必填");
  return recordId;
}

function parseRecordedAt(value: FormDataEntryValue | null): Date {
  if (!value || !String(value).trim()) {
    throw new Error("记录时间必填");
  }

  const recordedAt = parseBusinessDateTimeLocal(String(value));
  if (Number.isNaN(recordedAt.getTime())) {
    throw new Error("记录时间无效");
  }
  return recordedAt;
}

function revalidateRecordDependencies(result?: {
  machineId?: string | null;
  orderId?: string | null;
}) {
  revalidatePath("/records");
  revalidatePath("/orders");
  revalidatePath("/machines");

  if (result?.orderId) {
    revalidatePath(`/orders/${result.orderId}`);
  }
  if (result?.machineId) {
    revalidatePath(`/machines/${result.machineId}`);
  }
}

export async function updateRecordAction(formData: FormData) {
  const workspaceId = await requireWorkspaceId();
  const recordId = getRecordId(formData);

  const updated = await updateProductionRecord(workspaceId, recordId, {
    recordedAt: parseRecordedAt(formData.get("recordedAt")),
    completedQuantity: parseNonNegativeQuantity(
      getString(formData, "completedQuantity") || "0",
      "加工数量",
    ),
    shippedQuantity: parseNonNegativeQuantity(
      getString(formData, "shippedQuantity") || "0",
      "出货数量",
    ),
    notes: getString(formData, "notes"),
  });

  revalidateRecordDependencies(updated);
}

export async function deleteRecordAction(formData: FormData) {
  const workspaceId = await requireWorkspaceId();
  const recordId = getRecordId(formData);

  const deleted = await deleteProductionRecord(workspaceId, recordId);

  revalidateRecordDependencies(deleted);
}
