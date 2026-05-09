import crypto from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";

export const sessionCookieName =
  process.env.SESSION_COOKIE_NAME ?? "factory_session";

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function getSessionTtlDays(): number {
  const value = Number(process.env.SESSION_TTL_DAYS ?? "30");
  return Number.isFinite(value) && value > 0 ? value : 30;
}

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + getSessionTtlDays() * 24 * 60 * 60 * 1000,
  );

  await prisma.session.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt,
    },
  });

  return token;
}

export async function readSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: { user: true },
  });

  if (!session || session.expiresAt <= new Date()) return null;
  return session.user;
}

export async function destroyCurrentSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return;

  await prisma.session.deleteMany({
    where: { tokenHash: sha256(token) },
  });
}
