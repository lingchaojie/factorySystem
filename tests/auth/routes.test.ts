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
    delete process.env.APP_ORIGIN;
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

  it("does not use cross-origin form headers for login redirects", async () => {
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
        headers: { origin: "https://evil.test" },
        body: form,
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://factory.test/machines");
  });

  it("does not use forwarded host headers for login redirects", async () => {
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
        headers: {
          "x-forwarded-host": "evil.test",
          "x-forwarded-proto": "https",
        },
        body: form,
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://factory.test/machines");
  });

  it("uses the browser host when the dev server request URL is 0.0.0.0", async () => {
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
      new Request("http://0.0.0.0:3000/api/auth/login", {
        method: "POST",
        headers: { host: "localhost:3000" },
        body: form,
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/machines",
    );
  });

  it("uses the configured app origin for login redirects", async () => {
    process.env.APP_ORIGIN = "http://127.0.0.1:3000";
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
      new Request("http://0.0.0.0:3000/api/auth/login", {
        method: "POST",
        headers: {
          "x-forwarded-host": "evil.test",
          "x-forwarded-proto": "https",
        },
        body: form,
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "http://127.0.0.1:3000/machines",
    );
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

  it("uses the browser host for logout redirects when the request URL is 0.0.0.0", async () => {
    const { POST } = await import("@/app/api/auth/logout/route");

    const response = await POST(
      new Request("http://0.0.0.0:3000/api/auth/logout", {
        method: "POST",
        headers: { host: "localhost:3000" },
      }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
    expect(sessionMock.destroyCurrentSession).toHaveBeenCalledTimes(1);
  });
});
