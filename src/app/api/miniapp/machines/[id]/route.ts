import { getMachine } from "@/server/services/machines";
import { api, json, requireMiniappUser } from "@/server/miniapp/http";
import { machineDto } from "@/server/miniapp/dto";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const user = await requireMiniappUser(request);
    const { id } = await params;
    return json({ machine: machineDto(await getMachine(user.workspaceId, id), user.role) });
  });
}
