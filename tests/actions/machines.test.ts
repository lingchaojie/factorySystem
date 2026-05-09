import { beforeEach, describe, expect, it, vi } from "vitest";

const { workspaceMock, machinesMock, recordsMock, cacheMock, navigationMock } =
  vi.hoisted(() => ({
    workspaceMock: {
      requireWorkspaceId: vi.fn(),
    },
    machinesMock: {
      createMachine: vi.fn(),
      linkMachineToOrder: vi.fn(),
    },
    recordsMock: {
      createProductionRecord: vi.fn(),
    },
    cacheMock: {
      revalidatePath: vi.fn(),
    },
    navigationMock: {
      redirect: vi.fn(),
    },
  }));

vi.mock("@/lib/workspace", () => workspaceMock);
vi.mock("@/server/services/machines", () => machinesMock);
vi.mock("@/server/services/records", () => recordsMock);
vi.mock("next/cache", () => cacheMock);
vi.mock("next/navigation", () => navigationMock);

describe("machine actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceMock.requireWorkspaceId.mockResolvedValue("workspace-1");
  });

  it("creates a machine with an active default status", async () => {
    const { createMachineAction } = await import("@/app/actions/machines");
    const form = new FormData();
    form.set("code", " 1 ");
    form.set("name", " 1号机 ");
    form.set("model", "VMC");
    form.set("location", "A区");
    form.set("notes", "主轴稳定");

    await createMachineAction(form);

    expect(machinesMock.createMachine).toHaveBeenCalledWith("workspace-1", {
      code: " 1 ",
      name: " 1号机 ",
      model: "VMC",
      location: "A区",
      status: "active",
      notes: "主轴稳定",
    });
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/machines");
    expect(navigationMock.redirect).toHaveBeenCalledWith("/machines");
  });

  it("rejects invalid machine status values before creating", async () => {
    const { createMachineAction } = await import("@/app/actions/machines");
    const form = new FormData();
    form.set("code", "1");
    form.set("name", "1号机");
    form.set("status", "offline");

    await expect(createMachineAction(form)).rejects.toThrow("机器状态无效");
    expect(machinesMock.createMachine).not.toHaveBeenCalled();
  });

  it("creates a record and revalidates dependent machine, order, and record pages", async () => {
    const { createMachineRecordAction } = await import("@/app/actions/machines");
    const form = new FormData();
    form.set("machineId", "machine-1");
    form.set("recordedAt", "2026-05-10T08:30");
    form.set("completedQuantity", "12");
    form.set("shippedQuantity", "4");
    form.set("notes", "白班");

    await createMachineRecordAction(form);

    expect(recordsMock.createProductionRecord).toHaveBeenCalledWith(
      "workspace-1",
      {
        machineId: "machine-1",
        recordedAt: new Date("2026-05-10T08:30"),
        completedQuantity: 12,
        shippedQuantity: 4,
        notes: "白班",
      },
    );
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/machines");
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/machines/machine-1");
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/orders");
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/records");
    expect(navigationMock.redirect).toHaveBeenCalledWith("/machines/machine-1");
  });
});
