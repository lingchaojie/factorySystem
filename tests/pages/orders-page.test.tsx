import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OrderDetailPage from "@/app/(dashboard)/orders/[id]/page";
import OrdersPage from "@/app/(dashboard)/orders/page";
import {
  parseOrderStatusFilter,
  parseOrderStatusFilters,
} from "@/app/(dashboard)/orders/filters";

const { authMock, ordersMock, actionsMock } = vi.hoisted(() => ({
  authMock: {
    requireUser: vi.fn(),
  },
  ordersMock: {
    listOrders: vi.fn(),
    getOrderWithSummary: vi.fn(),
  },
  actionsMock: {
    createOrderAction: vi.fn(),
    updateOrderDetailsAction: vi.fn(),
    updateOrderStatusAction: vi.fn(),
    uploadOrderDrawingsAction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => authMock);
vi.mock("@/server/services/orders", () => ordersMock);
vi.mock("@/app/actions/orders", () => actionsMock);

describe("orders page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.requireUser.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      username: "manager",
      displayName: "王经理",
      role: "manager",
      workspace: { name: "精密加工一厂" },
    });
  });

  it("ignores inherited property names in status filters", () => {
    expect(parseOrderStatusFilter("toString")).toBeUndefined();
    expect(parseOrderStatusFilters(["toString"])).toBeUndefined();
  });

  it("passes multiple status filters from repeated query params", async () => {
    ordersMock.listOrders.mockResolvedValue([]);

    render(
      await OrdersPage({
        searchParams: Promise.resolve({
          status: ["development_pending", "completed", "toString"],
        }),
      }),
    );

    expect(ordersMock.listOrders).toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({
        statuses: ["development_pending", "completed"],
      }),
    );
    expect(screen.getByLabelText("待开发")).toBeChecked();
    expect(screen.getByLabelText("完成")).toBeChecked();
    expect(screen.getByLabelText("进行中")).not.toBeChecked();
  });

  it("creates orders without a manual order number and accepts unit price", async () => {
    ordersMock.listOrders.mockResolvedValue([
      {
        id: "order-1",
        orderNo: "ORD-20260510-0001",
        customerName: "甲方工厂",
        partName: "法兰",
        plannedQuantity: 100,
        unitPriceCents: 1234,
        dueDate: null,
        status: "in_progress",
        completedQuantity: 20,
        shippedQuantity: 10,
        remainingQuantity: 90,
        isOverPlanned: false,
        canClose: false,
      },
    ]);

    const { container } = render(
      await OrdersPage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(
      screen.getByRole("button", { name: "新增订单" }),
    ).toBeInTheDocument();
    expect(container.querySelector("dialog")).toBeInTheDocument();
    expect(container.querySelector("aside")).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "加工" })).toHaveClass(
      "whitespace-nowrap",
    );
    expect(screen.getByRole("columnheader", { name: "出货" })).toHaveClass(
      "whitespace-nowrap",
    );
    expect(screen.queryByLabelText("订单号")).not.toBeInTheDocument();
    expect(screen.getByLabelText("计划数量")).not.toBeRequired();
    expect(screen.getByLabelText("单价（元/件）")).toBeInTheDocument();
    expect(screen.getByText(/12\.34/)).toBeInTheDocument();
    expect(screen.getByText(/1,234\.00/)).toBeInTheDocument();
  });

  it("renders blank optional planned quantities as dashes", async () => {
    ordersMock.listOrders.mockResolvedValue([
      {
        id: "order-1",
        orderNo: "ORD-20260510-0001",
        customerName: "甲方工厂",
        partName: "法兰",
        plannedQuantity: null,
        unitPriceCents: 1234,
        dueDate: null,
        status: "development_pending",
        completedQuantity: 0,
        shippedQuantity: 0,
        remainingQuantity: null,
        isOverPlanned: false,
        canClose: false,
      },
    ]);

    render(
      await OrdersPage({
        searchParams: Promise.resolve({}),
      }),
    );

    const row = screen.getByRole("row", { name: /ORD-20260510-0001/ });
    expect(row).toHaveTextContent("待开发");
    expect(row).toHaveTextContent("-");
  });

  it("hides order creation and price columns from employee users", async () => {
    authMock.requireUser.mockResolvedValue({
      id: "user-2",
      workspaceId: "workspace-1",
      username: "employee",
      displayName: "李四",
      role: "employee",
      workspace: { name: "精密加工一厂" },
    });
    ordersMock.listOrders.mockResolvedValue([
      {
        id: "order-1",
        orderNo: "ORD-20260510-0001",
        customerName: "甲方工厂",
        partName: "法兰",
        plannedQuantity: 100,
        unitPriceCents: 1234,
        dueDate: null,
        status: "in_progress",
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

    expect(screen.queryByRole("button", { name: "新增订单" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "单价" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "金额" })).not.toBeInTheDocument();
    expect(screen.queryByText(/12\.34/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1,234\.00/)).not.toBeInTheDocument();
  });

  it("shows drawing overwrite upload controls and download links on order detail", async () => {
    ordersMock.getOrderWithSummary.mockResolvedValue({
      id: "order-1",
      orderNo: "ORD-20260510-0001",
      customerName: "甲方工厂",
      partName: "法兰",
      plannedQuantity: 100,
      unitPriceCents: 1234,
      dueDate: null,
      status: "development_pending",
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
          relativePath: "fixture/fixture.step",
          storedPath: "workspace-1/order-1/fixture/fixture.step",
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
      screen.getByRole("button", { name: "上传图纸" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "修改状态" })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "编辑订单" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("客户名称")).toHaveValue("甲方工厂");
    expect(screen.getByLabelText("工件名称")).toHaveValue("法兰");
    expect(screen.getByLabelText("计划数量")).toHaveValue(100);
    expect(screen.getByLabelText("单价（元/件）")).toHaveValue(12.34);
    expect(screen.getByLabelText("订单状态")).toHaveValue("development_pending");
    expect(screen.queryByText("上传文件")).not.toBeInTheDocument();
    expect(screen.queryByText("上传文件夹")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /fixture$/ })).toHaveAttribute(
      "href",
      "/api/order-drawings/archive?orderId=order-1&prefix=fixture",
    );
    expect(
      screen.getByRole("link", { name: /fixture\.step/ }),
    ).toHaveAttribute("href", "/api/order-drawings/drawing-1");
  });

  it("hides order price and mutation controls from employee users on detail", async () => {
    authMock.requireUser.mockResolvedValue({
      id: "user-2",
      workspaceId: "workspace-1",
      username: "employee",
      displayName: "李四",
      role: "employee",
      workspace: { name: "精密加工一厂" },
    });
    ordersMock.getOrderWithSummary.mockResolvedValue({
      id: "order-1",
      orderNo: "ORD-20260510-0001",
      customerName: "甲方工厂",
      partName: "法兰",
      plannedQuantity: 100,
      unitPriceCents: 1234,
      dueDate: null,
      status: "development_pending",
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
      drawings: [],
    });

    render(
      await OrderDetailPage({
        params: Promise.resolve({ id: "order-1" }),
      }),
    );

    expect(screen.queryByRole("button", { name: "修改状态" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑订单" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上传图纸" })).not.toBeInTheDocument();
    expect(screen.queryByText("单价")).not.toBeInTheDocument();
    expect(screen.queryByText("订单金额")).not.toBeInTheDocument();
    expect(screen.queryByText(/12\.34/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1,234\.00/)).not.toBeInTheDocument();
  });
});
