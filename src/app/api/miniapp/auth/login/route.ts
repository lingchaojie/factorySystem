import { z } from "zod";
import { authenticatePassword } from "@/lib/auth";
import { createSession } from "@/lib/session";
import { api, ApiError, json } from "@/server/miniapp/http";
import { userDto } from "@/server/miniapp/dto";

export const runtime = "nodejs";
const credentials = z.object({
  username: z.string().trim().min(1, "请输入账号").max(200),
  password: z.string().min(1, "请输入密码").max(200),
});
export async function POST(request: Request) {
  return api(async () => {
    const input = credentials.parse(await request.json());
    const user = await authenticatePassword(input.username, input.password);
    if (!user) throw new ApiError(401, "账号或密码错误");
    return json({ token: await createSession(user.id), user: userDto(user) });
  });
}
