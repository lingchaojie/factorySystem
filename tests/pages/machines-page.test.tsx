import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MachinesPage from "@/app/(dashboard)/machines/page";

const { authMock, machinesMock, actionsMock } = vi.hoisted(() => ({
  authMock: {
    requireUser: vi.fn(),
  },
  machinesMock: {
    listMachines: vi.fn(),
  },
  actionsMock: {
    createMachineAction: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => authMock);
vi.mock("@/server/services/machines", () => machinesMock);
vi.mock("@/app/actions/machines", () => actionsMock);

describe("machines page", () => {
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

  it("passes multiple machine status filters from repeated query params", async () => {
    machinesMock.listMachines.mockResolvedValue([]);

    render(
      await MachinesPage({
        searchParams: Promise.resolve({
          status: ["active", "maintenance", "toString"],
        }),
      }),
    );

    expect(machinesMock.listMachines).toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({
        statuses: ["active", "maintenance"],
      }),
    );
    expect(screen.getByRole("button", { name: /状态：正常、维护中/ })).toBeInTheDocument();
  });

  it("uses a dialog for machine creation and keeps the table full width", async () => {
    machinesMock.listMachines.mockResolvedValue([
      {
        id: "machine-1",
        code: "1",
        name: "1",
        model: null,
        location: null,
        status: "active",
        currentOrder: {
          id: "order-1",
          customerName: "甲方工厂",
          partName: "法兰",
          plannedQuantity: 100,
          status: "completed",
          productionRecords: [
            { type: "completed", quantity: 80 },
            { type: "shipped", quantity: 35 },
          ],
        },
        productionRecords: [],
      },
    ]);

    const { container } = render(
      await MachinesPage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(
      screen.getByRole("button", { name: "新增机器" }),
    ).toBeInTheDocument();
    expect(container.querySelector("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("机器名称")).toBeInTheDocument();
    expect(screen.queryByLabelText("机器编号")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("型号")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("位置")).not.toBeInTheDocument();
    expect(container.querySelector("aside")).not.toBeInTheDocument();
    expect(container.querySelector("table")).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "今日加工" }),
    ).toHaveClass("whitespace-nowrap");
    expect(
      screen.getByRole("columnheader", { name: "今日出货" }),
    ).toHaveClass("whitespace-nowrap");
    expect(screen.getByRole("progressbar", { name: "出货量进度" })).toHaveAttribute(
      "aria-valuenow",
      "35",
    );
    expect(screen.getByRole("progressbar", { name: "加工量进度" })).toHaveAttribute(
      "aria-valuenow",
      "80",
    );
    expect(screen.getByText("出货量 35 / 100")).toBeInTheDocument();
    expect(screen.getByText("加工量 80 / 100")).toBeInTheDocument();
  });

  it("hides machine creation from employee users", async () => {
    authMock.requireUser.mockResolvedValue({
      id: "user-2",
      workspaceId: "workspace-1",
      username: "employee",
      displayName: "李四",
      role: "employee",
      workspace: { name: "精密加工一厂" },
    });
    machinesMock.listMachines.mockResolvedValue([]);

    render(
      await MachinesPage({
        searchParams: Promise.resolve({}),
      }),
    );

    expect(screen.queryByRole("button", { name: "新增机器" })).not.toBeInTheDocument();
  });
});
