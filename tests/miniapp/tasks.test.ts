// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), employees: vi.fn(), employee: vi.fn(), orders: vi.fn(), order: vi.fn(),
  first: vi.fn(), unique: vi.fn(), create: vi.fn(), update: vi.fn(), list: vi.fn(), count: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/session", () => ({ readSessionTokenUser: mocks.user }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findMany: mocks.employees, findFirst: mocks.employee }, order: { findMany: mocks.orders, findFirst: mocks.order },
  workItem: { findFirst: mocks.first, findUnique: mocks.unique, create: mocks.create, updateMany: mocks.update }, $transaction: mocks.transaction } }));
import { createTask, getTask, listTasks, setTaskStatus, taskInput, taskOptions, taskScope } from "@/server/miniapp/tasks";
import { GET, POST } from "@/app/api/miniapp/tasks/route";
import { GET as options } from "@/app/api/miniapp/tasks/options/route";
import { GET as detail } from "@/app/api/miniapp/tasks/[id]/route";
import { POST as status } from "@/app/api/miniapp/tasks/[id]/status/route";
const manager = { id: "demo-manager", workspaceId: "demo-factory", role: "manager" as const };
const employee = { id: "demo-worker", workspaceId: "demo-factory", role: "employee" as const };
const input = { title: "核对出货", description: "检查实物数量", assigneeUserId: employee.id, orderId: "demo-order", dueDate: "2026-10-28", requestId: "request-demo-00001" };
const row = { id: "task1", title: input.title, description: input.description, status: "pending", dueDate: new Date("2026-10-27T16:00:00Z"),
  createdAt: new Date(), completedAt: null, assigneeUserId: employee.id, createdByUserId: manager.id, requestHash: "",
  assignee: { id: employee.id, displayName: "演示员工" }, createdBy: { displayName: "演示主管" }, completedBy: null,
  order: { id: "demo-order", orderNo: "DEMO-CNC-007", partName: "轴套" } };
describe("assigned task authorization and persistence", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue(null); mocks.unique.mockResolvedValue(null); mocks.employee.mockResolvedValue({ id: employee.id });
    mocks.order.mockResolvedValue({ id: input.orderId }); mocks.first.mockResolvedValue(row); mocks.create.mockResolvedValue(row); });
  it("requires authentication for every read, creation, option and status endpoint", async () => {
    const request = new Request('https://test/api/miniapp/tasks', { method: 'POST', body: '{}' }); const context = { params: Promise.resolve({ id: 'task1' }) };
    for (const response of [await GET(request), await POST(request), await options(request), await detail(request, context), await status(request, context)]) expect(response.status).toBe(401);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.first).not.toHaveBeenCalled();
  });
  it("rejects employee creation and employee access to assignment options before writes", async () => {
    mocks.user.mockResolvedValue(employee);
    expect((await POST(new Request('https://test/api/miniapp/tasks', { method: 'POST', body: JSON.stringify(input) }))).status).toBe(403);
    expect((await options(new Request('https://test/api/miniapp/tasks/options'))).status).toBe(403);
    await expect(createTask(employee, input)).rejects.toMatchObject({ status: 403 }); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("scopes managers to their factory and employees to their own assigned tasks", async () => {
    expect(taskScope(manager)).toEqual({ workspaceId: 'demo-factory' });
    await getTask(employee, 'guessed-foreign-id');
    expect(mocks.first.mock.calls[0][0].where).toEqual({ workspaceId: 'demo-factory', assigneeUserId: employee.id, id: 'guessed-foreign-id' });
    mocks.first.mockResolvedValue(null);
    await expect(setTaskStatus(employee, 'other-employees-task', 'completed')).rejects.toMatchObject({ status: 404 });
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("only assigns existing employees and links orders within the manager's workspace", async () => {
    mocks.employee.mockResolvedValue(null); await expect(createTask(manager, input)).rejects.toMatchObject({ status: 400 }); expect(mocks.create).not.toHaveBeenCalled();
    mocks.employee.mockResolvedValue({ id: employee.id }); mocks.order.mockResolvedValue(null);
    await expect(createTask(manager, input)).rejects.toMatchObject({ status: 400 }); expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.employee.mock.calls[0][0].where).toEqual({ id: employee.id, workspaceId: manager.workspaceId, role: 'employee' });
    expect(mocks.order.mock.calls[0][0].where).toEqual({ id: input.orderId, workspaceId: manager.workspaceId });
  });
  it("stores actor identity server-side and returns a safe DTO without idempotency hashes or private fields", async () => {
    const result = await createTask(manager, input);
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ workspaceId: manager.workspaceId, createdByUserId: manager.id, assigneeUserId: employee.id, orderId: input.orderId });
    expect(result.created).toBe(true); expect(result.item.dueDate).toBe('2026-10-28');
    expect(JSON.stringify(result.item)).not.toMatch(/requestHash|password|unitPrice|customerName/);
  });
  it("deduplicates a repeated creation and rejects the same request id with a different payload or creator", async () => {
    await createTask(manager, input); const requestHash = mocks.create.mock.calls[0][0].data.requestHash;
    mocks.unique.mockResolvedValue({ ...row, requestHash });
    expect((await createTask(manager, input)).created).toBe(false); expect(mocks.create).toHaveBeenCalledOnce();
    await expect(createTask(manager, { ...input, title: '另一个事项' })).rejects.toMatchObject({ status: 409 });
    await expect(createTask({ ...manager, id: 'another-manager' }, input)).rejects.toMatchObject({ status: 409 });
  });
  it("keeps the same scope in completion/reopen writes and does not overwrite a repeated completion timestamp", async () => {
    await setTaskStatus(employee, row.id, 'completed');
    expect(mocks.update.mock.calls[0][0]).toMatchObject({ where: { workspaceId: manager.workspaceId, assigneeUserId: employee.id, id: row.id, status: 'pending' }, data: { status: 'completed', completedByUserId: employee.id } });
    mocks.first.mockResolvedValue({ ...row, status: 'completed' }); mocks.update.mockClear();
    await setTaskStatus(employee, row.id, 'completed'); expect(mocks.update).not.toHaveBeenCalled();
    await setTaskStatus(manager, row.id, 'pending');
    expect(mocks.update.mock.calls[0][0]).toMatchObject({ where: { workspaceId: manager.workspaceId, id: row.id }, data: { completedAt: null, completedByUserId: null } });
  });
  it("counts full scoped results independently of the page and does not accept tenant or actor fields from input", async () => {
    mocks.transaction.mockImplementation(callback => callback({ workItem: { findMany: mocks.list, count: mocks.count } }));
    mocks.list.mockResolvedValue([row]); mocks.count.mockResolvedValueOnce(21).mockResolvedValueOnce(21).mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    const result = await listTasks(employee, { status: 'pending', page: 2 });
    expect(result).toMatchObject({ total: 21, page: 2, hasMore: false, summary: { pending: 21, overdue: 1 } });
    expect(mocks.list.mock.calls[0][0]).toMatchObject({ where: { workspaceId: manager.workspaceId, assigneeUserId: employee.id, status: 'pending' }, skip: 20, take: 20 });
    for (const field of ['workspaceId', 'createdByUserId', 'completedByUserId', 'status']) expect(taskInput.safeParse({ ...input, [field]: 'foreign' }).success).toBe(false);
    expect(taskInput.safeParse({ ...input, dueDate: '2026-02-30' }).success).toBe(false);
  });
  it("returns only same-factory employees and order labels in manager options", async () => {
    mocks.employees.mockResolvedValue([]); mocks.orders.mockResolvedValue([]); await taskOptions(manager);
    expect(mocks.employees.mock.calls[0][0]).toMatchObject({ where: { workspaceId: manager.workspaceId, role: 'employee' } });
    expect(mocks.orders.mock.calls[0][0].select).toEqual({ id: true, orderNo: true, partName: true });
  });
  it("supports all three shared states, clears completion metadata when restarting, and counts overdue active tasks", async () => {
    await setTaskStatus(employee, row.id, 'in_progress');
    expect(mocks.update.mock.calls[0][0]).toMatchObject({ where: { workspaceId: manager.workspaceId, assigneeUserId: employee.id }, data: { status: 'in_progress', completedAt: null, completedByUserId: null } });
    mocks.first.mockResolvedValue({ ...row, status: 'in_progress', dueDate: new Date('2020-01-01') });
    expect((await getTask(employee, row.id)).overdue).toBe(true);
    await setTaskStatus(manager, row.id, 'completed');
    expect(mocks.update.mock.calls[1][0].data).toMatchObject({ status: 'completed', completedByUserId: manager.id });
    mocks.transaction.mockImplementation(callback => callback({ workItem: { findMany: mocks.list, count: mocks.count } }));
    mocks.list.mockResolvedValue([]); mocks.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2).mockResolvedValueOnce(3).mockResolvedValueOnce(4).mockResolvedValueOnce(1);
    const result = await listTasks(manager, { status: 'open', page: 1 });
    expect(result.summary).toEqual({ pending: 2, inProgress: 3, completed: 4, overdue: 1 });
    expect(mocks.list.mock.calls[0][0].where.status).toEqual({ in: ['pending', 'in_progress'] });
    expect(mocks.count.mock.calls[4][0].where.status).toEqual({ in: ['pending', 'in_progress'] });
  });
});
