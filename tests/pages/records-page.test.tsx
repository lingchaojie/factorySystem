import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import RecordsPage from "@/app/(dashboard)/records/page";
import { parseRecordFilters } from "@/app/(dashboard)/records/filters";

const { workspaceMock, machinesMock, ordersMock, recordsMock } = vi.hoisted(
  () => ({
    workspaceMock: {
      requireWorkspaceId: vi.fn(),
    },
    machinesMock: {
      listMachines: vi.fn(),
    },
    ordersMock: {
      listOrders: vi.fn(),
    },
    recordsMock: {
      listProductionRecords: vi.fn(),
    },
  }),
);

vi.mock("@/lib/workspace", () => workspaceMock);
vi.mock("@/server/services/machines", () => machinesMock);
vi.mock("@/server/services/orders", () => ordersMock);
vi.mock("@/server/services/records", () => recordsMock);
vi.mock("@/app/actions/records", () => ({
  deleteRecordAction: vi.fn(),
  updateRecordAction: vi.fn(),
}));
vi.mock("@/app/(dashboard)/records/delete-record-button", () => ({
  DeleteRecordButton: ({ disabled = false }: { disabled?: boolean }) =>
    React.createElement("button", { disabled, type: "submit" }, "删除"),
}));

describe("records filters", () => {
  it("normalizes repeated query params before parsing filters", () => {
    const filters = parseRecordFilters({
      from: ["2026-05-01", "2026-05-02"],
      to: ["2026-05-03", "2026-05-04"],
      machineId: [" machine-1 ", "machine-2"],
      orderId: [" order-1 ", "order-2"],
      customerName: [" Acme ", "Other"],
      status: ["completed", "in_progress"],
    });

    expect(filters.machineId).toBe("machine-1");
    expect(filters.orderId).toBe("order-1");
    expect(filters.customerName).toBe("Acme");
    expect(filters.orderStatus).toBe("completed");
    expect(filters.from?.toISOString()).toBe("2026-04-30T16:00:00.000Z");
    expect(filters.to?.toISOString()).toBe("2026-05-03T16:00:00.000Z");
  });

  it("ignores inherited property names in status filters", () => {
    expect(parseRecordFilters({ status: "toString" }).orderStatus).toBeUndefined();
  });
});

describe("records page", () => {
  it("renders record-specific edit dialogs instead of default inline forms", async () => {
    workspaceMock.requireWorkspaceId.mockResolvedValue("workspace-1");
    machinesMock.listMachines.mockResolvedValue([]);
    ordersMock.listOrders.mockResolvedValue([]);
    recordsMock.listProductionRecords.mockResolvedValue([
      buildRecord("record-1"),
      buildRecord("record-2"),
    ]);

    const { container } = render(
      await RecordsPage({
        searchParams: Promise.resolve({}),
      }),
    );

    for (const field of ["recordedAt", "type", "quantity", "notes"]) {
      expect(container.querySelectorAll(`#${field}`)).toHaveLength(0);
      expect(container.querySelector(`#record-1-${field}`)).not.toBeNull();
      expect(container.querySelector(`#record-2-${field}`)).not.toBeNull();
    }
    expect(screen.getAllByRole("button", { name: "修改" })).toHaveLength(2);
    expect(screen.getAllByText("加工")).toHaveLength(4);
    expect(screen.getAllByText("5")).toHaveLength(2);
  });
});

function buildRecord(id: string) {
  return {
    id,
    workspaceId: "workspace-1",
    machineId: "machine-1",
    orderId: "order-1",
    recordedAt: new Date("2026-05-01T01:00:00.000Z"),
    type: "completed",
    quantity: 5,
    notes: null,
    createdAt: new Date("2026-05-01T01:00:00.000Z"),
    machine: {
      id: "machine-1",
      code: "CNC-1",
      name: "一号机",
    },
    order: {
      id: "order-1",
      orderNo: "MO-1",
      partName: "法兰",
      customerName: "Acme",
      status: "in_progress",
    },
  };
}
