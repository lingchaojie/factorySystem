"use server";

import { MachineStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { parseNonNegativeQuantity } from "@/domain/factory";
import { parseBusinessDateTimeLocal } from "@/lib/business-time";
import { requireWorkspaceId } from "@/lib/workspace";
import {
  createMachine,
  linkMachineToOrder,
  updateMachine,
} from "@/server/services/machines";
import { createProductionRecord } from "@/server/services/records";

const machineStatuses = new Set<MachineStatus>([
  "active",
  "idle",
  "maintenance",
  "disabled",
]);

function getString(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

function parseMachineStatus(value: FormDataEntryValue | null): MachineStatus {
  if (!value) return "active";
  const status = String(value);
  if (!machineStatuses.has(status as MachineStatus)) {
    throw new Error("机器状态无效");
  }
  return status as MachineStatus;
}

function parseRecordedAt(value: FormDataEntryValue | null): Date {
  if (!value) return new Date();
  const recordedAt = parseBusinessDateTimeLocal(String(value));
  if (Number.isNaN(recordedAt.getTime())) {
    throw new Error("记录时间无效");
  }
  return recordedAt;
}

export async function createMachineAction(formData: FormData) {
  const workspaceId = await requireWorkspaceId();
  const code = getString(formData, "code");

  await createMachine(workspaceId, {
    code,
    name: code.trim(),
    model: "",
    location: "",
    status: parseMachineStatus(formData.get("status")),
    notes: getString(formData, "notes"),
  });

  revalidatePath("/machines");
  redirect("/machines");
}

export async function updateMachineAction(formData: FormData) {
  const workspaceId = await requireWorkspaceId();
  const machineId = getString(formData, "machineId");

  if (!machineId) throw new Error("机器必填");

  await updateMachine(workspaceId, machineId, {
    status: parseMachineStatus(formData.get("status")),
    notes: getString(formData, "notes"),
  });

  revalidatePath("/machines");
  revalidatePath(`/machines/${machineId}`);
  redirect(`/machines/${machineId}`);
}

export async function linkMachineAction(formData: FormData) {
  const workspaceId = await requireWorkspaceId();
  const machineId = getString(formData, "machineId");
  const orderId = getString(formData, "orderId");

  if (!machineId) throw new Error("机器必填");
  if (!orderId) throw new Error("订单必填");

  await linkMachineToOrder(workspaceId, machineId, orderId);

  revalidatePath("/machines");
  revalidatePath(`/machines/${machineId}`);
  redirect(`/machines/${machineId}`);
}

export async function createMachineRecordAction(formData: FormData) {
  const workspaceId = await requireWorkspaceId();
  const machineId = getString(formData, "machineId");

  if (!machineId) throw new Error("机器必填");

  await createProductionRecord(workspaceId, {
    machineId,
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

  revalidatePath("/machines");
  revalidatePath(`/machines/${machineId}`);
  revalidatePath("/orders");
  revalidatePath("/records");
  redirect(`/machines/${machineId}`);
}
