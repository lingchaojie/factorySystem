import { beforeEach, describe, expect, it, vi } from "vitest";

const { workspaceMock, recordsMock, cacheMock } = vi.hoisted(() => ({
  workspaceMock: {
    requireWorkspaceId: vi.fn(),
  },
  recordsMock: {
    updateProductionRecord: vi.fn(),
    deleteProductionRecord: vi.fn(),
  },
  cacheMock: {
    revalidatePath: vi.fn(),
  },
}));

vi.mock("@/lib/workspace", () => workspaceMock);
vi.mock("@/server/services/records", () => recordsMock);
vi.mock("next/cache", () => cacheMock);

describe("record actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.stubEnv("TZ", "UTC");
    workspaceMock.requireWorkspaceId.mockResolvedValue("workspace-1");
  });

  it("updates a record with Shanghai datetime parsing and dependent revalidation", async () => {
    recordsMock.updateProductionRecord.mockResolvedValue({
      id: "record-1",
      machineId: "machine-1",
      orderId: "order-1",
    });
    const { updateRecordAction } = await import("@/app/actions/records");
    const form = new FormData();
    form.set("recordId", "record-1");
    form.set("recordedAt", "2026-05-10T08:30");
    form.set("completedQuantity", "12");
    form.set("shippedQuantity", "4");
    form.set("notes", "白班");

    await updateRecordAction(form);

    expect(recordsMock.updateProductionRecord).toHaveBeenCalledWith(
      "workspace-1",
      "record-1",
      {
        recordedAt: new Date("2026-05-10T00:30:00.000Z"),
        completedQuantity: 12,
        shippedQuantity: 4,
        notes: "白班",
      },
    );
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/records");
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/orders");
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/machines");
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/orders/order-1");
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/machines/machine-1");
  });

  it("deletes a record and revalidates dependent pages from the deleted row", async () => {
    recordsMock.deleteProductionRecord.mockResolvedValue({
      id: "record-1",
      machineId: "machine-1",
      orderId: "order-1",
    });
    const { deleteRecordAction } = await import("@/app/actions/records");
    const form = new FormData();
    form.set("recordId", "record-1");

    await deleteRecordAction(form);

    expect(recordsMock.deleteProductionRecord).toHaveBeenCalledWith(
      "workspace-1",
      "record-1",
    );
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/records");
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/orders/order-1");
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/machines/machine-1");
  });
});
