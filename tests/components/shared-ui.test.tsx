import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/orders",
}));

describe("shared UI primitives", () => {
  it("renders dashboard navigation and logout form", async () => {
    const { AppShell } = await import("@/components/app-shell");

    render(
      <AppShell
        user={{
          username: "operator",
          displayName: "张三",
          role: "manager",
          workspaceName: "精密加工一厂",
        }}
      >
        <div>workspace content</div>
      </AppShell>,
    );

    expect(screen.getByText("workspace content")).toBeInTheDocument();
    expect(screen.getAllByText("精密加工一厂").length).toBeGreaterThan(0);
    expect(screen.getAllByText("张三").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /机器/ })[0]).toHaveAttribute(
      "href",
      "/machines",
    );
    expect(screen.getAllByRole("link", { name: /订单/ })[0]).toHaveAttribute(
      "href",
      "/orders",
    );
    expect(screen.getAllByRole("link", { name: /记录/ })[0]).toHaveAttribute(
      "href",
      "/records",
    );
    expect(screen.getAllByRole("link", { name: /经营/ })[0]).toHaveAttribute(
      "href",
      "/analytics",
    );
    const logoutButton = screen.getAllByRole("button", { name: /退出/ })[0];
    expect(logoutButton).toBeInTheDocument();
    expect(
      logoutButton.closest("form"),
    ).toHaveAttribute("action", "/api/auth/logout");
  });

  it("hides manager-only navigation for employee accounts", async () => {
    const { AppShell } = await import("@/components/app-shell");

    render(
      <AppShell
        user={{
          username: "operator",
          displayName: "李四",
          role: "employee",
          workspaceName: "精密加工二厂",
        }}
      >
        <div>employee content</div>
      </AppShell>,
    );

    expect(screen.getByText("employee content")).toBeInTheDocument();
    expect(screen.getAllByText("精密加工二厂").length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /经营/ })).not.toBeInTheDocument();
  });

  it("renders labeled native form controls", async () => {
    const {
      DateInput,
      NumberInput,
      SelectInput,
      SubmitButton,
      TextInput,
      Textarea,
    } = await import("@/components/forms");

    render(
      <form>
        <TextInput label="机器名称" name="name" defaultValue="1号机" />
        <NumberInput label="计划数量" name="plannedQuantity" min={0} />
        <DateInput label="交期" name="dueDate" />
        <Textarea label="备注" name="notes" />
        <SelectInput
          label="状态"
          name="status"
          options={[
            { value: "active", label: "正常" },
            { value: "idle", label: "空闲" },
          ]}
        />
        <SubmitButton>保存</SubmitButton>
      </form>,
    );

    expect(screen.getByLabelText("机器名称")).toHaveAttribute("name", "name");
    expect(screen.getByLabelText("计划数量")).toHaveAttribute("type", "number");
    expect(screen.getByLabelText("交期")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("备注").tagName).toBe("TEXTAREA");
    expect(screen.getByLabelText("状态")).toHaveValue("active");
    expect(screen.getByRole("button", { name: "保存" })).toHaveAttribute(
      "type",
      "submit",
    );
  });

  it("renders searchable dropdown multi-select controls", async () => {
    const { MultiSelectInput } = await import("@/components/forms");

    const { container } = render(
      <form>
        <MultiSelectInput
          label="订单"
          name="orderId"
          selectedValues={["order-2"]}
          options={[
            { value: "order-1", label: "MO-1 / 法兰" },
            { value: "order-2", label: "MO-2 / 底座" },
          ]}
        />
      </form>,
    );

    expect(screen.getByRole("button", { name: "订单：MO-2 / 底座" })).toBeInTheDocument();
    expect(container.querySelector('input[type="hidden"][name="orderId"]')).toHaveValue("order-2");

    fireEvent.click(screen.getByRole("button", { name: "订单：MO-2 / 底座" }));
    const searchInput = screen.getByPlaceholderText("搜索订单");
    searchInput.focus();
    expect(searchInput).toHaveFocus();
    fireEvent.change(searchInput, { target: { value: "法兰" } });

    const listbox = screen.getByRole("listbox", { name: "订单" });
    expect(within(listbox).getByText("MO-1 / 法兰")).toBeInTheDocument();
    expect(within(listbox).queryByText("MO-2 / 底座")).not.toBeInTheDocument();
  });

  it("maps machine and order status labels", async () => {
    const { StatusBadge, machineStatusLabels, orderStatusLabels } = await import(
      "@/components/status-badge"
    );

    expect(machineStatusLabels.active).toBe("正常");
    expect(machineStatusLabels.maintenance).toBe("维护中");
    expect(orderStatusLabels.development_pending).toBe("待开发");
    expect(orderStatusLabels.processing_pending).toBe("待加工");
    expect(orderStatusLabels.in_progress).toBe("进行中");
    expect(orderStatusLabels.completed).toBe("完成");

    render(
      <>
        <StatusBadge status="active" labels={machineStatusLabels} />
        <StatusBadge status="completed" labels={orderStatusLabels} />
      </>,
    );

    expect(screen.getByText("正常")).toBeInTheDocument();
    expect(screen.getByText("完成")).toBeInTheDocument();
  });

  it("renders shipped and completed quantity progress bars", async () => {
    const { OrderProgressBars } = await import("@/components/order-progress-bars");

    render(
      <OrderProgressBars
        plannedQuantity={100}
        shippedQuantity={35}
        completedQuantity={80}
      />,
    );

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
    expect(screen.queryByRole("button", { name: /出货进度/ })).not.toBeInTheDocument();
  });

  it("renders order progress bars with dash plan text when an order has no plan", async () => {
    const { OrderProgressBars } = await import("@/components/order-progress-bars");

    render(
      <OrderProgressBars
        plannedQuantity={null}
        shippedQuantity={35}
        completedQuantity={80}
      />,
    );

    expect(screen.getByRole("progressbar", { name: "出货量进度" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    expect(screen.getByRole("progressbar", { name: "加工量进度" })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    expect(screen.getByText("出货量 35 / -")).toBeInTheDocument();
    expect(screen.getByText("加工量 80 / -")).toBeInTheDocument();
  });

  it("centers create dialogs in the viewport", async () => {
    const { CreateEntityDialog } = await import(
      "@/components/create-entity-dialog"
    );
    const { container } = render(
      <CreateEntityDialog buttonLabel="新增机器" title="新增机器">
        <div>form content</div>
      </CreateEntityDialog>,
    );

    expect(screen.getByRole("button", { name: "新增机器" })).toBeInTheDocument();
    expect(container.querySelector("dialog")).toHaveClass(
      "fixed",
      "left-1/2",
      "top-1/2",
      "-translate-x-1/2",
      "-translate-y-1/2",
    );
  });
});
