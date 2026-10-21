import { listMachines } from "@/server/services/machines";
import { api, json, requireMiniappUser } from "@/server/miniapp/http";
import { machineDto } from "@/server/miniapp/dto";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return api(async () => {
    const user = await requireMiniappUser(request);
    const machines = await listMachines(user.workspaceId);
    return json({ machines: machines.map(m => machineDto(m, user.role)) });
  });
}
