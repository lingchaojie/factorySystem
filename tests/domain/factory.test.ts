import { describe, expect, it } from "vitest";
import {
  ProductionRecordInput,
  parseNonNegativeQuantity,
  summarizeOrder,
  validateProductionRecordInput,
} from "@/domain/factory";

describe("factory domain rules", () => {
  it("summarizes order progress from production records", () => {
    const summary = summarizeOrder({
      plannedQuantity: 100,
      closedAt: null,
      records: [
        { completedQuantity: 40, shippedQuantity: 10 },
        { completedQuantity: 70, shippedQuantity: 95 },
      ],
    });

    expect(summary.completedQuantity).toBe(110);
    expect(summary.shippedQuantity).toBe(105);
    expect(summary.remainingQuantity).toBe(0);
    expect(summary.isOverPlanned).toBe(true);
    expect(summary.canClose).toBe(true);
  });

  it("does not mark closed orders as closable again", () => {
    const summary = summarizeOrder({
      plannedQuantity: 20,
      closedAt: new Date("2026-05-10T08:00:00.000Z"),
      records: [{ completedQuantity: 20, shippedQuantity: 20 }],
    });

    expect(summary.canClose).toBe(false);
  });

  it("rejects records where both quantities are zero", () => {
    const input: ProductionRecordInput = {
      completedQuantity: 0,
      shippedQuantity: 0,
    };

    expect(() => validateProductionRecordInput(input)).toThrow(
      "加工数量和出货数量不能同时为 0",
    );
  });

  it("rejects negative quantities", () => {
    expect(() => parseNonNegativeQuantity("-1", "加工数量")).toThrow(
      "加工数量不能为负数",
    );
  });
});
