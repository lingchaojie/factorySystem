import { api, json, requireMiniappUser } from "@/server/miniapp/http";
import { createTask, listTasks, requireTaskManager, taskFilters, taskInput } from "@/server/miniapp/tasks";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return api(async () => { const actor = await requireMiniappUser(request);
    return json(await listTasks(actor, taskFilters.parse(Object.fromEntries(new URL(request.url).searchParams)))); });
}
export async function POST(request: Request) {
  return api(async () => { const actor = await requireMiniappUser(request); requireTaskManager(actor);
    const result = await createTask(actor, taskInput.parse(await request.json())); return json({ item: result.item }, result.created ? 201 : 200); });
}
