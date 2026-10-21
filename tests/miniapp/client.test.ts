// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { beforeEach, describe, expect, it, vi } from "vitest";

function loadModule(file: string, globals: Record<string, unknown>, imports: Record<string, unknown> = {}) {
  const commonJsModule = { exports: {} as Record<string, (...args: unknown[]) => unknown> };
  vm.runInNewContext(readFileSync(resolve("miniprogram", file), "utf8"), {
    ...globals, module: commonJsModule, require: (name: string) => imports[name],
  }, { filename: file });
  return commonJsModule.exports;
}

describe("mini program transport", () => {
  const store = new Map<string, unknown>();
  const wx = { getStorageSync: vi.fn((key: string) => store.get(key)),
    setStorageSync: vi.fn((key: string, value: unknown) => store.set(key, value)),
    removeStorageSync: vi.fn((key: string) => store.delete(key)), request: vi.fn(), reLaunch: vi.fn() };
  const load = () => loadModule("utils/api.js", { wx }, { "../config": { defaultServer: "http://127.0.0.1:3000" } });
  beforeEach(() => { store.clear(); vi.clearAllMocks(); });
  it("uses the entered IP and sends only the saved Bearer token", async () => {
    const api = load(); api.saveServer(" http://1.2.3.4:18080/ "); api.saveSession({ token: "secret", user: {} });
    const pending = api.request("/machines") as Promise<unknown>;
    const options = wx.request.mock.calls[0][0];
    expect(options.url).toBe("http://1.2.3.4:18080/api/miniapp/machines");
    expect(options.header.Authorization).toBe("Bearer secret");
    options.success({ statusCode: 200, data: { machines: [] } });
    expect(await pending).toEqual({ machines: [] });
  });
  it("drops tokens when changing server, and rejects paths and credentials in the origin", () => {
    const api = load(); api.saveSession({ token: "old" }); api.saveServer("http://1.2.3.4:18080");
    expect(api.session()).toBeNull();
    for (const value of ["http://a/login", "http://user:pass@a", "http://a?x=1", "javascript:alert(1)"]) {
      expect(() => api.normalizeServer(value)).toThrow();
    }
  });
  it("clears expired authentication and returns to login", async () => {
    const api = load(); api.saveSession({ token: "expired" });
    const pending = api.request("/orders") as Promise<unknown>;
    const rejection = expect(pending).rejects.toThrow("登录过期");
    wx.request.mock.calls[0][0].success({ statusCode: 401, data: { error: "登录过期" } });
    await rejection;
    expect(api.session()).toBeNull(); expect(wx.reLaunch).toHaveBeenCalledWith({ url: "/pages/login/index" });
  });
  it("does not send an existing token or redirect on bad login credentials", async () => {
    const api = load(); api.saveSession({ token: "old" });
    const pending = api.request("/auth/login", { method: "POST", auth: false, data: { username: "worker", password: "bad" } }) as Promise<unknown>;
    const rejection = expect(pending).rejects.toThrow("账号或密码错误");
    expect(wx.request.mock.calls[0][0].header.Authorization).toBeUndefined();
    wx.request.mock.calls[0][0].success({ statusCode: 401, data: { error: "账号或密码错误" } });
    await rejection; expect(wx.reLaunch).not.toHaveBeenCalled();
  });
  it("never automatically retries a failed record submission", async () => {
    const api = load(); const pending = api.request("/records", { method: "POST", data: {} }) as Promise<unknown>;
    const rejection = expect(pending).rejects.toMatchObject({ uncertain: true });
    wx.request.mock.calls[0][0].fail(); await rejection;
    expect(wx.request).toHaveBeenCalledTimes(1);
  });
});

// Exercise native Page logic with the same API contract, without mocking the submit implementation.
describe("native production page", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let page: any;
  const api = { requireAuth: vi.fn(() => true), request: vi.fn() };
  const wx = { showModal: vi.fn(), showToast: vi.fn(), navigateTo: vi.fn() };
  beforeEach(() => {
    vi.resetAllMocks(); api.requireAuth.mockReturnValue(true);
    const format = loadModule("utils/format.js", {});
    loadModule("pages/machine/index.js", { wx, Page: (definition: unknown) => { page = definition; } }, {
      "../../utils/api": api, "../../utils/format": format,
    });
    page.data = structuredClone(page.data);
    page.setData = (values: object) => Object.assign(page.data, values);
    page.onLoad({ id: "m1", orderId: "o2" });
  });
  const machine = { id: "m1", name: "1号机", status: "active", todayCompleted: 0, todayShipped: 0,
    orders: [{ id: "o1", customerName: "甲", partName: "法兰" }, { id: "o2", customerName: "乙", partName: "轴套" }] };
  it("selects the order used to navigate from order detail", async () => {
    api.request.mockResolvedValue({ machine }); await page.load();
    expect(page.data.selectedOrder.id).toBe("o2");
  });
  it("locks rapid taps before confirmation and writes exactly once", async () => {
    api.request.mockResolvedValue({ machine }); await page.load();
    page.data.completedQuantity = "12"; page.data.shippedQuantity = "3";
    const pending = page.submit(); await page.submit();
    expect(wx.showModal).toHaveBeenCalledTimes(1);
    wx.showModal.mock.calls[0][0].success({ confirm: true });
    await pending;
    expect(api.request.mock.calls.filter(c => c[0] === "/records")).toHaveLength(1);
    expect(api.request).toHaveBeenCalledWith("/records", { method: "POST", data: {
      machineId: "m1", orderId: "o2", completedQuantity: 12, shippedQuantity: 3, notes: "",
    } });
    expect(page.data.completedQuantity).toBe(""); expect(page.data.submitting).toBe(false);
  });
  it("locks further submissions after an uncertain network failure", async () => {
    api.request.mockResolvedValueOnce({ machine }); await page.load();
    page.data.completedQuantity = "12";
    wx.showModal.mockImplementation(options => options.success({ confirm: true }));
    api.request.mockRejectedValueOnce(Object.assign(new Error("timeout"), { uncertain: true }));
    await page.submit(); await page.submit();
    expect(page.data.uncertain).toBe(true);
    expect(api.request.mock.calls.filter(c => c[0] === "/records")).toHaveLength(1);
    expect(page.data.error).toContain("到网站核对");
  });
  it("clears successful input even when the subsequent refresh fails", async () => {
    api.request.mockResolvedValueOnce({ machine }); await page.load(); page.data.shippedQuantity = "4";
    wx.showModal.mockImplementation(options => options.success({ confirm: true }));
    api.request.mockResolvedValueOnce({ records: [] }).mockRejectedValueOnce(new Error("refresh failed"));
    await page.submit();
    expect(page.data.shippedQuantity).toBe(""); expect(page.data.error).toBe("refresh failed");
    expect(wx.showToast).toHaveBeenCalledWith({ title: "记录已保存", icon: "success" });
  });
  it("rejects zero, fractional and negative quantities without a request", async () => {
    api.request.mockResolvedValue({ machine }); await page.load(); api.request.mockClear();
    await page.submit();
    expect(page.data.error).toContain("至少填写");
    for (const value of ["-1", "1.5", "2147483648"]) {
      page.data.completedQuantity = value; await page.submit();
    }
    expect(api.request).not.toHaveBeenCalled(); expect(wx.showModal).not.toHaveBeenCalled();
  });
});
