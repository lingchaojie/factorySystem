import { beforeEach, describe, expect, it, vi } from "vitest";

const { adminAuthMock, platformAdminMock, cacheMock, navigationMock } =
  vi.hoisted(() => ({
    adminAuthMock: {
      requirePlatformAdmin: vi.fn(),
    },
    platformAdminMock: {
      createCustomerUser: vi.fn(),
      createPlatformAdmin: vi.fn(),
      createWorkspaceWithInitialAccount: vi.fn(),
      updateCustomerUser: vi.fn(),
    },
    cacheMock: {
      revalidatePath: vi.fn(),
    },
    navigationMock: {
      redirect: vi.fn(),
    },
  }));

vi.mock("@/lib/admin-auth", () => adminAuthMock);
vi.mock("@/server/services/platform-admin", () => platformAdminMock);
vi.mock("next/cache", () => cacheMock);
vi.mock("next/navigation", () => navigationMock);

describe("admin actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminAuthMock.requirePlatformAdmin.mockResolvedValue({
      id: "admin-1",
      username: "root",
      displayName: "平台管理员",
    });
  });

  it("creates a workspace with an initial customer account", async () => {
    const { createWorkspaceWithInitialAccountAction } = await import(
      "@/app/admin/actions"
    );
    const form = new FormData();
    form.set("workspaceName", "精密加工一厂");
    form.set("username", "factory001");
    form.set("displayName", "王经理");
    form.set("password", "secret123");
    form.set("role", "manager");

    await createWorkspaceWithInitialAccountAction(form);

    expect(
      platformAdminMock.createWorkspaceWithInitialAccount,
    ).toHaveBeenCalledWith({
      workspaceName: "精密加工一厂",
      username: "factory001",
      displayName: "王经理",
      password: "secret123",
      role: "manager",
    });
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/admin");
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/admin/workspaces");
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/admin/accounts");
    expect(navigationMock.redirect).toHaveBeenCalledWith("/admin/workspaces");
  });

  it("creates another customer account under an existing workspace", async () => {
    const { createCustomerUserAction } = await import("@/app/admin/actions");
    const form = new FormData();
    form.set("workspaceId", "workspace-1");
    form.set("username", "operator002");
    form.set("displayName", "李四");
    form.set("password", "secret123");
    form.set("role", "employee");

    await createCustomerUserAction(form);

    expect(platformAdminMock.createCustomerUser).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      username: "operator002",
      displayName: "李四",
      password: "secret123",
      role: "employee",
    });
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/admin/accounts");
    expect(navigationMock.redirect).toHaveBeenCalledWith("/admin/accounts");
  });

  it("updates an existing customer account and optional visible password", async () => {
    const { updateCustomerUserAction } = await import("@/app/admin/actions");
    const form = new FormData();
    form.set("userId", "user-1");
    form.set("workspaceId", "workspace-2");
    form.set("username", "operator002");
    form.set("displayName", "李四");
    form.set("password", "new-secret");
    form.set("role", "manager");

    await updateCustomerUserAction(form);

    expect(platformAdminMock.updateCustomerUser).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "workspace-2",
      username: "operator002",
      displayName: "李四",
      password: "new-secret",
      role: "manager",
    });
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/admin");
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/admin/workspaces");
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/admin/accounts");
    expect(navigationMock.redirect).toHaveBeenCalledWith("/admin/accounts");
  });

  it("creates another platform admin account", async () => {
    const { createPlatformAdminAction } = await import("@/app/admin/actions");
    const form = new FormData();
    form.set("username", "ops2");
    form.set("displayName", "运维二号");
    form.set("password", "secret123");

    await createPlatformAdminAction(form);

    expect(platformAdminMock.createPlatformAdmin).toHaveBeenCalledWith({
      username: "ops2",
      displayName: "运维二号",
      password: "secret123",
    });
    expect(cacheMock.revalidatePath).toHaveBeenCalledWith("/admin/admins");
    expect(navigationMock.redirect).toHaveBeenCalledWith("/admin/admins");
  });
});
