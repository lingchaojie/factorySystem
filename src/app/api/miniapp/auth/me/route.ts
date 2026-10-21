import { api, json, requireMiniappUser } from "@/server/miniapp/http";
import { userDto } from "@/server/miniapp/dto";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return api(async () => json({ user: userDto(await requireMiniappUser(request)) }));
}
