import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { bootstrapWorkspaceId } from "@/lib/bootstrap";
import { prisma } from "@/lib/db";
import {
  type AuthenticatedUser,
  authenticatedUserSelect,
  createSession,
  getSessionTtlDays,
  readSessionUser,
  sessionCookieName,
} from "@/lib/session";
import { verifyPassword } from "@/lib/password";

export async function loginWithPassword(
  username: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const user = await prisma.user.findUnique({
    where: {
      workspaceId_username: {
        workspaceId: bootstrapWorkspaceId,
        username,
      },
    },
    select: {
      ...authenticatedUserSelect,
      passwordHash: true,
    },
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

  return {
    id: user.id,
    workspaceId: user.workspaceId,
    username: user.username,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function requireUser() {
  const user = await readSessionUser();
  if (!user) redirect("/login");
  return user;
}
