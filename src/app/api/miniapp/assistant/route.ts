import { after } from "next/server";
import { api, ApiError, json, requireMiniappUser } from "@/server/miniapp/http";
import { chatInput, providerConfig, runAgent } from "@/server/assistant/agent";
import { lookupProgress } from "@/server/assistant/lookup";
import { assistantJobs } from "@/server/assistant/jobs";
import { createAssignmentFromChat } from "@/server/assistant/assignment";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return api(async () => {
    const user = await requireMiniappUser(request);
    const config = providerConfig();
    return json({ configured: !!config, providerHost: config ? new URL(config.baseUrl).hostname : "", readOnly: user.role !== "manager", canAssign: user.role === "manager" });
  });
}
export async function POST(request: Request) {
  return api(async () => {
    const user = await requireMiniappUser(request);
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 16384) throw new ApiError(400, "消息过长，请缩短后再试");
    const input = chatInput.parse(JSON.parse(raw));
    const config = providerConfig();
    if (!config) throw new ApiError(503, "助手尚未接入模型，请联系管理员；机器和订单功能可正常使用");
    const { job, execute } = assistantJobs.create(user, input, () => runAgent(config, input, args => lookupProgress(user.workspaceId, args), fetch,
      user.role === "manager" ? args => createAssignmentFromChat(user, input, args) : undefined));
    if (execute) after(execute);
    return json({ job }, 202);
  });
}
