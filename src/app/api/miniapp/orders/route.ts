import { OrderStatus } from "@prisma/client";
import { z } from "zod";
import { listOrders } from "@/server/services/orders";
import { api, json, requireMiniappUser } from "@/server/miniapp/http";
import { orderDto } from "@/server/miniapp/dto";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return api(async () => {
    const user = await requireMiniappUser(request);
    const params = new URL(request.url).searchParams;
    const query = z.string().max(200).parse(params.get("query") ?? "");
    const status = params.get("status");
    const filters = { query, ...(status ? { status: z.enum(OrderStatus).parse(status) } : {}) };
    const orders = await listOrders(user.workspaceId, filters);
    return json({ orders: orders.map(o => orderDto(o, user.role)) });
  });
}
