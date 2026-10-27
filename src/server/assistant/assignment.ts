import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { ApiError } from "@/server/miniapp/http";
import { createTask, requireTaskManager, type TaskActor } from "@/server/miniapp/tasks";
import type { Answer, ChatInput } from "./agent";
import { assignmentInput, assignmentRequest, normalizeTarget, type AssignmentInput } from "./assignment-intent";

type Employee = { id: string; displayName: string; username: string };
type Order = { id: string; orderNo: string; partName: string };
function matches<T>(rows: T[], query: string, names: (row: T) => string[]) {
  const key = normalizeTarget(query);
  const exact = rows.filter(row => names(row).some(name => normalizeTarget(name) === key));
  return exact.length ? exact : rows.filter(row => names(row).some(name => normalizeTarget(name).includes(key)));
}
export function resolveAssignment(employees: Employee[], orders: Order[], input: AssignmentInput) {
  const people = matches(employees, input.assigneeQuery, row => [row.username, row.displayName]);
  const linked = input.orderQuery ? matches(orders, input.orderQuery, row => [row.orderNo, row.partName]) : [];
  return { people, linked };
}
const clarify = (text: string): Answer => ({ text: "创建前需要确认：" + text + "\n本次尚未创建事项，请回复‘选择 员工账号、订单号’，或重新完整描述指派要求。", sources: [], queriedAt: new Date().toISOString() });

export async function createAssignmentFromChat(actor: TaskActor, chat: ChatInput, raw: AssignmentInput): Promise<Answer> {
  requireTaskManager(actor);
  const intent = assignmentRequest(chat);
  if (!intent) throw new ApiError(400, "请明确说明要创建或指派的事项");
  const input = assignmentInput.parse(raw);
  const userText = normalizeTarget(intent.userText);
  // Targets must originate in human messages, never in a tool result or a model-invented identity.
  if (!normalizeTarget(input.assigneeQuery) || !userText.includes(normalizeTarget(input.assigneeQuery)) ||
      (input.orderQuery && (!normalizeTarget(input.orderQuery) || !userText.includes(normalizeTarget(input.orderQuery))))) {
    return clarify("请提供员工姓名或账号，以及需要关联的订单号。");
  }
  if (!input.orderQuery && /订单/u.test(intent.request)) return clarify("你提到了订单，请补充具体订单编号，避免创建后关联错误。");
  const [employees, orders] = await Promise.all([
    prisma.user.findMany({ where: { workspaceId: actor.workspaceId, role: "employee" }, select: { id: true, displayName: true, username: true } }),
    input.orderQuery ? prisma.order.findMany({ where: { workspaceId: actor.workspaceId }, select: { id: true, orderNo: true, partName: true } }) : [],
  ]);
  const { people, linked } = resolveAssignment(employees, orders, input);
  if (people.length !== 1 || (input.orderQuery && linked.length !== 1)) {
    const labels = [people.length !== 1 ? (people.length ? "员工有多条匹配：" + people.slice(0, 8).map(p => `${p.displayName}（${p.username}）`).join("、") : "未找到本工厂员工“" + input.assigneeQuery + "”") : "",
      input.orderQuery && linked.length !== 1 ? (linked.length ? "订单有多条匹配：" + linked.slice(0, 8).map(o => `${o.orderNo}（${o.partName}）`).join("、") : "未找到本工厂订单“" + input.orderQuery + "”") : ""].filter(Boolean);
    return clarify(labels.join("；") + "。" + (people.length > 8 || linked.length > 8 ? "候选仅列前8项，请提供更完整的账号或订单号。" : ""));
  }
  const requestId = "assistant-" + createHash("sha256").update(actor.id + ":" + chat.requestId).digest("hex").slice(0, 48);
  const { item, created } = await createTask(actor, { title: intent.request.slice(0, 120), description: intent.request,
    assigneeUserId: people[0].id, orderId: linked[0]?.id ?? null, dueDate: null, requestId });
  // Return immediately after the database commits. A later model failure must not conceal a successful write.
  return { text: `${created ? "已创建并指派事项" : "该请求的事项已创建，未重复创建"}：${item.title}\n负责人：${item.assignee?.displayName}\n关联订单：${item.order?.orderNo ?? "未关联"}\n状态：${{ pending: "待处理", in_progress: "处理中", completed: "已完成" }[item.status]}\n经理和该员工看到的是同一条事项，可在详情页切换进度。`,
    sources: [{ kind: "task", id: item.id, title: item.title, status: { pending: "待处理", in_progress: "处理中", completed: "已完成" }[item.status],
      summary: `负责人：${item.assignee?.displayName}；订单：${item.order?.orderNo ?? "未关联"}` }], queriedAt: new Date().toISOString() };
}
