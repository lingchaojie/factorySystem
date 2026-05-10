import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookiesStore, prismaMock } = vi.hoisted(() => ({
  cookiesStore: {
    set: vi.fn(),
  },
  prismaMock: {
    user: {
      findUnique: vi.fn(),
    },
    session: {
      create: vi.fn(),
    },
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => cookiesStore),
}));

vi.mock("@/lib/db", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/password", () => ({
  verifyPassword: vi.fn(async (password: string) => password === "correct-password"),
}));

describe("loginWithPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.NODE_ENV;
    delete process.env.SESSION_COOKIE_SECURE;
    process.env.SESSION_TTL_DAYS = "14";
  });

  it("logs in by globally unique username and returns role and workspace context", async () => {
    const user = {
      id: "user-1",
      workspaceId: "workspace-1",
      username: "operator",
      displayName: "张三",
      role: "manager",
      passwordHash: "stored-hash",
      createdAt: new Date(),
      updatedAt: new Date(),
      workspace: { name: "精密加工一厂" },
    };
    prismaMock.user.findUnique.mockResolvedValue(user);
    prismaMock.session.create.mockResolvedValue({
      id: "session-1",
      userId: user.id,
      tokenHash: "hashed",
      expiresAt: new Date(),
      createdAt: new Date(),
    });

    const { loginWithPassword } = await import("@/lib/auth");
    const { sessionCookieName } = await import("@/lib/session");

    const result = await loginWithPassword("operator", "correct-password");

    expect(result).toEqual({
      id: user.id,
      workspaceId: user.workspaceId,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      workspace: user.workspace,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
    expect(result).not.toHaveProperty("passwordHash");
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { username: "operator" },
      select: expect.objectContaining({
        id: true,
        workspaceId: true,
        username: true,
        displayName: true,
        role: true,
        workspace: { select: { name: true } },
        passwordHash: true,
      }),
    });
    expect(prismaMock.session.create).toHaveBeenCalledTimes(1);
    expect(cookiesStore.set).toHaveBeenCalledWith(
      sessionCookieName,
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 14,
      }),
    );
  });

  it("does not create a session or set a cookie when credentials are invalid", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      username: "operator",
      displayName: "张三",
      role: "manager",
      passwordHash: "stored-hash",
      createdAt: new Date(),
      updatedAt: new Date(),
      workspace: { name: "精密加工一厂" },
    });

    const { loginWithPassword } = await import("@/lib/auth");

    await expect(loginWithPassword("operator", "wrong-password")).resolves.toBe(
      null,
    );
    expect(prismaMock.session.create).not.toHaveBeenCalled();
    expect(cookiesStore.set).not.toHaveBeenCalled();
  });

  it("allows the session cookie secure flag to be configured for HTTP deployments", async () => {
    process.env.NODE_ENV = "production";
    process.env.SESSION_COOKIE_SECURE = "false";
    const user = {
      id: "user-1",
      workspaceId: "workspace-1",
      username: "operator",
      displayName: "张三",
      role: "manager",
      passwordHash: "stored-hash",
      createdAt: new Date(),
      updatedAt: new Date(),
      workspace: { name: "精密加工一厂" },
    };
    prismaMock.user.findUnique.mockResolvedValue(user);
    prismaMock.session.create.mockResolvedValue({
      id: "session-1",
      userId: user.id,
      tokenHash: "hashed",
      expiresAt: new Date(),
      createdAt: new Date(),
    });

    const { loginWithPassword } = await import("@/lib/auth");

    await loginWithPassword("operator", "correct-password");

    expect(cookiesStore.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ secure: false }),
    );
  });

  it("uses secure session cookies by default in production", async () => {
    process.env.NODE_ENV = "production";
    const user = {
      id: "user-1",
      workspaceId: "workspace-1",
      username: "operator",
      displayName: "张三",
      role: "manager",
      passwordHash: "stored-hash",
      createdAt: new Date(),
      updatedAt: new Date(),
      workspace: { name: "精密加工一厂" },
    };
    prismaMock.user.findUnique.mockResolvedValue(user);
    prismaMock.session.create.mockResolvedValue({
      id: "session-1",
      userId: user.id,
      tokenHash: "hashed",
      expiresAt: new Date(),
      createdAt: new Date(),
    });

    const { loginWithPassword } = await import("@/lib/auth");

    await loginWithPassword("operator", "correct-password");

    expect(cookiesStore.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ secure: true }),
    );
  });

  it("does not create a session when the global username is missing", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const { loginWithPassword } = await import("@/lib/auth");

    await expect(
      loginWithPassword("operator", "correct-password"),
    ).resolves.toBeNull();
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { username: "operator" },
      }),
    );
    expect(prismaMock.session.create).not.toHaveBeenCalled();
    expect(cookiesStore.set).not.toHaveBeenCalled();
  });
});
