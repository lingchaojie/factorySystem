import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminAccountsPage from "@/app/admin/(console)/accounts/page";

const { platformAdminMock, actionsMock } = vi.hoisted(() => ({
  platformAdminMock: {
    listAdminWorkspaces: vi.fn(),
    listCustomerAccounts: vi.fn(),
  },
  actionsMock: {
    createCustomerUserAction: vi.fn(),
    updateCustomerUserAction: vi.fn(),
  },
}));

vi.mock("@/server/services/platform-admin", () => platformAdminMock);
vi.mock("@/app/admin/actions", () => actionsMock);

describe("admin customer accounts page", () => {
  it("shows customer visible passwords and account edit controls", async () => {
    platformAdminMock.listAdminWorkspaces.mockResolvedValue([
      { id: "workspace-1", name: "精密加工一厂" },
      { id: "workspace-2", name: "精密加工二厂" },
    ]);
    platformAdminMock.listCustomerAccounts.mockResolvedValue([
      {
        id: "user-1",
        workspaceId: "workspace-1",
        username: "operator001",
        displayName: "李四",
        role: "employee",
        passwordPlaintext: "secret123",
        workspace: { id: "workspace-1", name: "精密加工一厂" },
      },
    ]);

    const { container } = render(await AdminAccountsPage());

    expect(
      screen.getByRole("columnheader", { name: "可见密码" }),
    ).toBeInTheDocument();
    expect(screen.getByText("secret123")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "编辑账号" }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("operator001")).toBeInTheDocument();
    expect(screen.getByDisplayValue("李四")).toBeInTheDocument();
    expect(screen.getByLabelText("新密码（留空不修改）")).not.toBeRequired();
    expect(
      container.querySelector('input[type="hidden"][name="userId"]'),
    ).toHaveValue("user-1");
  });

  it("marks old accounts without a stored visible password", async () => {
    platformAdminMock.listAdminWorkspaces.mockResolvedValue([
      { id: "workspace-1", name: "精密加工一厂" },
    ]);
    platformAdminMock.listCustomerAccounts.mockResolvedValue([
      {
        id: "user-1",
        workspaceId: "workspace-1",
        username: "operator001",
        displayName: "李四",
        role: "employee",
        passwordPlaintext: null,
        workspace: { id: "workspace-1", name: "精密加工一厂" },
      },
    ]);

    render(await AdminAccountsPage());

    expect(screen.getByText("未保存，可重置")).toBeInTheDocument();
  });
});
