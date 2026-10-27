import { api, json, requireMiniappUser } from "@/server/miniapp/http";
import { taskOptions } from "@/server/miniapp/tasks";
export const runtime = "nodejs";
export async function GET(request: Request) { return api(async () => json(await taskOptions(await requireMiniappUser(request)))); }
