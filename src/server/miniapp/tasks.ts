import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { businessTodayBounds, formatDateTimeLocalValue, parseBusinessDate } from "@/lib/business-time";
import type { AuthenticatedUser } from "@/lib/session";
import { ApiError } from "./http";

export type TaskActor = Pick<AuthenticatedUser, "id" | "workspaceId" | "role">;
const dueDateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => Number.isFinite(parseBusinessDate(value).getTime()), "截止日期无效");
export const taskInput = z.object({ title: z.string().trim().min(1, "请输入事项标题").max(120),
  description: z.string().trim().max(2000).default(""), assigneeUserId: z.string().min(1, "请选择员工").max(128),
  orderId: z.string().min(1).max(128).nullable().default(null), dueDate: dueDateInput.nullable().default(null),
  requestId: z.string().regex(/^[A-Za-z0-9_-]{12,80}$/) }).strict();
export const taskFilters = z.object({ status: z.enum(["pending", "completed", "all"]).default("pending"), page: z.coerce.number().int().min(1).max(10000).default(1) }).strict();
const select = { id: true, title: true, description: true, status: true, dueDate: true, createdAt: true, completedAt: true,
  assigneeUserId: true, createdByUserId: true, requestHash: true,
  assignee: { select: { id: true, displayName: true } }, createdBy: { select: { displayName: true } },
  completedBy: { select: { displayName: true } }, order: { select: { id: true, orderNo: true, partName: true } } } satisfies Prisma.WorkItemSelect;
type Row = Prisma.WorkItemGetPayload<{ select: typeof select }>;
export function taskScope(actor: TaskActor): Prisma.WorkItemWhereInput {
  return { workspaceId: actor.workspaceId, ...(actor.role === "manager" ? {} : { assigneeUserId: actor.id }) };
}
export function requireTaskManager(actor: TaskActor) { if (actor.role !== "manager") throw new ApiError(403, "只有经理可以创建和指派事项"); }
function dto(row: Row) {
  return { id: row.id, title: row.title, description: row.description, status: row.status,
    dueDate: row.dueDate ? formatDateTimeLocalValue(row.dueDate).slice(0, 10) : null,
    overdue: row.status === "pending" && !!row.dueDate && row.dueDate < businessTodayBounds().start,
    createdAt: row.createdAt, completedAt: row.completedAt,
    assignee: row.assignee, createdByName: row.createdBy?.displayName ?? "已移除的账号",
    completedByName: row.completedBy?.displayName ?? null, order: row.order };
}
export async function listTasks(actor: TaskActor, filters: z.infer<typeof taskFilters>) {
  const scope = taskScope(actor);
  const where = { ...scope, ...(filters.status === "all" ? {} : { status: filters.status }) };
  return prisma.$transaction(async tx => {
    const [items, total, pending, completed, overdue] = await Promise.all([
      tx.workItem.findMany({ where, select, orderBy: [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], skip: (filters.page - 1) * 20, take: 20 }),
      tx.workItem.count({ where }), tx.workItem.count({ where: { ...scope, status: "pending" } }),
      tx.workItem.count({ where: { ...scope, status: "completed" } }),
      tx.workItem.count({ where: { ...scope, status: "pending", dueDate: { lt: businessTodayBounds().start } } }),
    ]);
    return { items: items.map(dto), total, page: filters.page, hasMore: filters.page * 20 < total,
      summary: { pending, completed, overdue }, manager: actor.role === "manager", scope: actor.role === "manager" ? "本工厂所有指派事项" : "指派给我的事项" };
  }, { isolationLevel: "RepeatableRead" });
}
export async function taskOptions(actor: TaskActor) {
  requireTaskManager(actor);
  const [employees, orders] = await Promise.all([
    prisma.user.findMany({ where: { workspaceId: actor.workspaceId, role: "employee" }, select: { id: true, displayName: true, username: true }, orderBy: { displayName: "asc" } }),
    prisma.order.findMany({ where: { workspaceId: actor.workspaceId }, select: { id: true, orderNo: true, partName: true }, orderBy: { createdAt: "desc" } }),
  ]);
  return { employees, orders };
}
export async function getTask(actor: TaskActor, id: string) {
  const row = await prisma.workItem.findFirst({ where: { ...taskScope(actor), id }, select });
  if (!row) throw new ApiError(404, "事项不存在或无权查看");
  return dto(row);
}
export async function createTask(actor: TaskActor, input: z.infer<typeof taskInput>) {
  requireTaskManager(actor);
  const { requestId, ...fields } = input;
  const requestHash = createHash("sha256").update(JSON.stringify(fields)).digest("hex");
  const unique = { workspaceId_requestId: { workspaceId: actor.workspaceId, requestId } };
  const reuse = (row: Row) => {
    if (row.createdByUserId !== actor.id || row.requestHash !== requestHash) throw new ApiError(409, "请求编号已使用，请刷新后重新创建");
    return { item: dto(row), created: false };
  };
  const existing = await prisma.workItem.findUnique({ where: unique, select });
  if (existing) return reuse(existing);
  const employee = await prisma.user.findFirst({ where: { id: input.assigneeUserId, workspaceId: actor.workspaceId, role: "employee" }, select: { id: true } });
  if (!employee) throw new ApiError(400, "只能指派给本工厂的员工");
  if (input.orderId && !await prisma.order.findFirst({ where: { id: input.orderId, workspaceId: actor.workspaceId }, select: { id: true } })) throw new ApiError(400, "关联订单不存在或不属于本工厂");
  try {
    const row = await prisma.workItem.create({ data: { workspaceId: actor.workspaceId, title: input.title, description: input.description,
      assigneeUserId: employee.id, createdByUserId: actor.id, orderId: input.orderId,
      dueDate: input.dueDate ? parseBusinessDate(input.dueDate) : null, requestId, requestHash }, select });
    return { item: dto(row), created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await prisma.workItem.findUnique({ where: unique, select });
      if (winner) return reuse(winner);
    }
    throw error;
  }
}
export async function setTaskStatus(actor: TaskActor, id: string, status: "pending" | "completed") {
  // Every mutation includes the same workspace/assignee scope as reads.
  const row = await prisma.workItem.findFirst({ where: { ...taskScope(actor), id }, select });
  if (!row) throw new ApiError(404, "事项不存在或无权操作");
  if (row.status !== status) await prisma.workItem.updateMany({ where: { ...taskScope(actor), id, status: row.status },
    data: { status, completedAt: status === "completed" ? new Date() : null, completedByUserId: status === "completed" ? actor.id : null } });
  return getTask(actor, id);
}
