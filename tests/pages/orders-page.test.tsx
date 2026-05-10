import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import OrderDetailPage from "@/app/(dashboard)/orders/[id]/page";
import OrdersPage from "@/app/(dashboard)/orders/page";
import { parseOrderStatusFilter } from "@/app/(dashboard)/orders/filters";

const { workspaceMock, ordersMock, actionsMock } = vi.hoisted(() => ({
  workspaceMock: {
    requireWorkspaceId: vi.fn(),
  },
  ordersMock: {
    listOrders: vi.fn(),
    getOrderWithSummary: vi.fn(),
  },
  actionsMock: {
    createOrderAction: vi.fn(),
    closeOrderAction: vi.fn(),
    reopenOrderAction: vi.fn(),
    uploadOrderDrawingsAction: vi.fn(),
  },
}));

vi.mock("@/lib/workspace", () => workspaceMock);
vi.mock("@/server/services/orders", () => ordersMock);
vi.mock("@/app/actions/orders", () => actionsMock);

describe("orders page", () => {
  it("ignores inherited property names in status filters", () => {
    expect(parseOrderStatusFilter("toString")).toBeUndefined();
  });

  it("creates orders without a manual order number and accepts unit price", async () => {
    workspaceMock.requireWorkspaceId.mockResolvedValue("workspace-1");
    ordersMock.listOrders.mockResolvedValue([
      {
        id: "order-1",
        orderNo: "ORD-20260510-0001",
        customerName: "甲方工厂",
        partName: "法兰",
        plannedQuantity: 100,
        unitPriceCents: 1234,
        dueDate: null,
        status: "open",
        completedQuantity: 20,
        shippedQuantity: 10,
        remainingQuantity: 90,
        isOverPlanned: false,
        canClose: false,
      },
    ]);

    render(
      await OrdersPage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.queryByLabelText("订单号")).not.toBeInTheDocument();
    expect(screen.getByLabelText("单价（元/件）")).toBeInTheDocument();
    expect(screen.getByText(/12\.34/)).toBeInTheDocument();
    expect(screen.getByText(/1,234\.00/)).toBeInTheDocument();
  });

  it("shows drawing overwrite upload controls and download links on order detail", async () => {
    workspaceMock.requireWorkspaceId.mockResolvedValue("workspace-1");
    ordersMock.getOrderWithSummary.mockResolvedValue({
      id: "order-1",
      orderNo: "ORD-20260510-0001",
      customerName: "甲方工厂",
      partName: "法兰",
      plannedQuantity: 100,
      unitPriceCents: 1234,
      dueDate: null,
      status: "open",
      notes: null,
      closedAt: null,
      createdAt: new Date("2026-05-10T00:00:00.000Z"),
      updatedAt: new Date("2026-05-10T00:00:00.000Z"),
      completedQuantity: 20,
      shippedQuantity: 10,
      remainingQuantity: 90,
      isOverPlanned: false,
      canClose: false,
      currentMachines: [],
      productionRecords: [],
      drawings: [
        {
          id: "drawing-1",
          originalName: "fixture.step",
          relativePath: "fixture.step",
          storedPath: "workspace-1/order-1/fixture.step",
          sizeBytes: 1024,
          mimeType: "model/step",
          createdAt: new Date("2026-05-10T01:00:00.000Z"),
        },
      ],
    });

    render(
      await OrderDetailPage({
        params: Promise.resolve({ id: "order-1" }),
      }),
    );

    expect(screen.getByText("图纸文件")).toBeInTheDocument();
    expect(screen.getByText("重新上传会覆盖原有图纸")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /fixture\.step/ }),
    ).toHaveAttribute("href", "/api/order-drawings/drawing-1");
  });
});
