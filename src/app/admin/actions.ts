"use server";

import type { UserRole } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/admin-auth";
import {
  createCustomerUser,
  createPlatformAdmin,
  createWorkspaceWithInitialAccount,
} from "@/server/services/platform-admin";

const userRoles = new Set<UserRole>(["manager", "employee"]);

function getString(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "");
}

function parseUserRole(value: FormDataEntryValue | null): UserRole {
  const role = String(value ?? "");
  if (!userRoles.has(role as UserRole)) {
    throw new Error("账号角色无效");
  }
  return role as UserRole;
}

export async function createWorkspaceWithInitialAccountAction(
  formData: FormData,
) {
  await requirePlatformAdmin();

  await createWorkspaceWithInitialAccount({
    workspaceName: getString(formData, "workspaceName"),
    username: getString(formData, "username"),
    displayName: getString(formData, "displayName"),
    password: getString(formData, "password"),
    role: parseUserRole(formData.get("role")),
  });

  revalidatePath("/admin");
  revalidatePath("/admin/workspaces");
  revalidatePath("/admin/accounts");
  redirect("/admin/workspaces");
}

export async function createCustomerUserAction(formData: FormData) {
  await requirePlatformAdmin();

  await createCustomerUser({
    workspaceId: getString(formData, "workspaceId"),
    username: getString(formData, "username"),
    displayName: getString(formData, "displayName"),
    password: getString(formData, "password"),
    role: parseUserRole(formData.get("role")),
  });

  revalidatePath("/admin");
  revalidatePath("/admin/workspaces");
  revalidatePath("/admin/accounts");
  redirect("/admin/accounts");
}

export async function createPlatformAdminAction(formData: FormData) {
  await requirePlatformAdmin();

  await createPlatformAdmin({
    username: getString(formData, "username"),
    displayName: getString(formData, "displayName"),
    password: getString(formData, "password"),
  });

  revalidatePath("/admin");
  revalidatePath("/admin/admins");
  redirect("/admin/admins");
}
