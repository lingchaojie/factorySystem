import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createProductionRecord } from "@/server/services/records";
import { api, json, requireMiniappUser } from "@/server/miniapp/http";

export const runtime = "nodejs";
const quantity = z.number().int("数量必须是整数").min(0, "数量不能为负数").max(2147483647, "数量过大");
const recordInput = z.object({
  machineId: z.string().min(1, "请选择机器"),
  orderId: z.string().min(1, "请选择订单"),
  completedQuantity: quantity,
  shippedQuantity: quantity,
  notes: z.string().max(2000, "备注不能超过 2000 字").default(""),
}).refine(v => v.completedQuantity > 0 || v.shippedQuantity > 0, "加工数量和出货数量不能同时为 0");

export async function POST(request: Request) {
  return api(async () => {
    const user = await requireMiniappUser(request);
    const input = recordInput.parse(await request.json());
    const result = await createProductionRecord(user.workspaceId, {
      ...input, actorUserId: user.id, recordedAt: new Date(),
    });
    for (const path of ["/machines", `/machines/${result.machineId}`, "/orders",
      `/orders/${result.orderId}`, "/records", "/analytics"]) revalidatePath(path);
    return json({ records: result.records.map(r => ({
      id: r.id, type: r.type, quantity: r.quantity, recordedAt: r.recordedAt,
    })) }, 201);
  });
}
