// @vitest-environment node
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
function harness(api: object) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let page: any;
  vm.runInNewContext(readFileSync('miniprogram/pages/tasks/index.js', 'utf8'), { Page: (value: unknown) => { page = value; },
    require: (name: string) => name.endsWith('/tasks') ? { decorate: (v: unknown) => v } : api, wx: { showToast: vi.fn() } });
  page.setData = (data: object) => Object.assign(page.data, data); return page;
}
it("blocks employee creation and reuses the same creation request id after an uncertain response", async () => {
  const uncertain = Object.assign(new Error('timeout'), { uncertain: true });
  const api = { requireAuth: () => true, session: () => ({ token: 'owner' }), request: vi.fn().mockRejectedValue(uncertain) };
  const page = harness(api); page.owner = 'owner'; page.data.title = '核对出货'; page.data.employees = [{ id: 'worker' }];
  await page.submit(); expect(api.request).not.toHaveBeenCalled();
  page.data.manager = true; await Promise.all([page.submit(), page.submit()]);
  expect(api.request).toHaveBeenCalledOnce(); expect(page.data.creating).toBe(false); expect(page.data.error).toContain('待确认');
  const requestId = api.request.mock.calls[0][1].data.requestId;
  await page.submit(); expect(api.request.mock.calls[1][1].data.requestId).toBe(requestId);
  page.data.title = '另一事项'; await page.submit(); expect(api.request.mock.calls[2][1].data.requestId).not.toBe(requestId);
});
it("does not show assignment options returned for a previous account", async () => {
  let token = 'manager'; let resolve: (data: object) => void = () => {};
  const page = harness({ requireAuth: () => true, session: () => ({ token }), request: () => new Promise(r => { resolve = r; }) });
  page.owner = 'manager'; page.data.manager = true; const pending = page.createForm(); token = 'worker';
  resolve({ employees: [{ id: 'private', displayName: 'private name' }], orders: [] }); await pending;
  expect(page.data.showCreate).toBe(false); expect(page.data.employees).toEqual([]);
});
it("updates only an allowlisted target state, prevents duplicate taps and ignores responses after logout", async () => {
  let token = 'owner'; let resolve: (data: object) => void = () => {};
  const request = vi.fn(() => new Promise(r => { resolve = r; }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let page: any;
  const api = { requireAuth: () => true, session: () => ({ token }), request };
  vm.runInNewContext(readFileSync('miniprogram/pages/task/index.js', 'utf8'), { Page: (value: unknown) => { page = value; }, require: (name: string) => name.endsWith('/tasks') ? { decorate: (v: unknown) => v } : api, wx: { showToast: vi.fn() } });
  page.setData = (data: object) => Object.assign(page.data, data); page.data.id = 't1'; page.data.item = { status: 'pending' };
  const event = (status: string) => ({ currentTarget: { dataset: { status } } });
  await page.setStatus(event('fake')); expect(request).not.toHaveBeenCalled();
  const first = page.setStatus(event('in_progress')); await page.setStatus(event('completed'));
  expect(request).toHaveBeenCalledExactlyOnceWith('/tasks/t1/status', { method: 'POST', data: { status: 'in_progress' } });
  token = 'other'; resolve({ item: { status: 'in_progress' } }); await first;
  expect(page.data.item.status).toBe('pending');
});
