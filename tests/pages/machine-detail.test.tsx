import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MachineDetailPage from "@/app/(dashboard)/machines/[id]/page";

const { workspaceMock, machinesMock, ordersMock } = vi.hoisted(() => ({
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

vi.mock("@/lib/workspace", () => workspaceMock);
vi.mock("@/server/services/machines", () => machinesMock);
vi.mock("@/server/services/orders", () => ordersMock);

describe("machine detail page", () => {
  it("disables record entry when the current order is closed", async () => {
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
        partName: "法兰",
        status: "closed",
      },
      productionRecords: [],
    });

    render(
      await MachineDetailPage({
        params: Promise.resolve({ id: "machine-1" }),
      }),
    );

    expect(
      screen.getByText("当前订单已关闭，请关联进行中的订单或重开订单后再录入。"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("记录时间")).toBeDisabled();
    expect(screen.getByLabelText("加工数量")).toBeDisabled();
    expect(screen.getByLabelText("出货数量")).toBeDisabled();
    expect(screen.getByLabelText("备注")).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存记录" })).toBeDisabled();
  });
});
