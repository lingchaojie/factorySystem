import { beforeEach, describe, expect, it, vi } from "vitest";

const { workspaceMock, ordersMock, cacheMock, navigationMock } = vi.hoisted(
  () => ({
    workspaceMock: {
      requireWorkspaceId: vi.fn(),
    },
    ordersMock: {
      createOrder: vi.fn(),
      closeOrder: vi.fn(),
      reopenOrder: vi.fn(),
    },
    cacheMock: {
      revalidatePath: vi.fn(),
    },
    navigationMock: {
      redirect: vi.fn(),
    },
  }),
);

vi.mock("@/lib/workspace", () => workspaceMock);
vi.mock("@/server/services/orders", () => ordersMock);
vi.mock("next/cache", () => cacheMock);
vi.mock("next/navigation", () => navigationMock);

describe("order actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    workspaceMock.requireWorkspaceId.mockResolvedValue("workspace-1");
  });

  it("creates an order with a Shanghai business due date", async () => {
    const { createOrderAction } = await import("@/app/actions/orders");
    const form = new FormData();
    form.set("customerName", " 甲方工厂 ");
    form.set("orderNo", " MO-100 ");
    form.set("partName", " 法兰盘 ");
    form.set("plannedQuantity", "25");
    form.set("dueDate", "2026-05-10");
    form.set("notes", " 加急 ");

    await createOrderAction(form);

    expect(ordersMock.createOrder).toHaveBeenCalledWith("workspace-1", {
      customerName: " 甲方工厂 ",
      orderNo: " MO-100 ",
      partName: " 法兰盘 ",
      plannedQuantity: 25,
      dueDate: new Date("2026-05-09T16:00:00.000Z"),
      notes: " 加急 ",
    });
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/orders");
    expect(navigationMock.redirect).toHaveBeenCalledWith("/orders");
  });

  it("rejects non-positive planned quantities before creating", async () => {
    const { createOrderAction } = await import("@/app/actions/orders");
    const form = new FormData();
    form.set("customerName", "甲方工厂");
    form.set("partName", "法兰盘");
    form.set("plannedQuantity", "0");

    await expect(createOrderAction(form)).rejects.toThrow("计划数量必须大于 0");
    expect(ordersMock.createOrder).not.toHaveBeenCalled();
  });

  it("closes and reopens orders with list and detail revalidation", async () => {
    const { closeOrderAction, reopenOrderAction } = await import(
      "@/app/actions/orders"
    );
    const form = new FormData();
    form.set("orderId", "order-1");

    await closeOrderAction(form);
    await reopenOrderAction(form);

    expect(ordersMock.closeOrder).toHaveBeenCalledWith(
      "workspace-1",
      "order-1",
    );
    expect(ordersMock.reopenOrder).toHaveBeenCalledWith(
      "workspace-1",
      "order-1",
    );
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/orders");
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/orders/order-1");
    expect(navigationMock.redirect).toHaveBeenCalledWith("/orders/order-1");
  });
});
