import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OrderDetailPage from "@/app/(dashboard)/orders/[id]/page";
import OrdersPage from "@/app/(dashboard)/orders/page";
import {
  parseOrderStatusFilter,
  parseOrderStatusFilters,
} from "@/app/(dashboard)/orders/filters";

const { authMock, machinesMock, ordersMock, actionsMock } = vi.hoisted(() => ({
  authMock: {
    requireUser: vi.fn(),
  },
  machinesMock: {
    listMachines: vi.fn(),
  },
  ordersMock: {
    listOrders: vi.fn(),
    getOrderWithSummary: vi.fn(),
  },
  actionsMock: {
    createOrderAction: vi.fn(),
    deleteOrderAction: vi.fn(),
    updateOrderDetailsAction: vi.fn(),
    updateOrderStatusAction: vi.fn(),
    uploadOrderDrawingsAction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => authMock);
vi.mock("@/server/services/machines", () => machinesMock);
vi.mock("@/server/services/orders", () => ordersMock);
vi.mock("@/app/actions/orders", () => actionsMock);

describe("orders page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    machinesMock.listMachines.mockResolvedValue([]);
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
    expect(
      screen.getByRole("button", { name: "状态：待开发、完成" }),
    ).toBeInTheDocument();
  });

  it("passes created date filters and uses order name search", async () => {
    ordersMock.listOrders.mockResolvedValue([]);

    render(
      await OrdersPage({
        searchParams: Promise.resolve({
          query: "甲方工厂 / 法兰",
          createdDateFrom: "2026-05-10",
          createdDateTo: "2026-05-11",
        }),
      }),
    );

    expect(ordersMock.listOrders).toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({
        query: "甲方工厂 / 法兰",
        createdAtFrom: new Date("2026-05-09T16:00:00.000Z"),
        createdAtTo: new Date("2026-05-11T16:00:00.000Z"),
      }),
    );
    expect(screen.getByPlaceholderText("客户 / 工件")).toHaveValue(
      "甲方工厂 / 法兰",
    );
    expect(screen.getByLabelText("创建日期从")).toHaveValue("2026-05-10");
    expect(screen.getByLabelText("创建日期至")).toHaveValue("2026-05-11");
    expect(screen.queryByLabelText("交期从")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("交期至")).not.toBeInTheDocument();
  });

  it("creates orders without a manual order number and accepts unit price", async () => {
    machinesMock.listMachines.mockResolvedValue([
      {
        id: "machine-free",
        code: "1号机",
        name: "1号机",
        currentOrder: null,
      },
      {
        id: "machine-completed",
        code: "2号机",
        name: "2号机",
        currentOrder: { status: "completed" },
      },
      {
        id: "machine-busy",
        code: "3号机",
        name: "3号机",
        currentOrder: { status: "in_progress" },
      },
    ]);
    ordersMock.listOrders.mockResolvedValue([
      {
        id: "order-1",
        orderNo: "ORD-20260510-0001",
        customerName: "甲方工厂",
        partName: "法兰",
        notes: "首件加急",
        plannedQuantity: 100,
        unitPriceCents: 1234,
        dueDate: null,
        createdAt: new Date("2026-05-10T00:00:00.000Z"),
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
    fireEvent.click(screen.getByRole("button", { name: "新增订单" }));
    expect(
      screen.getByRole("button", { name: "关联机器：全部" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关联机器：全部" }));
    expect(screen.getByText("1号机")).toBeInTheDocument();
    expect(screen.getByText("2号机")).toBeInTheDocument();
    expect(screen.queryByText("3号机")).not.toBeInTheDocument();
    expect(screen.getByText("甲方工厂 / 法兰")).toBeInTheDocument();
    expect(screen.getByText("首件加急")).toBeInTheDocument();
    expect(screen.getByText("创建日期 2026年5月10日")).toBeInTheDocument();
    expect(screen.queryByText("ORD-20260510-0001")).not.toBeInTheDocument();
    expect(screen.getByText(/12\.34/)).toBeInTheDocument();
    expect(screen.getByText(/1,234\.00/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "出货量进度" })).toHaveAttribute(
      "aria-valuenow",
      "10",
    );
    expect(screen.getByRole("progressbar", { name: "加工量进度" })).toHaveAttribute(
      "aria-valuenow",
      "20",
    );
    expect(screen.getByText("出货量 10 / 100")).toBeInTheDocument();
    expect(screen.getByText("加工量 20 / 100")).toBeInTheDocument();
  });

  it("renders blank optional planned quantities as dashes", async () => {
    ordersMock.listOrders.mockResolvedValue([
      {
        id: "order-1",
        orderNo: "ORD-20260510-0001",
        customerName: "甲方工厂",
        partName: "法兰",
        notes: null,
        plannedQuantity: null,
        unitPriceCents: 1234,
        dueDate: null,
        createdAt: new Date("2026-05-10T00:00:00.000Z"),
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

    const row = screen.getByRole("row", { name: /甲方工厂 \/ 法兰/ });
    expect(row).toHaveTextContent("待开发");
    expect(row).toHaveTextContent("-");
    expect(screen.getByRole("progressbar", { name: "出货量进度" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    expect(screen.getByRole("progressbar", { name: "加工量进度" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    expect(screen.getByText("出货量 0 / -")).toBeInTheDocument();
    expect(screen.getByText("加工量 0 / -")).toBeInTheDocument();
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
        notes: null,
        plannedQuantity: 100,
        unitPriceCents: 1234,
        dueDate: null,
        createdAt: new Date("2026-05-10T00:00:00.000Z"),
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
      createdByUser: {
        id: "user-1",
        username: "manager",
        displayName: "王经理",
      },
      updatedByUser: {
        id: "user-2",
        username: "planner",
        displayName: "李计划",
      },
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
    const editButton = screen.getByRole("button", { name: "编辑订单" });
    expect(editButton).toBeInTheDocument();
    fireEvent.click(editButton);
    expect(
      screen.getByRole("button", { name: "删除订单" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "甲方工厂 / 法兰" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("ORD-20260510-0001")).not.toBeInTheDocument();
    expect(screen.queryByText("订单号")).not.toBeInTheDocument();
    expect(screen.getByText("创建日期")).toBeInTheDocument();
    expect(screen.getByText("创建人")).toBeInTheDocument();
    expect(screen.getByText("王经理")).toBeInTheDocument();
    expect(screen.getByText("上次修改人")).toBeInTheDocument();
    expect(screen.getByText("李计划")).toBeInTheDocument();
    expect(screen.getByLabelText("客户名称")).toHaveValue("甲方工厂");
    expect(screen.getByLabelText("工件名称")).toHaveValue("法兰");
    expect(screen.getByLabelText("计划数量")).toHaveValue(100);
    expect(screen.getByLabelText("单价（元/件）")).toHaveValue(12.34);
    expect(screen.getByLabelText("订单状态")).toHaveValue("development_pending");
    expect(screen.getByRole("progressbar", { name: "出货量进度" })).toHaveAttribute(
      "aria-valuenow",
      "10",
    );
    expect(screen.getByRole("progressbar", { name: "加工量进度" })).toHaveAttribute(
      "aria-valuenow",
      "20",
    );
    expect(screen.getByText("出货量 10 / 100")).toBeInTheDocument();
    expect(screen.getByText("加工量 20 / 100")).toBeInTheDocument();
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

  it("sorts and filters order detail production records by machine", async () => {
    ordersMock.getOrderWithSummary.mockResolvedValue({
      id: "order-1",
      orderNo: "ORD-20260510-0001",
      customerName: "甲方工厂",
      partName: "法兰",
      plannedQuantity: 100,
      unitPriceCents: 1234,
      dueDate: null,
      status: "in_progress",
      notes: null,
      closedAt: null,
      createdAt: new Date("2026-05-10T00:00:00.000Z"),
      updatedAt: new Date("2026-05-10T00:00:00.000Z"),
      createdByUser: null,
      updatedByUser: null,
      completedQuantity: 20,
      shippedQuantity: 10,
      remainingQuantity: 90,
      isOverPlanned: false,
      canClose: false,
      currentMachines: [],
      productionRecords: [
        {
          id: "record-old",
          recordedAt: new Date("2026-05-10T08:00:00.000Z"),
          type: "completed",
          quantity: 10,
          notes: "旧记录",
          machineId: "machine-1",
          machine: { id: "machine-1", code: "1号机", name: "1号机" },
          createdByUser: null,
          updatedByUser: null,
        },
        {
          id: "record-new",
          recordedAt: new Date("2026-05-10T10:00:00.000Z"),
          type: "shipped",
          quantity: 5,
          notes: "新记录",
          machineId: "machine-2",
          machine: { id: "machine-2", code: "2号机", name: "2号机" },
          createdByUser: null,
          updatedByUser: null,
        },
      ],
      drawings: [],
    });

    render(
      await OrderDetailPage({
        params: Promise.resolve({ id: "order-1" }),
        searchParams: Promise.resolve({ machineId: "machine-2" }),
      }),
    );

    expect(
      screen.getByRole("link", { name: "记录时间倒序，点击切换为正序" }),
    ).toHaveAttribute(
      "href",
      "/orders/order-1?machineId=machine-2&recordSort=recordedAt&recordDirection=asc",
    );
    expect(
      screen.getByRole("button", { name: "机器：2号机" }),
    ).toBeInTheDocument();
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText("2号机")).toBeInTheDocument();
    expect(within(rows[0]).getByText("新记录")).toBeInTheDocument();
    expect(screen.queryByText("旧记录")).not.toBeInTheDocument();
  });

  it("shows the machines that have worked on an order detail", async () => {
    ordersMock.getOrderWithSummary.mockResolvedValue({
      id: "order-1",
      orderNo: "ORD-20260510-0001",
      customerName: "甲方工厂",
      partName: "法兰",
      plannedQuantity: null,
      unitPriceCents: 1234,
      dueDate: null,
      status: "in_progress",
      notes: null,
      closedAt: null,
      createdAt: new Date("2026-05-10T00:00:00.000Z"),
      updatedAt: new Date("2026-05-10T00:00:00.000Z"),
      createdByUser: null,
      updatedByUser: null,
      completedQuantity: 20,
      shippedQuantity: 10,
      remainingQuantity: null,
      isOverPlanned: false,
      canClose: false,
      currentMachines: [
        { id: "machine-1", code: "1号机", name: "1号机", status: "active" },
        { id: "machine-2", code: "2号机", name: "2号机", status: "active" },
        { id: "machine-3", code: "3号机", name: "3号机", status: "active" },
      ],
      productionRecords: [
        {
          id: "record-1",
          recordedAt: new Date("2026-05-10T08:00:00.000Z"),
          type: "completed",
          quantity: 10,
          notes: "旧记录",
          machineId: "machine-2",
          machine: { id: "machine-2", code: "2号机", name: "2号机" },
          createdByUser: null,
          updatedByUser: null,
        },
        {
          id: "record-2",
          recordedAt: new Date("2026-05-10T10:00:00.000Z"),
          type: "shipped",
          quantity: 5,
          notes: "新记录",
          machineId: "machine-1",
          machine: { id: "machine-1", code: "1号机", name: "1号机" },
          createdByUser: null,
          updatedByUser: null,
        },
        {
          id: "record-3",
          recordedAt: new Date("2026-05-10T11:00:00.000Z"),
          type: "completed",
          quantity: 10,
          notes: "重复机器",
          machineId: "machine-1",
          machine: { id: "machine-1", code: "1号机", name: "1号机" },
          createdByUser: null,
          updatedByUser: null,
        },
      ],
      drawings: [],
    });

    render(
      await OrderDetailPage({
        params: Promise.resolve({ id: "order-1" }),
      }),
    );

    expect(screen.getByText("出货量 10 / -")).toBeInTheDocument();
    expect(screen.getByText("加工量 20 / -")).toBeInTheDocument();
    expect(screen.getByText("做过机器")).toBeInTheDocument();
    expect(screen.queryByText("当前机器")).not.toBeInTheDocument();
    const currentMachines = screen.getByRole("region", {
      name: "当前关联机器",
    });
    expect(within(currentMachines).getByRole("link", { name: "1号机" })).toBeInTheDocument();
    expect(within(currentMachines).getByRole("link", { name: "2号机" })).toBeInTheDocument();
    expect(within(currentMachines).getByRole("link", { name: "3号机" })).toBeInTheDocument();
    const workedMachines = screen.getByRole("region", {
      name: "做过此订单的机器",
    });
    expect(within(workedMachines).getByRole("link", { name: "1号机" })).toHaveAttribute(
      "href",
      "/machines/machine-1",
    );
    expect(within(workedMachines).getByRole("link", { name: "2号机" })).toHaveAttribute(
      "href",
      "/machines/machine-2",
    );
    expect(within(workedMachines).getAllByRole("link")).toHaveLength(2);
    expect(within(workedMachines).queryByText("旧记录")).not.toBeInTheDocument();
    expect(within(workedMachines).queryByText("新记录")).not.toBeInTheDocument();
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
    expect(screen.queryByRole("button", { name: "删除订单" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "上传图纸" })).not.toBeInTheDocument();
    expect(screen.queryByText("单价")).not.toBeInTheDocument();
    expect(screen.queryByText("订单金额")).not.toBeInTheDocument();
    expect(screen.queryByText(/12\.34/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1,234\.00/)).not.toBeInTheDocument();
  });
});
