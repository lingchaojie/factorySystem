import { render, screen, within } from "@testing-library/react";
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
  it("normalizes repeated query params into multi-select filters", () => {
    const filters = parseRecordFilters({
      from: ["2026-05-01", "2026-05-02"],
      to: ["2026-05-03", "2026-05-04"],
      type: [" shipped ", "completed"],
      orderId: [" order-1 ", "order-2", ""],
      orderQuery: [" 甲方 / 法兰 ", "乙方 / 底座"],
      customerName: [" Acme ", "Other"],
      status: ["completed", "in_progress"],
    });

    expect(filters.recordType).toBe("shipped");
    expect(filters.recordTypes).toEqual(["shipped", "completed"]);
    expect(filters.orderId).toBe("order-1");
    expect(filters.orderIds).toEqual(["order-1", "order-2"]);
    expect(filters.orderQuery).toBe("甲方 / 法兰");
    expect(filters.customerName).toBe("Acme");
    expect(filters.orderStatus).toBe("completed");
    expect(filters.orderStatuses).toEqual(["completed", "in_progress"]);
    expect(filters.from?.toISOString()).toBe("2026-04-30T16:00:00.000Z");
    expect(filters.to?.toISOString()).toBe("2026-05-03T16:00:00.000Z");
  });

  it("ignores inherited property names in status filters", () => {
    expect(parseRecordFilters({ status: "toString" }).orderStatus).toBeUndefined();
    expect(parseRecordFilters({ status: "toString" }).orderStatuses).toBeUndefined();
    expect(parseRecordFilters({ type: "toString" }).recordType).toBeUndefined();
    expect(parseRecordFilters({ type: "toString" }).recordTypes).toBeUndefined();
  });
});

describe("records page", () => {
  it("renders type filters and record-specific edit dialogs", async () => {
    workspaceMock.requireWorkspaceId.mockResolvedValue("workspace-1");
    ordersMock.listOrders.mockResolvedValue([]);
    recordsMock.listProductionRecords.mockResolvedValue([
      buildRecord("record-1"),
      buildRecord("record-2"),
    ]);

    const { container } = render(
      await RecordsPage({
        searchParams: Promise.resolve({ type: "completed" }),
      }),
    );

    expect(machinesMock.listMachines).not.toHaveBeenCalled();
    expect(ordersMock.listOrders).not.toHaveBeenCalled();
    expect(recordsMock.listProductionRecords).toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({ type: "completed" }),
    );
    expect(
      screen.getByRole("button", { name: "记录类型：加工" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("机器")).not.toBeInTheDocument();
    for (const field of ["recordedAt", "type", "quantity", "notes"]) {
      expect(container.querySelectorAll(`#${field}`)).toHaveLength(0);
      expect(container.querySelector(`#record-1-${field}`)).not.toBeNull();
      expect(container.querySelector(`#record-2-${field}`)).not.toBeNull();
    }
    expect(screen.getAllByRole("button", { name: "修改" })).toHaveLength(2);
    expect(screen.getAllByText("进行中")).toHaveLength(2);
    expect(screen.getAllByText("出货量 35 / 100")).toHaveLength(2);
    expect(screen.getAllByText("加工量 80 / 100")).toHaveLength(2);
    expect(screen.getAllByText("5")).toHaveLength(2);
    expect(screen.getAllByText("录入人")).toHaveLength(2);
    expect(screen.getAllByText("修改人")).toHaveLength(2);
    expect(screen.getAllByText("张三")).toHaveLength(2);
    expect(screen.getAllByText("李四")).toHaveLength(2);

    const firstArticle = container.querySelector("article");
    expect(firstArticle).not.toBeNull();
    const headingRow = firstArticle?.querySelector("h2")?.parentElement;
    expect(headingRow).not.toHaveTextContent("进行中");
    const orderBlock = within(firstArticle as HTMLElement)
      .getByText("订单")
      .closest("div");
    expect(orderBlock).toHaveTextContent("进行中");
    const detailGrid = firstArticle?.querySelector("dl");
    expect(detailGrid).toHaveClass("gap-x-8");
    expect(detailGrid?.className).toContain("minmax(260px,1.6fr)");
    expect(
      within(orderBlock as HTMLElement).getByRole("link", { name: "Acme / 法兰" }),
    ).toHaveClass("break-words");
    expect(
      within(orderBlock as HTMLElement).getByRole("progressbar", {
        name: "出货量进度",
      }),
    ).toHaveAttribute("aria-valuenow", "35");
    expect(
      within(orderBlock as HTMLElement).getByRole("progressbar", {
        name: "加工量进度",
      }),
    ).toHaveAttribute("aria-valuenow", "80");
    const quantityBlock = within(detailGrid as HTMLElement)
      .getByText("数量")
      .closest("div");
    expect(quantityBlock).toHaveClass("whitespace-nowrap");
  });

  it("passes record type, order search, and status filters", async () => {
    workspaceMock.requireWorkspaceId.mockResolvedValue("workspace-1");
    recordsMock.listProductionRecords.mockResolvedValue([]);

    render(
      await RecordsPage({
        searchParams: Promise.resolve({
          type: ["completed", "shipped"],
          orderQuery: "甲方 / 法兰",
          status: ["in_progress", "completed"],
        }),
      }),
    );

    expect(recordsMock.listProductionRecords).toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({
        types: ["completed", "shipped"],
        orderQuery: "甲方 / 法兰",
        orderStatuses: ["in_progress", "completed"],
      }),
    );
    expect(
      screen.getByRole("button", { name: "记录类型：加工、出货" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("订单")).toHaveValue("甲方 / 法兰");
    expect(screen.queryByRole("button", { name: /订单：/ })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "订单状态：进行中、完成" }),
    ).toBeInTheDocument();
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
      plannedQuantity: 100,
      productionRecords: [
        { type: "completed", quantity: 80 },
        { type: "shipped", quantity: 35 },
      ],
    },
    createdByUser: {
      id: "user-1",
      username: "operator1",
      displayName: "张三",
    },
    updatedByUser: {
      id: "user-2",
      username: "operator2",
      displayName: "李四",
    },
  };
}
