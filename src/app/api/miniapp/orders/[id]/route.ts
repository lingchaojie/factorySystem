import { getOrderWithSummary } from "@/server/services/orders";
import { api, json, requireMiniappUser } from "@/server/miniapp/http";
import { orderDetailDto } from "@/server/miniapp/dto";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const user = await requireMiniappUser(request);
    const { id } = await params;
    return json({ order: orderDetailDto(await getOrderWithSummary(user.workspaceId, id), user.role) });
  });
}
