import { z } from "zod";
import { api, json, requireMiniappUser } from "@/server/miniapp/http";
import { getWorkbench } from "@/server/miniapp/workbench";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return api(async () => {
    const user = await requireMiniappUser(request);
    const params = z.object({ view: z.enum(["risks", "todos", "shipments"]).default("risks"),
      page: z.coerce.number().int().min(1).max(10000).default(1), query: z.string().trim().max(100).default("") }).strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    const result = await getWorkbench(user.workspaceId, params.query);
    const rows = result[params.view];
    return json({ queriedAt: result.queriedAt, businessDate: result.businessDate, summary: result.summary,
      view: params.view, page: params.page, total: rows.length, hasMore: params.page * 20 < rows.length,
      items: rows.slice((params.page - 1) * 20, params.page * 20) });
  });
}
