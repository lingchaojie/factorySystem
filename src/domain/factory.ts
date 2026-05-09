export type ProductionRecordInput = {
  completedQuantity: number;
  shippedQuantity: number;
};

export type OrderSummaryInput = {
  plannedQuantity: number;
  closedAt: Date | null;
  records: ProductionRecordInput[];
};

export type OrderSummary = {
  completedQuantity: number;
  shippedQuantity: number;
  remainingQuantity: number;
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
    (total, record) => total + record.completedQuantity,
    0,
  );
  const shippedQuantity = input.records.reduce(
    (total, record) => total + record.shippedQuantity,
    0,
  );
  return {
    completedQuantity,
    shippedQuantity,
    remainingQuantity: Math.max(input.plannedQuantity - shippedQuantity, 0),
    isOverPlanned:
      completedQuantity > input.plannedQuantity ||
      shippedQuantity > input.plannedQuantity,
    canClose: input.closedAt === null && shippedQuantity >= input.plannedQuantity,
  };
}
