import { destroySessionToken } from "@/lib/session";
import { api, bearerToken, json } from "@/server/miniapp/http";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return api(async () => {
    await destroySessionToken(bearerToken(request));
    return json({ ok: true });
  });
}
