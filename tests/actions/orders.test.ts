import { beforeEach, describe, expect, it, vi } from "vitest";

const { workspaceMock, ordersMock, drawingsMock, cacheMock, navigationMock } =
  vi.hoisted(() => ({
    workspaceMock: {
      requireWorkspaceId: vi.fn(),
    },
    ordersMock: {
      createOrder: vi.fn(),
      updateOrderStatus: vi.fn(),
    },
    drawingsMock: {
      replaceOrderDrawings: vi.fn(),
    },
    cacheMock: {
      revalidatePath: vi.fn(),
    },
    navigationMock: {
      redirect: vi.fn(),
    },
  }));

vi.mock("@/lib/workspace", () => workspaceMock);
vi.mock("@/server/services/orders", () => ordersMock);
vi.mock("@/server/services/order-drawings", () => drawingsMock);
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
    ordersMock.createOrder.mockResolvedValue({ id: "order-new" });
    const form = new FormData();
    form.set("customerName", " 甲方工厂 ");
    form.set("orderNo", " MO-100 ");
    form.set("partName", " 法兰盘 ");
    form.set("plannedQuantity", "25");
    form.set("unitPrice", "12.34");
    form.set("dueDate", "2026-05-10");
    form.set("notes", " 加急 ");

    await createOrderAction(form);

    expect(ordersMock.createOrder).toHaveBeenCalledWith("workspace-1", {
      customerName: " 甲方工厂 ",
      partName: " 法兰盘 ",
      plannedQuantity: 25,
      unitPriceCents: 1234,
      dueDate: new Date("2026-05-09T16:00:00.000Z"),
      notes: " 加急 ",
    });
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/orders");
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/orders/order-new");
    expect(navigationMock.redirect).toHaveBeenCalledWith("/orders");
  });

  it("creates an order without planned quantity", async () => {
    const { createOrderAction } = await import("@/app/actions/orders");
    ordersMock.createOrder.mockResolvedValue({ id: "order-new" });
    const form = new FormData();
    form.set("customerName", "甲方工厂");
    form.set("partName", "法兰盘");
    form.set("plannedQuantity", "");
    form.set("unitPrice", "");

    await createOrderAction(form);

    expect(ordersMock.createOrder).toHaveBeenCalledWith("workspace-1", {
      customerName: "甲方工厂",
      partName: "法兰盘",
      plannedQuantity: null,
      unitPriceCents: null,
      dueDate: null,
      notes: "",
    });
  });

  it("rejects non-positive planned quantities when provided", async () => {
    const { createOrderAction } = await import("@/app/actions/orders");
    const form = new FormData();
    form.set("customerName", "甲方工厂");
    form.set("partName", "法兰盘");
    form.set("plannedQuantity", "0");

    await expect(createOrderAction(form)).rejects.toThrow("计划数量必须大于 0");
    expect(ordersMock.createOrder).not.toHaveBeenCalled();
  });

  it("rejects unit prices with more than two decimals", async () => {
    const { createOrderAction } = await import("@/app/actions/orders");
    const form = new FormData();
    form.set("customerName", "甲方工厂");
    form.set("partName", "法兰盘");
    form.set("plannedQuantity", "10");
    form.set("unitPrice", "12.345");

    await expect(createOrderAction(form)).rejects.toThrow(
      "单价最多保留两位小数",
    );
    expect(ordersMock.createOrder).not.toHaveBeenCalled();
  });

  it("updates order status with list and detail revalidation", async () => {
    const { updateOrderStatusAction } = await import("@/app/actions/orders");
    const form = new FormData();
    form.set("orderId", "order-1");
    form.set("status", "completed");

    await updateOrderStatusAction(form);

    expect(ordersMock.updateOrderStatus).toHaveBeenCalledWith(
      "workspace-1",
      "order-1",
      "completed",
    );
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/orders");
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/orders/order-1");
    expect(navigationMock.redirect).toHaveBeenCalledWith("/orders/order-1");
  });

  it("rejects invalid manual order statuses before updating", async () => {
    const { updateOrderStatusAction } = await import("@/app/actions/orders");
    const form = new FormData();
    form.set("orderId", "order-1");
    form.set("status", "closed");

    await expect(updateOrderStatusAction(form)).rejects.toThrow("订单状态无效");
    expect(ordersMock.updateOrderStatus).not.toHaveBeenCalled();
  });

  it("uploads drawings in overwrite mode and revalidates the order detail", async () => {
    const { uploadOrderDrawingsAction } = await import("@/app/actions/orders");
    drawingsMock.replaceOrderDrawings.mockResolvedValue([]);
    const file = new File(["step"], "fixture.step", { type: "model/step" });
    const form = new FormData();
    form.set("orderId", "order-1");
    form.append("drawings", file);

    await uploadOrderDrawingsAction(form);

    expect(drawingsMock.replaceOrderDrawings).toHaveBeenCalledWith(
      "workspace-1",
      "order-1",
      [file],
    );
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/orders");
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/orders/order-1");
    expect(navigationMock.redirect).toHaveBeenCalledWith("/orders/order-1");
  });
});
