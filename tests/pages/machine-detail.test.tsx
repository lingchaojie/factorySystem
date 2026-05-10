import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MachineDetailPage from "@/app/(dashboard)/machines/[id]/page";

const { authMock, workspaceMock, machinesMock, ordersMock } = vi.hoisted(() => ({
  authMock: {
    requireUser: vi.fn(),
  },
  workspaceMock: {
    requireWorkspaceId: vi.fn(),
  },
  machinesMock: {
    getMachine: vi.fn(),
  },
  ordersMock: {
    listOrders: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => authMock);
vi.mock("@/lib/workspace", () => workspaceMock);
vi.mock("@/server/services/machines", () => machinesMock);
vi.mock("@/server/services/orders", () => ordersMock);

describe("machine detail page", () => {
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

  it("links current and recorded orders to order detail pages", async () => {
    workspaceMock.requireWorkspaceId.mockResolvedValue("workspace-1");
    ordersMock.listOrders.mockResolvedValue([
      {
        id: "order-1",
        orderNo: "MO-1",
        customerName: "甲方工厂",
        partName: "法兰",
      },
    ]);
    machinesMock.getMachine.mockResolvedValue({
      id: "machine-1",
      code: "CNC-1",
      name: "一号机",
      model: null,
      location: null,
      notes: "等待保养",
      status: "active",
      currentOrderId: "order-1",
      currentOrder: {
        id: "order-1",
        orderNo: "MO-1",
        customerName: "甲方工厂",
        partName: "法兰",
        status: "in_progress",
      },
      productionRecords: [
        {
          id: "record-1",
          recordedAt: new Date("2026-05-10T08:00:00.000Z"),
          type: "completed",
          quantity: 10,
          notes: null,
          order: {
            id: "order-1",
            orderNo: "MO-1",
            customerName: "甲方工厂",
            partName: "法兰",
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
        },
      ],
    });

    render(
      await MachineDetailPage({
        params: Promise.resolve({ id: "machine-1" }),
      }),
    );

    expect(screen.getByRole("heading", { name: "CNC-1" })).toBeInTheDocument();
    expect(screen.queryByText("机器编号")).not.toBeInTheDocument();
    expect(screen.queryByText("型号")).not.toBeInTheDocument();
    expect(screen.queryByText("位置")).not.toBeInTheDocument();
    const editButton = screen.getByRole("button", { name: "编辑机器" });
    expect(editButton).toBeInTheDocument();
    fireEvent.click(editButton);
    expect(screen.getByRole("button", { name: "删除机器" })).toBeInTheDocument();
    expect(screen.getByLabelText("机器状态")).toHaveValue("active");
    expect(screen.getByLabelText("机器备注")).toHaveValue("等待保养");

    const orderLinks = screen.getAllByRole("link", { name: "甲方工厂 / 法兰" });
    expect(orderLinks).toHaveLength(2);
    expect(orderLinks[0]).toHaveAttribute("href", "/orders/order-1");
    expect(orderLinks[1]).toHaveAttribute("href", "/orders/order-1");
    expect(screen.getByRole("columnheader", { name: "录入人" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "修改人" })).toBeInTheDocument();
    expect(screen.getByText("张三")).toBeInTheDocument();
    expect(screen.getByText("李四")).toBeInTheDocument();
  });

  it("sorts production records by record time by default", async () => {
    workspaceMock.requireWorkspaceId.mockResolvedValue("workspace-1");
    ordersMock.listOrders.mockResolvedValue([]);
    machinesMock.getMachine.mockResolvedValue({
      id: "machine-1",
      code: "CNC-1",
      name: "一号机",
      model: null,
      location: null,
      notes: null,
      status: "active",
      currentOrderId: null,
      currentOrder: null,
      productionRecords: [
        {
          id: "record-old",
          recordedAt: new Date("2026-05-10T08:00:00.000Z"),
          type: "completed",
          quantity: 10,
          notes: null,
          order: {
            id: "order-b",
            orderNo: "MO-2",
            customerName: "乙方工厂",
            partName: "底座",
          },
          createdByUser: null,
          updatedByUser: null,
        },
        {
          id: "record-new",
          recordedAt: new Date("2026-05-10T10:00:00.000Z"),
          type: "shipped",
          quantity: 5,
          notes: null,
          order: {
            id: "order-a",
            orderNo: "MO-1",
            customerName: "甲方工厂",
            partName: "法兰",
          },
          createdByUser: null,
          updatedByUser: null,
        },
      ],
    });

    render(
      await MachineDetailPage({
        params: Promise.resolve({ id: "machine-1" }),
        searchParams: Promise.resolve({}),
      }),
    );

    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("甲方工厂 / 法兰")).toBeInTheDocument();
    expect(within(rows[1]).getByText("乙方工厂 / 底座")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "记录时间倒序，点击切换为正序" }),
    ).toHaveAttribute(
      "href",
      "/machines/machine-1?recordSort=recordedAt&recordDirection=asc",
    );
    expect(
      screen.getByRole("link", { name: "订单排序，点击切换为正序" }),
    ).toHaveAttribute(
      "href",
      "/machines/machine-1?recordSort=order&recordDirection=asc",
    );
  });

  it("sorts production records by order name from query params", async () => {
    workspaceMock.requireWorkspaceId.mockResolvedValue("workspace-1");
    ordersMock.listOrders.mockResolvedValue([]);
    machinesMock.getMachine.mockResolvedValue({
      id: "machine-1",
      code: "CNC-1",
      name: "一号机",
      model: null,
      location: null,
      notes: null,
      status: "active",
      currentOrderId: null,
      currentOrder: null,
      productionRecords: [
        {
          id: "record-b",
          recordedAt: new Date("2026-05-10T10:00:00.000Z"),
          type: "completed",
          quantity: 10,
          notes: null,
          order: {
            id: "order-b",
            orderNo: "MO-2",
            customerName: "乙方工厂",
            partName: "底座",
          },
          createdByUser: null,
          updatedByUser: null,
        },
        {
          id: "record-a",
          recordedAt: new Date("2026-05-10T08:00:00.000Z"),
          type: "shipped",
          quantity: 5,
          notes: null,
          order: {
            id: "order-a",
            orderNo: "MO-1",
            customerName: "甲方工厂",
            partName: "法兰",
          },
          createdByUser: null,
          updatedByUser: null,
        },
      ],
    });

    render(
      await MachineDetailPage({
        params: Promise.resolve({ id: "machine-1" }),
        searchParams: Promise.resolve({
          recordSort: "order",
          recordDirection: "asc",
        }),
      }),
    );

    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("甲方工厂 / 法兰")).toBeInTheDocument();
    expect(within(rows[1]).getByText("乙方工厂 / 底座")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "订单正序，点击切换为倒序" }),
    ).toHaveAttribute(
      "href",
      "/machines/machine-1?recordSort=order&recordDirection=desc",
    );
  });

  it("shows shipped progress for the current in-progress order", async () => {
    workspaceMock.requireWorkspaceId.mockResolvedValue("workspace-1");
    ordersMock.listOrders.mockResolvedValue([]);
    machinesMock.getMachine.mockResolvedValue({
      id: "machine-1",
      code: "CNC-1",
      name: "一号机",
      model: null,
      location: null,
      notes: null,
      status: "active",
      currentOrderId: "order-1",
      currentOrder: {
        id: "order-1",
        orderNo: "MO-1",
        customerName: "甲方工厂",
        partName: "法兰",
        plannedQuantity: 100,
        status: "in_progress",
        productionRecords: [
          { type: "completed", quantity: 80 },
          { type: "shipped", quantity: 35 },
        ],
      },
      productionRecords: [],
    });

    render(
      await MachineDetailPage({
        params: Promise.resolve({ id: "machine-1" }),
      }),
    );

    const progress = screen.getByRole("progressbar", {
      name: "当前订单出货进度",
    });
    expect(progress).toHaveAttribute("aria-valuenow", "35");
    expect(progress).toHaveAttribute("title", "出货 35 / 100");
    expect(screen.getByText("35% 出货 35 / 100")).toBeInTheDocument();
  });

  it("allows employees to edit existing machines but hides machine deletion", async () => {
    authMock.requireUser.mockResolvedValue({
      id: "user-2",
      workspaceId: "workspace-1",
      username: "employee",
      displayName: "李四",
      role: "employee",
      workspace: { name: "精密加工一厂" },
    });
    ordersMock.listOrders.mockResolvedValue([]);
    machinesMock.getMachine.mockResolvedValue({
      id: "machine-1",
      code: "CNC-1",
      name: "一号机",
      model: null,
      location: null,
      notes: "等待保养",
      status: "active",
      currentOrderId: null,
      currentOrder: null,
      productionRecords: [],
    });

    render(
      await MachineDetailPage({
        params: Promise.resolve({ id: "machine-1" }),
      }),
    );

    expect(screen.getByRole("button", { name: "编辑机器" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除机器" })).not.toBeInTheDocument();
  });

  it("disables record entry when the current order is completed", async () => {
    workspaceMock.requireWorkspaceId.mockResolvedValue("workspace-1");
    ordersMock.listOrders.mockResolvedValue([]);
    machinesMock.getMachine.mockResolvedValue({
      id: "machine-1",
      code: "CNC-1",
      name: "一号机",
      model: null,
      location: null,
      notes: null,
      status: "active",
      currentOrderId: "order-1",
      currentOrder: {
        id: "order-1",
        orderNo: "MO-1",
        customerName: "甲方工厂",
        partName: "法兰",
        status: "completed",
      },
      productionRecords: [],
    });

    render(
      await MachineDetailPage({
        params: Promise.resolve({ id: "machine-1" }),
      }),
    );

    expect(
      screen.getByText("当前订单已完成，请关联未完成的订单后再录入。"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("记录时间")).toBeDisabled();
    expect(screen.getByLabelText("加工数量")).toBeDisabled();
    expect(screen.getByLabelText("出货数量")).toBeDisabled();
    expect(screen.getByLabelText("备注")).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存记录" })).toBeDisabled();
  });
});
