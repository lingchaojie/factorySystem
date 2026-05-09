import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, sessionMock } = vi.hoisted(() => ({
  authMock: {
    loginWithPassword: vi.fn(),
  },
  sessionMock: {
    destroyCurrentSession: vi.fn(),
    sessionCookieName: "factory_session",
  },
}));

vi.mock("@/lib/auth", () => authMock);

vi.mock("@/lib/session", () => sessionMock);

describe("auth route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses a GET redirect after successful login form POST", async () => {
    authMock.loginWithPassword.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      username: "operator",
      passwordHash: "hash",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const { POST } = await import("@/app/api/auth/login/route");
    const form = new FormData();
    form.set("username", "operator");
    form.set("password", "correct-password");

    const response = await POST(
      new Request("http://factory.test/api/auth/login", {
        method: "POST",
        body: form,
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://factory.test/machines");
  });

  it("uses a GET redirect after logout form POST", async () => {
    const { POST } = await import("@/app/api/auth/logout/route");

    const response = await POST(
      new Request("http://factory.test/api/auth/logout", { method: "POST" }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://factory.test/login");
    expect(sessionMock.destroyCurrentSession).toHaveBeenCalledTimes(1);
  });
});
