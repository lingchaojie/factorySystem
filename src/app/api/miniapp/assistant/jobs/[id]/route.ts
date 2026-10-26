import { api, json, requireMiniappUser } from "@/server/miniapp/http";
import { assistantJobs } from "@/server/assistant/jobs";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const user = await requireMiniappUser(request);
    return json({ job: assistantJobs.read(user, (await params).id) });
  });
}
