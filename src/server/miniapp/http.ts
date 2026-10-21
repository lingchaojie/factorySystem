import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { readSessionTokenUser } from "@/lib/session";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function bearerToken(request: Request) {
  return request.headers.get("authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
}

export async function requireMiniappUser(request: Request) {
  const user = await readSessionTokenUser(bearerToken(request));
  if (!user) throw new ApiError(401, "登录已过期，请重新登录");
  return user;
}

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

const businessErrors = new Set([
  "机器不存在", "订单不存在", "机器未关联该订单，不能录入记录",
  "订单已完成，不能录入记录", "加工数量和出货数量不能同时为 0",
]);

export async function api(handler: () => Promise<Response>): Promise<Response> {
  try { return await handler(); }
  catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    if (error instanceof ZodError) return json({ error: error.issues[0]?.message ?? "参数无效" }, 400);
    if (error instanceof SyntaxError) return json({ error: "请求必须是有效 JSON" }, 400);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return json({ error: "数据不存在或已删除" }, 404);
    }
    if (error instanceof Error && businessErrors.has(error.message)) return json({ error: error.message }, 400);
    console.error("Miniapp API failed", error);
    return json({ error: "服务暂时不可用，请稍后重试" }, 500);
  }
}
