import { z } from "zod";
import { api, json, requireMiniappUser } from "@/server/miniapp/http";
import { setTaskStatus } from "@/server/miniapp/tasks";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return api(async () => { const actor = await requireMiniappUser(request);
    const input = z.object({ status: z.enum(["pending", "completed"]) }).strict().parse(await request.json());
    return json({ item: await setTaskStatus(actor, (await context.params).id, input.status) }); });
}
