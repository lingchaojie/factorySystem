import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MachinesPage from "@/app/(dashboard)/machines/page";

const { workspaceMock, machinesMock, actionsMock } = vi.hoisted(() => ({
  workspaceMock: {
    requireWorkspaceId: vi.fn(),
  },
  machinesMock: {
    listMachines: vi.fn(),
  },
  actionsMock: {
    createMachineAction: vi.fn(),
  },
}));

vi.mock("@/lib/workspace", () => workspaceMock);
vi.mock("@/server/services/machines", () => machinesMock);
vi.mock("@/app/actions/machines", () => actionsMock);

describe("machines page", () => {
  it("uses a dialog for machine creation and keeps the table full width", async () => {
    workspaceMock.requireWorkspaceId.mockResolvedValue("workspace-1");
    machinesMock.listMachines.mockResolvedValue([
      {
        id: "machine-1",
        code: "1",
        name: "1",
        model: null,
        location: null,
        status: "active",
        currentOrder: null,
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
    expect(screen.getByLabelText("机器编号")).toBeInTheDocument();
    expect(screen.queryByLabelText("机器名称")).not.toBeInTheDocument();
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
  });
});
