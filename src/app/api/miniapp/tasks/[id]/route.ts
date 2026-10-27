import { api, json, requireMiniappUser } from "@/server/miniapp/http";
import { getTask } from "@/server/miniapp/tasks";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => json({ item: await getTask(await requireMiniappUser(request), (await context.params).id) }));
}
