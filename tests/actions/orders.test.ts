import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, ordersMock, drawingsMock, cacheMock, navigationMock } =
  vi.hoisted(() => ({
    authMock: {
      requireManager: vi.fn(),
    },
    ordersMock: {
      createOrder: vi.fn(),
      deleteOrder: vi.fn(),
      updateOrderDetails: vi.fn(),
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

vi.mock("@/lib/auth", () => authMock);
vi.mock("@/server/services/orders", () => ordersMock);
vi.mock("@/server/services/order-drawings", () => drawingsMock);
vi.mock("next/cache", () => cacheMock);
vi.mock("next/navigation", () => navigationMock);

describe("order actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    authMock.requireManager.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      username: "manager",
      displayName: "王经理",
      role: "manager",
      workspace: { name: "精密加工一厂" },
    });
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

  it("passes selected machines when creating an order", async () => {
    const { createOrderAction } = await import("@/app/actions/orders");
    ordersMock.createOrder.mockResolvedValue({ id: "order-new" });
    const form = new FormData();
    form.set("customerName", "甲方工厂");
    form.set("partName", "法兰盘");
    form.append("machineId", "machine-1");
    form.append("machineId", " ");
    form.append("machineId", "machine-2");
    form.append("machineId", "machine-1");

    await createOrderAction(form);

    expect(ordersMock.createOrder).toHaveBeenCalledWith("workspace-1", {
      customerName: "甲方工厂",
      partName: "法兰盘",
      plannedQuantity: null,
      unitPriceCents: null,
      dueDate: null,
      notes: "",
      machineIds: ["machine-1", "machine-2"],
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

  it("rejects employee attempts to create orders", async () => {
    authMock.requireManager.mockRejectedValue(new Error("需要经理权限"));
    const { createOrderAction } = await import("@/app/actions/orders");
    const form = new FormData();
    form.set("customerName", "甲方工厂");
    form.set("partName", "法兰盘");

    await expect(createOrderAction(form)).rejects.toThrow("需要经理权限");
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

  it("updates editable order details and status together", async () => {
    const { updateOrderDetailsAction } = await import("@/app/actions/orders");
    const form = new FormData();
    form.set("orderId", "order-1");
    form.set("customerName", " 甲方新厂 ");
    form.set("partName", " 新法兰 ");
    form.set("plannedQuantity", "50");
    form.set("unitPrice", "18.88");
    form.set("dueDate", "2026-05-12");
    form.set("status", "completed");
    form.set("notes", " 改价 ");

    await updateOrderDetailsAction(form);

    expect(ordersMock.updateOrderDetails).toHaveBeenCalledWith(
      "workspace-1",
      "order-1",
      {
        customerName: " 甲方新厂 ",
        partName: " 新法兰 ",
        plannedQuantity: 50,
        unitPriceCents: 1888,
        dueDate: new Date("2026-05-11T16:00:00.000Z"),
        status: "completed",
        notes: " 改价 ",
      },
    );
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/orders");
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/orders/order-1");
    expect(navigationMock.redirect).toHaveBeenCalledWith("/orders/order-1");
  });

  it("rejects employee attempts to update order details", async () => {
    authMock.requireManager.mockRejectedValue(new Error("需要经理权限"));
    const { updateOrderDetailsAction } = await import("@/app/actions/orders");
    const form = new FormData();
    form.set("orderId", "order-1");
    form.set("customerName", "甲方工厂");
    form.set("partName", "法兰盘");

    await expect(updateOrderDetailsAction(form)).rejects.toThrow("需要经理权限");
    expect(ordersMock.updateOrderDetails).not.toHaveBeenCalled();
  });

  it("rejects employee attempts to update order status", async () => {
    authMock.requireManager.mockRejectedValue(new Error("需要经理权限"));
    const { updateOrderStatusAction } = await import("@/app/actions/orders");
    const form = new FormData();
    form.set("orderId", "order-1");
    form.set("status", "completed");

    await expect(updateOrderStatusAction(form)).rejects.toThrow("需要经理权限");
    expect(ordersMock.updateOrderStatus).not.toHaveBeenCalled();
  });

  it("deletes an order as manager", async () => {
    const { deleteOrderAction } = await import("@/app/actions/orders");
    const form = new FormData();
    form.set("orderId", "order-1");

    await deleteOrderAction(form);

    expect(ordersMock.deleteOrder).toHaveBeenCalledWith("workspace-1", "order-1");
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/orders");
    expect(navigationMock.redirect).toHaveBeenCalledWith("/orders");
  });

  it("rejects employee attempts to delete orders", async () => {
    authMock.requireManager.mockRejectedValue(new Error("需要经理权限"));
    const { deleteOrderAction } = await import("@/app/actions/orders");
    const form = new FormData();
    form.set("orderId", "order-1");

    await expect(deleteOrderAction(form)).rejects.toThrow("需要经理权限");
    expect(ordersMock.deleteOrder).not.toHaveBeenCalled();
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

  it("rejects employee attempts to upload drawings", async () => {
    authMock.requireManager.mockRejectedValue(new Error("需要经理权限"));
    const { uploadOrderDrawingsAction } = await import("@/app/actions/orders");
    const form = new FormData();
    form.set("orderId", "order-1");
    form.append("drawings", new File(["step"], "fixture.step"));

    await expect(uploadOrderDrawingsAction(form)).rejects.toThrow("需要经理权限");
    expect(drawingsMock.replaceOrderDrawings).not.toHaveBeenCalled();
  });
});
