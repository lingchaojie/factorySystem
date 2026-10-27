// @vitest-environment node
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

// Native page harness; assert access boundaries and actual event handlers.
const localRequire = createRequire(import.meta.url);
function pageAt(path: string, api: object, wx: object) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let page: any;
  vm.runInNewContext(readFileSync("miniprogram/pages/" + path + "/index.js", "utf8"), {
    require: (name: string) => name.endsWith('/chat') ? chat : name.endsWith('/credits') ? localRequire('../../miniprogram/assets/company/credits.js') : api, wx, Page: (value: unknown) => { page = value; }, setTimeout, clearTimeout,
  });
  page.data = structuredClone(page.data);
  page.setData = (value: object) => Object.assign(page.data, value);
  return page;
}

const chatModule = { exports: {} as { buildQuery: (messages: object[], message: string, requestId: string) => { history: object[] } } };
vm.runInNewContext(readFileSync("miniprogram/utils/chat.js", "utf8"), { module: chatModule });
const chat = chatModule.exports;

describe("public CNC introduction and private assistant", () => {
  it("keeps long Chinese/emoji conversations within the real gateway byte limit", () => {
    const messages = Array.from({ length: 12 }, (_, i) => ({ id: String(i), role: i % 2 ? "assistant" : "user", text: "车间🛠️".repeat(400) }));
    const body = chat.buildQuery(messages, "查询进度".repeat(100), "request-00000001");
    expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThanOrEqual(12000);
    expect(body.history.length).toBeLessThan(8);
  });
  it("shows a public landing page without loading business data and routes visitors to login", () => {
    const wx = { hideTabBar: vi.fn(), showTabBar: vi.fn(), navigateTo: vi.fn(), switchTab: vi.fn() };
    const api = { session: vi.fn(() => null), request: vi.fn() };
    const page = pageAt("home", api, wx); page.onShow(); page.enter();
    expect(page.data.loggedIn).toBe(false); expect(api.request).not.toHaveBeenCalled();
    const config = JSON.parse(readFileSync('miniprogram/app.json', 'utf8'));
    expect(config.pages[0]).toBe('pages/home/index');
    expect(config.tabBar.list).toHaveLength(5);
    expect(config.tabBar.list[0].pagePath).toBe('pages/workbench/index');
    expect(wx.navigateTo).toHaveBeenCalledWith({ url: "/pages/login/index" });
  });
  it("blocks direct anonymous chat access and never calls the model", async () => {
    const api = { requireAuth: vi.fn(() => false), request: vi.fn() };
    const page = pageAt("assistant", api, {}); page.onShow(); page.data.draft = "查订单"; await page.send();
    expect(api.request).not.toHaveBeenCalled();
  });
  it("switches the public sidebar only between known sections without requesting factory data", () => {
    const api = { session: () => null, request: vi.fn() };
    const page = pageAt("home", api, {});
    page.selectSection({ currentTarget: { dataset: { section: "products" } } });
    expect(page.data.activeSection).toBe("products");
    page.selectSection({ currentTarget: { dataset: { section: "admin" } } });
    expect(page.data.activeSection).toBe("products"); expect(api.request).not.toHaveBeenCalled();
  });
  it("previews only bundled known photos and credits each file", () => {
    const wx = { previewImage: vi.fn(), setClipboardData: vi.fn() };
    const page = pageAt("home", {}, wx);
    page.previewPhoto({ currentTarget: { dataset: { photo: "gears" } } });
    expect(wx.previewImage).toHaveBeenCalledWith(expect.objectContaining({ current: "/assets/company/gears.jpg" }));
    page.previewPhoto({ currentTarget: { dataset: { photo: "https://unknown.example" } } });
    expect(wx.previewImage).toHaveBeenCalledOnce();
    page.copyCredit({ currentTarget: { dataset: { id: "gears" } } });
    expect(wx.setClipboardData.mock.calls[0][0].data).toContain("creativecommons.org/licenses/by-sa/4.0");
    for (const credit of page.data.imageCredits) expect(readFileSync('miniprogram/assets/company/' + credit.filename).byteLength).toBeGreaterThan(1000);
  });
  it("submits an authenticated query directly without a provider confirmation, and locks duplicate taps", async () => {
    const api = { requireAuth: vi.fn(() => true), session: vi.fn(() => ({ token: "owner" })),
      request: vi.fn().mockResolvedValue({ job: { id: "job1" } }) };
    const wx = { showModal: vi.fn() };
    const page = pageAt("assistant", api, wx);
    page.owner = "owner"; page.data.configured = true; page.data.checking = false; page.data.draft = "查1号机";
    await Promise.all([page.send(), page.send()]);
    expect(wx.showModal).not.toHaveBeenCalled();
    expect(api.request).toHaveBeenCalledExactlyOnceWith("/assistant", { method: "POST", data: expect.objectContaining({ message: "查1号机", consent: true }) });
    expect(page.data.pendingJob).toBe("job1"); expect(page.data.busy).toBe(true);
  });
  it("creates a single query, polls its result and accepts only allowlisted source links", async () => {
    const api = { requireAuth: vi.fn(() => true), session: vi.fn(() => ({ token: "owner" })),
      request: vi.fn().mockResolvedValueOnce({ job: { id: "job1" } }).mockResolvedValueOnce({ job: { state: "completed", answer: { text: "加工11件", sources: [{ kind: "machine", id: "m1" }], queriedAt: "" } } }) };
    const wx = { navigateTo: vi.fn() };
    const page = pageAt("assistant", api, wx); page.owner = "owner"; page.active = true;
    Object.assign(page.data, { configured: true, checking: false, draft: "查1号机" });
    await page.send(); await Promise.resolve();
    expect(api.request.mock.calls.map(c => c[0])).toEqual(["/assistant", "/assistant/jobs/job1"]);
    expect(page.data.messages.at(-1).text).toBe("加工11件"); expect(page.data.busy).toBe(false);
    page.openSource({ currentTarget: { dataset: { kind: "machine", id: "m1" } } });
    expect(wx.navigateTo).toHaveBeenCalledWith({ url: "/pages/machine/index?id=m1" });
    page.openSource({ currentTarget: { dataset: { kind: "admin", id: "m1" } } });
    expect(wx.navigateTo).toHaveBeenCalledOnce();
    page.openSource({ currentTarget: { dataset: { kind: "task", id: "task1" } } });
    expect(wx.navigateTo).toHaveBeenLastCalledWith({ url: "/pages/task/index?id=task1" });
    page.onHide();
  });
  it("reuses the entire request after an uncertain submission without duplicating the user's message", async () => {
    const api = { requireAuth: () => true, session: () => ({ token: 'owner' }), request: vi.fn().mockRejectedValue(Object.assign(new Error('timeout'), { uncertain: true })) };
    const page = pageAt('assistant', api, {}); page.owner = 'owner';
    Object.assign(page.data, { configured: true, checking: false, draft: '让员工1跟进订单007' });
    await page.send(); const original = api.request.mock.calls[0][1].data;
    expect(page.data.draft).toBe('让员工1跟进订单007'); await page.send();
    expect(api.request.mock.calls[1][1].data).toEqual(original);
    expect(page.data.messages.filter((m: { role: string }) => m.role === 'user')).toHaveLength(1);
  });
});
