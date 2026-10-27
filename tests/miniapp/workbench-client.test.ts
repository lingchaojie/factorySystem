// @vitest-environment node
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
function harness(api: object) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let page: any;
  vm.runInNewContext(readFileSync('miniprogram/pages/workbench/index.js', 'utf8'), {
    Page: (value: unknown) => { page = value; }, wx: {}, require: (name: string) => name.endsWith('/chat') ? { queryTime: () => '12:00' } : api,
  });
  page.setData = (data: object) => Object.assign(page.data, data);
  return page;
}
const result = { items: [{ id: 'demo-order', machines: [{ code: 'CNC-01' }] }], summary: { shipmentOrders: 25 }, page: 1, total: 25, hasMore: true, queriedAt: '' };
it("guards direct anonymous workbench access and ignores a previous account's late response", async () => {
  const anonymous = { requireAuth: () => false, request: vi.fn() };
  await harness(anonymous).load(); expect(anonymous.request).not.toHaveBeenCalled();
  let token = 'demo'; let resolve: (value: object) => void = () => {};
  const page = harness({ requireAuth: () => true, session: () => ({ token }), request: () => new Promise(r => { resolve = r; }) });
  const pending = page.load(); token = 'another'; resolve(result); await pending;
  expect(page.data.items).toEqual([]); expect(page.data.summary).toBeNull();
});
it("discards stale searches and loads more without dropping complete summary totals", async () => {
  let resolve: (value: object) => void = () => {};
  const api = { requireAuth: () => true, session: () => ({ token: 'demo' }), request: vi.fn()
    .mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValueOnce(result)
    .mockResolvedValueOnce({ ...result, page: 2, hasMore: false, items: [{ id: 'demo-next', machines: [] }] }) };
  const page = harness(api); const old = page.load(); page.data.query = 'CNC'; await page.load(); resolve({ ...result, items: [] }); await old;
  expect(page.data.items[0].id).toBe('demo-order');
  page.data.query = 'unsubmitted draft'; await page.more();
  expect(page.data.items.map((o: {id: string}) => o.id)).toEqual(['demo-order', 'demo-next']);
  expect(page.data.summary.shipmentOrders).toBe(25); expect(page.data.hasMore).toBe(false);
  expect(api.request.mock.calls[2][0]).toBe('/workbench?view=risks&page=2&query=CNC');
});
