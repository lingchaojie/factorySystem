// @vitest-environment node
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

// Native page harness; assert access boundaries and actual event handlers.
function pageAt(path: string, api: object, wx: object) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let page: any;
  vm.runInNewContext(readFileSync("miniprogram/pages/" + path + "/index.js", "utf8"), {
    require: () => api, wx, Page: (value: unknown) => { page = value; }, setTimeout, clearTimeout,
  });
  page.data = structuredClone(page.data);
  page.setData = (value: object) => Object.assign(page.data, value);
  return page;
}

describe("public CNC introduction and private assistant", () => {
  it("shows a public landing page without loading business data and routes visitors to login", () => {
    const wx = { hideTabBar: vi.fn(), showTabBar: vi.fn(), navigateTo: vi.fn(), switchTab: vi.fn() };
    const api = { session: vi.fn(() => null), request: vi.fn() };
    const page = pageAt("home", api, wx); page.onShow(); page.enter();
    expect(wx.hideTabBar).toHaveBeenCalledOnce(); expect(api.request).not.toHaveBeenCalled();
    expect(wx.navigateTo).toHaveBeenCalledWith({ url: "/pages/login/index" });
  });
  it("blocks direct anonymous chat access and never calls the model", async () => {
    const api = { requireAuth: vi.fn(() => false), request: vi.fn() };
    const page = pageAt("assistant", api, {}); page.onShow(); page.data.draft = "查订单"; await page.send();
    expect(api.request).not.toHaveBeenCalled();
  });
  it("asks before sharing data and does not submit when consent is declined", async () => {
    const token = { token: "owner" };
    const api = { requireAuth: vi.fn(() => true), session: vi.fn(() => token), request: vi.fn() };
    const wx = { showModal: vi.fn((options: { success: (r: { confirm: boolean }) => void }) => options.success({ confirm: false })) };
    const page = pageAt("assistant", api, wx);
    page.owner = "owner"; page.data.configured = true; page.data.checking = false; page.data.providerHost = "provider.example"; page.data.draft = "查1号机";
    await page.send();
    expect(wx.showModal.mock.calls[0][0]).toMatchObject({ content: expect.stringContaining("provider.example") });
    expect(api.request).not.toHaveBeenCalled(); expect(page.data.busy).toBe(false);
  });
  it("creates a single query, polls its result and accepts only allowlisted source links", async () => {
    const api = { requireAuth: vi.fn(() => true), session: vi.fn(() => ({ token: "owner" })),
      request: vi.fn().mockResolvedValueOnce({ job: { id: "job1" } }).mockResolvedValueOnce({ job: { state: "completed", answer: { text: "加工11件", sources: [{ kind: "machine", id: "m1" }], queriedAt: "" } } }) };
    const wx = { navigateTo: vi.fn() };
    const page = pageAt("assistant", api, wx); page.owner = "owner"; page.active = true;
    Object.assign(page.data, { configured: true, checking: false, consent: true, draft: "查1号机" });
    await page.send(); await Promise.resolve();
    expect(api.request.mock.calls.map(c => c[0])).toEqual(["/assistant", "/assistant/jobs/job1"]);
    expect(page.data.messages.at(-1).text).toBe("加工11件"); expect(page.data.busy).toBe(false);
    page.openSource({ currentTarget: { dataset: { kind: "machine", id: "m1" } } });
    expect(wx.navigateTo).toHaveBeenCalledWith({ url: "/pages/machine/index?id=m1" });
    page.openSource({ currentTarget: { dataset: { kind: "admin", id: "m1" } } });
    expect(wx.navigateTo).toHaveBeenCalledOnce();
    page.onHide();
  });
});
