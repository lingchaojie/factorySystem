import { requireUser } from "@/lib/auth";

export async function requireWorkspaceId(): Promise<string> {
  const user = await requireUser();
  return user.workspaceId;
}
