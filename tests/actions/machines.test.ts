import { beforeEach, describe, expect, it, vi } from "vitest";

const { workspaceMock, authMock, machinesMock, recordsMock, cacheMock, navigationMock } =
  vi.hoisted(() => ({
    workspaceMock: {
      requireWorkspaceId: vi.fn(),
    },
    authMock: {
      requireUser: vi.fn(),
    },
    machinesMock: {
      createMachine: vi.fn(),
      linkMachineToOrder: vi.fn(),
      updateMachine: vi.fn(),
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
vi.mock("@/lib/auth", () => authMock);
vi.mock("@/server/services/machines", () => machinesMock);
vi.mock("@/server/services/records", () => recordsMock);
vi.mock("next/cache", () => cacheMock);
vi.mock("next/navigation", () => navigationMock);

describe("machine actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    workspaceMock.requireWorkspaceId.mockResolvedValue("workspace-1");
    authMock.requireUser.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      username: "operator",
      displayName: "张三",
      role: "employee",
      workspace: { name: "精密加工一厂" },
    });
  });

  it("creates a machine with a machine name and active default status", async () => {
    const { createMachineAction } = await import("@/app/actions/machines");
    const form = new FormData();
    form.set("code", " 1号机 ");
    form.set("notes", "主轴稳定");

    await createMachineAction(form);

    expect(machinesMock.createMachine).toHaveBeenCalledWith("workspace-1", {
      code: " 1号机 ",
      name: "1号机",
      model: "",
      location: "",
      status: "active",
      notes: "主轴稳定",
    });
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/machines");
    expect(navigationMock.redirect).toHaveBeenCalledWith("/machines");
  });

  it("passes the selected machine status when creating", async () => {
    const { createMachineAction } = await import("@/app/actions/machines");
    const form = new FormData();
    form.set("code", " 15号机 ");
    form.set("status", "idle");
    form.set("notes", "备用");

    await createMachineAction(form);

    expect(machinesMock.createMachine).toHaveBeenCalledWith("workspace-1", {
      code: " 15号机 ",
      name: "15号机",
      model: "",
      location: "",
      status: "idle",
      notes: "备用",
    });
  });

  it("rejects invalid machine status values before creating", async () => {
    const { createMachineAction } = await import("@/app/actions/machines");
    const form = new FormData();
    form.set("code", "1号机");
    form.set("status", "offline");

    await expect(createMachineAction(form)).rejects.toThrow("机器状态无效");
    expect(machinesMock.createMachine).not.toHaveBeenCalled();
  });

  it("updates machine status and notes from the detail page", async () => {
    const { updateMachineAction } = await import("@/app/actions/machines");
    const form = new FormData();
    form.set("machineId", "machine-1");
    form.set("status", "maintenance");
    form.set("notes", "等待换刀");

    await updateMachineAction(form);

    expect(machinesMock.updateMachine).toHaveBeenCalledWith(
      "workspace-1",
      "machine-1",
      {
        status: "maintenance",
        notes: "等待换刀",
      },
    );
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/machines");
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/machines/machine-1");
    expect(navigationMock.redirect).toHaveBeenCalledWith("/machines/machine-1");
  });

  it("rejects invalid machine status values before updating", async () => {
    const { updateMachineAction } = await import("@/app/actions/machines");
    const form = new FormData();
    form.set("machineId", "machine-1");
    form.set("status", "offline");

    await expect(updateMachineAction(form)).rejects.toThrow("机器状态无效");
    expect(machinesMock.updateMachine).not.toHaveBeenCalled();
  });

  it("creates a record and revalidates dependent machine, order, and record pages", async () => {
    vi.stubEnv("TZ", "UTC");
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
        recordedAt: new Date("2026-05-10T00:30:00.000Z"),
        completedQuantity: 12,
        shippedQuantity: 4,
        notes: "白班",
        actorUserId: "user-1",
      },
    );
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/machines");
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/machines/machine-1");
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/orders");
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/records");
    expect(navigationMock.redirect).toHaveBeenCalledWith("/machines/machine-1");
  });
});
