import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  createSession,
  getSessionTtlDays,
  readSessionUser,
  sessionCookieName,
} from "@/lib/session";
import { verifyPassword } from "@/lib/password";

export async function loginWithPassword(username: string, password: string) {
  const user = await prisma.user.findFirst({
    where: { username },
  });

  if (!user) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  const token = await createSession(user.id);
  const cookieStore = await cookies();
  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * getSessionTtlDays(),
  });

  return user;
}

export async function requireUser() {
  const user = await readSessionUser();
  if (!user) redirect("/login");
  return user;
}
