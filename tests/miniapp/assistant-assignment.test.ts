// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ employees: vi.fn(), orders: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findMany: mocks.employees }, order: { findMany: mocks.orders } } }));
vi.mock("@/server/miniapp/tasks", () => ({ createTask: mocks.create, requireTaskManager: (actor: { role: string }) => { if (actor.role !== 'manager') throw Object.assign(new Error('只有经理可以创建'), { status: 403 }); } }));
import { assignmentRequest } from "@/server/assistant/assignment-intent";
import { createAssignmentFromChat } from "@/server/assistant/assignment";
import { runAgent, type ChatInput } from "@/server/assistant/agent";

const actor = { id: 'manager', workspaceId: 'demo', role: 'manager' as const };
const input: ChatInput = { message: '让演示员工1去跟进 DEMO-CNC-007 订单的交付进度', history: [], requestId: 'assignment-request-001', consent: true };
const args = { assigneeQuery: '演示员工1', orderQuery: 'DEMO-CNC-007' };
const people = [{ id: 'w1', username: 'cnc_demo_worker1', displayName: '演示员工1' }, { id: 'w2', username: 'cnc_demo_worker2', displayName: '演示员工2' }];
const orders = [{ id: 'o7', orderNo: 'DEMO-CNC-007', partName: '铜衬套' }, { id: 'o8', orderNo: 'DEMO-CNC-008', partName: '铜衬套' }];
const item = { id: 'task1', title: input.message, status: 'pending', assignee: people[0], order: orders[0] };
const reply = (output: object[]) => new Response(JSON.stringify({ status: 'completed', output }), { headers: { 'content-type': 'application/json' } });
const call = { type: 'function_call', call_id: 'assignment1', name: 'create_assigned_task', arguments: JSON.stringify(args) };
const config = { baseUrl: 'https://provider.example', apiKey: 'test-only', model: 'test' };

describe('manager chat assignments', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.employees.mockResolvedValue(people); mocks.orders.mockResolvedValue(orders); mocks.create.mockResolvedValue({ item, created: true }); });
  it('only recognizes explicit requests and explicit clarification selections, never history-triggered or cancelled writes', () => {
    expect(assignmentRequest(input)?.request).toBe(input.message);
    for (const message of ['查一下订单进度', '看看我创建的任务', '不要创建任务，让员工去跟进', '怎么创建待办', '取消安排任务']) expect(assignmentRequest({ ...input, message })).toBeNull();
    const history: ChatInput['history'] = [{ role: 'user', content: input.message }, { role: 'assistant', content: '创建前需要确认：员工有多条匹配' }];
    expect(assignmentRequest({ ...input, message: '选择 cnc_demo_worker1、DEMO-CNC-007', history })?.userText).toContain(input.message);
    expect(assignmentRequest({ ...input, message: '今天有什么风险？', history })).toBeNull();
    expect(assignmentRequest({ ...input, message: '选择员工1', history: [{ role: 'user', content: input.message }] })).toBeNull();
  });
  it('resolves only current-factory people/orders, uses a persistent idempotency key and returns a task card after commit', async () => {
    const first = await createAssignmentFromChat(actor, input, args);
    const key = mocks.create.mock.calls[0][1].requestId;
    expect(mocks.create.mock.calls[0][1]).toEqual({ title: input.message, description: input.message, assigneeUserId: 'w1', orderId: 'o7', dueDate: null, requestId: key });
    expect(mocks.employees.mock.calls[0][0]).toMatchObject({ where: { workspaceId: 'demo', role: 'employee' }, select: { id: true, displayName: true, username: true } });
    expect(mocks.orders.mock.calls[0][0]).toMatchObject({ where: { workspaceId: 'demo' }, select: { id: true, orderNo: true, partName: true } });
    expect(first.sources[0]).toMatchObject({ kind: 'task', id: 'task1', status: '待处理' });
    mocks.create.mockResolvedValue({ item: { ...item, status: 'in_progress' }, created: false });
    const again = await createAssignmentFromChat(actor, input, args);
    expect(mocks.create.mock.calls[1][1].requestId).toBe(key); expect(again.text).toContain('未重复创建'); expect(again.text).toContain('处理中');
  });
  it('does not write on ambiguous employees, ambiguous orders, missing orders, or unknown/foreign targets', async () => {
    const ambiguous = { ...input, message: '让演示员工去处理铜衬套订单' };
    const result = await createAssignmentFromChat(actor, ambiguous, { assigneeQuery: '演示员工', orderQuery: '铜衬套' });
    expect(result.text).toContain('员工有多条匹配'); expect(result.text).toContain('订单有多条匹配'); expect(result.text).toContain('cnc_demo_worker1');
    mocks.employees.mockResolvedValue([]); mocks.orders.mockResolvedValue([]);
    expect((await createAssignmentFromChat(actor, input, args)).text).toContain('未找到本工厂');
    expect((await createAssignmentFromChat(actor, input, { ...args, orderQuery: '' })).text).toContain('补充具体订单编号');
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('rejects employee writes before database access and ignores model-invented targets', async () => {
    await expect(createAssignmentFromChat({ ...actor, role: 'employee' }, input, args)).rejects.toMatchObject({ status: 403 });
    const answer = await createAssignmentFromChat(actor, input, { ...args, assigneeQuery: 'forged-user' });
    expect(answer.text).toContain('尚未创建'); expect(mocks.employees).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
  it('allows a task without an order when the user never asks to associate one', async () => {
    await createAssignmentFromChat(actor, { ...input, message: '让演示员工1去核对包装清单' }, { assigneeQuery: '演示员工1', orderQuery: '' });
    expect(mocks.create.mock.calls[0][1].orderId).toBeNull(); expect(mocks.orders).not.toHaveBeenCalled();
  });
  it('uses human clarification to choose a unique employee and exact order', async () => {
    const history: ChatInput['history'] = [{ role: 'user', content: '让演示员工去处理铜衬套订单' }, { role: 'assistant', content: '创建前需要确认：员工和订单有多条匹配' }];
    await createAssignmentFromChat(actor, { ...input, message: '选择 cnc_demo_worker2、DEMO-CNC-008', history }, { assigneeQuery: 'cnc_demo_worker2', orderQuery: 'DEMO-CNC-008' });
    expect(mocks.create.mock.calls[0][1]).toMatchObject({ assigneeUserId: 'w2', orderId: 'o8', description: history[0].content });
  });
  it('does not advertise write tools to employees or progress questions, and returns committed task results without a second model call', async () => {
    const assign = vi.fn().mockResolvedValue({ text: '已创建', sources: [{ kind: 'task', id: 'task1' }], queriedAt: 'now' });
    const fetcher = vi.fn().mockImplementation(async () => reply([call]));
    const result = await runAgent(config, input, vi.fn(), fetcher, assign);
    expect(result.text).toBe('已创建'); expect(fetcher).toHaveBeenCalledOnce(); expect(assign).toHaveBeenCalledExactlyOnceWith(args);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).tools.map((t: { name: string }) => t.name)).toEqual(['create_assigned_task']);
    await expect(runAgent(config, input, vi.fn(), fetcher)).rejects.toThrow('不支持的工具');
    await expect(runAgent(config, { ...input, message: '查看订单进度' }, vi.fn(), fetcher, assign)).rejects.toThrow('不支持的工具');
    expect(assign).toHaveBeenCalledOnce();
  });
  it('rejects multiple write calls and client-supplied tenant fields before any commit', async () => {
    const assign = vi.fn();
    await expect(runAgent(config, input, vi.fn(), vi.fn().mockResolvedValue(reply([call, { ...call, call_id: 'second' }])), assign)).rejects.toThrow('每次指派一条');
    await expect(runAgent(config, input, vi.fn(), vi.fn().mockResolvedValue(reply([{ ...call, arguments: JSON.stringify({ ...args, workspaceId: 'foreign' }) }])), assign)).rejects.toThrow('参数无效');
    expect(assign).not.toHaveBeenCalled();
  });
});
