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
    process.env.SESSION_TTL_DAYS = "14";
  });

  it("scopes login to the bootstrap workspace and returns a safe user shape", async () => {
    const user = {
      id: "user-1",
      workspaceId: "bootstrap-workspace",
      username: "operator",
      passwordHash: "stored-hash",
      createdAt: new Date(),
      updatedAt: new Date(),
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
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
    expect(result).not.toHaveProperty("passwordHash");
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: {
        workspaceId_username: {
          workspaceId: "bootstrap-workspace",
          username: "operator",
        },
      },
      select: expect.objectContaining({
        id: true,
        workspaceId: true,
        username: true,
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
      workspaceId: "bootstrap-workspace",
      username: "operator",
      passwordHash: "stored-hash",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { loginWithPassword } = await import("@/lib/auth");

    await expect(loginWithPassword("operator", "wrong-password")).resolves.toBe(
      null,
    );
    expect(prismaMock.session.create).not.toHaveBeenCalled();
    expect(cookiesStore.set).not.toHaveBeenCalled();
  });

  it("does not log in a duplicate username from another workspace", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const { loginWithPassword } = await import("@/lib/auth");

    await expect(
      loginWithPassword("operator", "correct-password"),
    ).resolves.toBeNull();
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          workspaceId_username: {
            workspaceId: "bootstrap-workspace",
            username: "operator",
          },
        },
      }),
    );
    expect(prismaMock.session.create).not.toHaveBeenCalled();
    expect(cookiesStore.set).not.toHaveBeenCalled();
  });
});
