import { describe, expect, it } from "vitest";
import {
  MachineRecordInput,
  parseNonNegativeQuantity,
  summarizeOrder,
  validateMachineRecordInput,
  validateProductionRecordInput,
} from "@/domain/factory";

describe("factory domain rules", () => {
  it("summarizes order progress from production records", () => {
    const summary = summarizeOrder({
      plannedQuantity: 100,
      records: [
        { type: "completed", quantity: 40 },
        { type: "shipped", quantity: 10 },
        { type: "completed", quantity: 70 },
        { type: "shipped", quantity: 95 },
      ],
    });

    expect(summary.completedQuantity).toBe(110);
    expect(summary.shippedQuantity).toBe(105);
    expect(summary.remainingQuantity).toBe(0);
    expect(summary.isOverPlanned).toBe(true);
    expect(summary.canClose).toBe(true);
  });

  it("keeps target-derived fields unavailable when planned quantity is blank", () => {
    const summary = summarizeOrder({
      plannedQuantity: null,
      records: [
        { type: "completed", quantity: 20 },
        { type: "shipped", quantity: 8 },
      ],
    });

    expect(summary.completedQuantity).toBe(20);
    expect(summary.shippedQuantity).toBe(8);
    expect(summary.remainingQuantity).toBeNull();
    expect(summary.isOverPlanned).toBe(false);
    expect(summary.canClose).toBe(false);
  });

  it("rejects machine entries where both quantities are zero", () => {
    const input: MachineRecordInput = {
      completedQuantity: 0,
      shippedQuantity: 0,
    };

    expect(() => validateMachineRecordInput(input)).toThrow(
      "加工数量和出货数量不能同时为 0",
    );
  });

  it("rejects split production records with invalid quantities", () => {
    expect(() =>
      validateProductionRecordInput({ type: "completed", quantity: 0 }),
    ).toThrow("记录数量必须大于 0");
  });

  it("rejects negative quantities", () => {
    expect(() => parseNonNegativeQuantity("-1", "加工数量")).toThrow(
      "加工数量不能为负数",
    );
  });
});
