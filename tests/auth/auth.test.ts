import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookiesStore, prismaMock } = vi.hoisted(() => ({
  cookiesStore: {
    set: vi.fn(),
  },
  prismaMock: {
    user: {
      findFirst: vi.fn(),
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

  it("creates a concurrent session and sets an httpOnly cookie when credentials are valid", async () => {
    const user = {
      id: "user-1",
      workspaceId: "workspace-1",
      username: "operator",
      passwordHash: "stored-hash",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prismaMock.user.findFirst.mockResolvedValue(user);
    prismaMock.session.create.mockResolvedValue({
      id: "session-1",
      userId: user.id,
      tokenHash: "hashed",
      expiresAt: new Date(),
      createdAt: new Date(),
    });

    const { loginWithPassword } = await import("@/lib/auth");
    const { sessionCookieName } = await import("@/lib/session");

    await expect(
      loginWithPassword("operator", "correct-password"),
    ).resolves.toEqual(user);
    expect(prismaMock.user.findFirst).toHaveBeenCalledWith({
      where: { username: "operator" },
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
});
