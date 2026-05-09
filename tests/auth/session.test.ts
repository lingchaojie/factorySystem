import { beforeEach, describe, expect, it, vi } from "vitest";

const { cookiesStore, prismaMock } = vi.hoisted(() => ({
  cookiesStore: {
    get: vi.fn(),
  },
  prismaMock: {
    session: {
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

describe("session helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SESSION_TTL_DAYS;
  });

  it("uses a positive SESSION_TTL_DAYS value and falls back to 30 days", async () => {
    const { getSessionTtlDays } = await import("@/lib/session");

    expect(getSessionTtlDays()).toBe(30);

    process.env.SESSION_TTL_DAYS = "7";
    expect(getSessionTtlDays()).toBe(7);

    process.env.SESSION_TTL_DAYS = "0";
    expect(getSessionTtlDays()).toBe(30);
  });

  it("reads the session cookie with the installed async cookies API", async () => {
    const user = {
      id: "user-1",
      workspaceId: "workspace-1",
      username: "operator",
      passwordHash: "hash",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    cookiesStore.get.mockReturnValue({ value: "session-token" });
    prismaMock.session.findUnique.mockResolvedValue({
      id: "session-1",
      userId: user.id,
      tokenHash: "hashed",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      user,
    });

    const { readSessionUser, sessionCookieName } = await import("@/lib/session");

    await expect(readSessionUser()).resolves.toEqual(user);
    expect(cookiesStore.get).toHaveBeenCalledWith(sessionCookieName);
    expect(prismaMock.session.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: expect.any(String) },
      include: { user: true },
    });
  });
});
