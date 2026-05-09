import { describe, expect, it } from "vitest";
import { parseOrderStatusFilter } from "@/app/(dashboard)/orders/filters";

describe("orders page", () => {
  it("ignores inherited property names in status filters", () => {
    expect(parseOrderStatusFilter("toString")).toBeUndefined();
  });
});
