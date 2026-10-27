import { z } from "zod";
import type { ChatInput } from "./agent";

export const assignmentInput = z.object({
  assigneeQuery: z.string().trim().min(1).max(100),
  orderQuery: z.string().trim().max(100),
}).strict();
export type AssignmentInput = z.infer<typeof assignmentInput>;

export function normalizeTarget(value: string) {
  return value.normalize("NFKC").replace(new RegExp("[\\s\\p{P}\\p{S}]", "gu"), "").toLowerCase();
}
function isAssignment(message: string) {
  if (/^(?:请|帮我|麻烦)?\s*(?:查询|查看|查一下|看看|列出|显示|问一下)/u.test(message) || /(?:怎么|如何)(?:通过助手)?(?:创建|新建|安排|指派)/u.test(message)) return false;
  if (/(?:不要|不用|无需|不想|别|取消|不允许|不能).*(?:创建|新建|新增|添加|安排|指派|交办|让)/u.test(message)) return false;
  // A progress question alone never exposes the write tool, even if history contains a task request.
  return /(?:创建|新建|新增|添加|安排|指派|交办).*(?:待办|代办|事项|任务)|(?:让|安排|指派|交给).*(?:去|处理|跟进|负责|核对|检查|确认|完成|准备)/iu.test(message);
}
export function assignmentRequest(input: ChatInput): { request: string; userText: string } | null {
  if (isAssignment(input.message)) return { request: input.message, userText: input.message };
  // Only a short, explicit selection can continue a clarification. Querying something else cannot.
  if (!/^(?:选|选择|就选|就是|用|员工是|订单是|负责人是)/u.test(input.message) || input.message.length > 240) return null;
  const last = input.history.at(-1);
  if (last?.role !== "assistant" || !last.content.startsWith("创建前需要确认：")) return null;
  const users = input.history.filter(item => item.role === "user").map(item => item.content);
  const original = users.findLast(isAssignment);
  return original ? { request: original, userText: [...users, input.message].join("\n") } : null;
}
