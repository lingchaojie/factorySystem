export type ProductionRecordType = "completed" | "shipped";

export type MachineRecordInput = {
  completedQuantity: number;
  shippedQuantity: number;
};

export type ProductionRecordInput = {
  type: ProductionRecordType;
  quantity: number;
};

export type OrderSummaryInput = {
  plannedQuantity: number | null;
  closedAt?: Date | null;
  records: ProductionRecordInput[];
};

export type OrderSummary = {
  completedQuantity: number;
  shippedQuantity: number;
  remainingQuantity: number | null;
  isOverPlanned: boolean;
  canClose: boolean;
};

export function parsePositiveQuantity(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label}必须是整数`);
  }
  if (parsed <= 0) {
    throw new Error(`${label}必须大于 0`);
  }
  return parsed;
}

export function parseOptionalPositiveQuantity(
  value: string,
  label: string,
): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return parsePositiveQuantity(trimmed, label);
}

export function parseNonNegativeQuantity(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label}必须是整数`);
  }
  if (parsed < 0) {
    throw new Error(`${label}不能为负数`);
  }
  return parsed;
}

export function validateProductionRecordInput(
  input: ProductionRecordInput,
): ProductionRecordInput {
  if (input.type !== "completed" && input.type !== "shipped") {
    throw new Error("记录类型无效");
  }
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new Error("记录数量必须大于 0");
  }
  return input;
}

export function validateMachineRecordInput(
  input: MachineRecordInput,
): MachineRecordInput {
  if (!Number.isInteger(input.completedQuantity) || input.completedQuantity < 0) {
    throw new Error("加工数量不能为负数");
  }
  if (!Number.isInteger(input.shippedQuantity) || input.shippedQuantity < 0) {
    throw new Error("出货数量不能为负数");
  }
  if (input.completedQuantity === 0 && input.shippedQuantity === 0) {
    throw new Error("加工数量和出货数量不能同时为 0");
  }
  return input;
}

export function summarizeOrder(input: OrderSummaryInput): OrderSummary {
  const completedQuantity = input.records.reduce(
    (total, record) =>
      record.type === "completed" ? total + record.quantity : total,
    0,
  );
  const shippedQuantity = input.records.reduce(
    (total, record) =>
      record.type === "shipped" ? total + record.quantity : total,
    0,
  );
  const plannedQuantity = input.plannedQuantity;
  const hasPlan = plannedQuantity !== null;
  return {
    completedQuantity,
    shippedQuantity,
    remainingQuantity: hasPlan
      ? Math.max(plannedQuantity - shippedQuantity, 0)
      : null,
    isOverPlanned: hasPlan
      ? completedQuantity > plannedQuantity ||
        shippedQuantity > plannedQuantity
      : false,
    canClose: hasPlan
      ? input.closedAt == null && shippedQuantity >= plannedQuantity
      : false,
  };
}
