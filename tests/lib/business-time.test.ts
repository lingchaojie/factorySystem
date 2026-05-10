import { describe, expect, it } from "vitest";
import {
  businessTodayBounds,
  formatBusinessDateTime,
  formatDateTimeLocalValue,
  parseBusinessDateTimeLocal,
} from "@/lib/business-time";

describe("business time helpers", () => {
  it("parses datetime-local input as Asia/Shanghai wall time", () => {
    expect(parseBusinessDateTimeLocal("2026-05-10T08:30")).toEqual(
      new Date("2026-05-10T00:30:00.000Z"),
    );
  });

  it("formats default datetime-local values in Asia/Shanghai", () => {
    expect(
      formatDateTimeLocalValue(new Date("2026-05-10T00:30:00.000Z")),
    ).toBe("2026-05-10T08:30");
  });

  it("returns Shanghai day bounds as Date instants", () => {
    expect(businessTodayBounds(new Date("2026-05-10T16:30:00.000Z"))).toEqual({
      start: new Date("2026-05-10T16:00:00.000Z"),
      end: new Date("2026-05-11T16:00:00.000Z"),
    });
  });

  it("formats display timestamps in Asia/Shanghai", () => {
    expect(formatBusinessDateTime(new Date("2026-05-10T00:30:00.000Z"))).toContain(
      "08:30",
    );
  });
});
