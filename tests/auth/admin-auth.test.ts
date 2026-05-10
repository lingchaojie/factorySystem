import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookiesStore, prismaMock } = vi.hoisted(() => ({
  cookiesStore: {
    get: vi.fn(),
    set: vi.fn(),
  },
  prismaMock: {
    platformAdmin: {
      findUnique: vi.fn(),
    },
    platformAdminSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
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

describe("platform admin auth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    delete process.env.ADMIN_SESSION_COOKIE_NAME;
    process.env.SESSION_TTL_DAYS = "14";
  });

  it("logs in a platform admin with a separate admin session cookie", async () => {
    const admin = {
      id: "admin-1",
      username: "root",
      displayName: "平台管理员",
      passwordHash: "stored-hash",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    prismaMock.platformAdmin.findUnique.mockResolvedValue(admin);
    prismaMock.platformAdminSession.create.mockResolvedValue({
      id: "session-1",
      adminId: admin.id,
      tokenHash: "hashed",
      expiresAt: new Date(),
      createdAt: new Date(),
    });

    const { loginPlatformAdminWithPassword } = await import("@/lib/admin-auth");
    const { adminSessionCookieName } = await import("@/lib/admin-session");

    const result = await loginPlatformAdminWithPassword(
      "root",
      "correct-password",
    );

    expect(result).toEqual({
      id: admin.id,
      username: admin.username,
      displayName: admin.displayName,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    });
    expect(result).not.toHaveProperty("passwordHash");
    expect(prismaMock.platformAdmin.findUnique).toHaveBeenCalledWith({
      where: { username: "root" },
      select: expect.objectContaining({
        id: true,
        username: true,
        displayName: true,
        passwordHash: true,
      }),
    });
    expect(cookiesStore.set).toHaveBeenCalledWith(
      adminSessionCookieName,
      expect.any(String),
      expect.objectContaining({
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 14,
      }),
    );
  });

  it("reads the platform admin session from the admin cookie", async () => {
    const admin = {
      id: "admin-1",
      username: "root",
      displayName: "平台管理员",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    cookiesStore.get.mockReturnValue({ value: "admin-session-token" });
    prismaMock.platformAdminSession.findUnique.mockResolvedValue({
      id: "session-1",
      adminId: admin.id,
      tokenHash: "hashed",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      admin,
    });

    const { adminSessionCookieName, readPlatformAdminSession } = await import(
      "@/lib/admin-session"
    );

    const result = await readPlatformAdminSession();

    expect(result).toEqual(admin);
    expect(cookiesStore.get).toHaveBeenCalledWith(adminSessionCookieName);
    expect(prismaMock.platformAdminSession.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: expect.any(String) },
      select: {
        expiresAt: true,
        admin: {
          select: expect.objectContaining({
            id: true,
            username: true,
            displayName: true,
          }),
        },
      },
    });
  });
});
