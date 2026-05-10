import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/orders",
}));

describe("shared UI primitives", () => {
  it("renders dashboard navigation and logout form", async () => {
    const { AppShell } = await import("@/components/app-shell");

    render(
      <AppShell user={{ username: "operator" }}>
        <div>workspace content</div>
      </AppShell>,
    );

    expect(screen.getByText("workspace content")).toBeInTheDocument();
    expect(screen.getAllByText("operator").length).toBeGreaterThan(0);
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
    const logoutButton = screen.getAllByRole("button", { name: /退出/ })[0];
    expect(logoutButton).toBeInTheDocument();
    expect(
      logoutButton.closest("form"),
    ).toHaveAttribute("action", "/api/auth/logout");
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

  it("maps machine and order status labels", async () => {
    const { StatusBadge, machineStatusLabels, orderStatusLabels } = await import(
      "@/components/status-badge"
    );

    expect(machineStatusLabels.active).toBe("正常");
    expect(machineStatusLabels.maintenance).toBe("维护中");
    expect(orderStatusLabels.open).toBe("进行中");
    expect(orderStatusLabels.closed).toBe("已结单");

    render(
      <>
        <StatusBadge status="active" labels={machineStatusLabels} />
        <StatusBadge status="closed" labels={orderStatusLabels} />
      </>,
    );

    expect(screen.getByText("正常")).toBeInTheDocument();
    expect(screen.getByText("已结单")).toBeInTheDocument();
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
