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

describe("mini program CloudBase transport", () => {
  const store = new Map<string, unknown>();
  const cloud = { init: vi.fn(), callFunction: vi.fn() };
  const wx = { cloud, request: vi.fn(), reLaunch: vi.fn(),
    getStorageSync: vi.fn((key: string) => store.get(key)),
    setStorageSync: vi.fn((key: string, value: unknown) => store.set(key, value)),
    removeStorageSync: vi.fn((key: string) => store.delete(key)) };
  const load = (env = "factory-env") => loadModule("utils/api.js", { wx }, { "../config": {
    defaultServer: "http://1.2.3.4:18080", connection: { mode: "cloud", env, functionName: "factoryProxy" },
  } });
  beforeEach(() => { store.clear(); vi.resetAllMocks(); });
  it("routes reads and writes through the same free function and keeps business authentication", async () => {
    const api = load(); api.saveSession({ token: "cloud-token", user: {} });
    cloud.callFunction.mockResolvedValue({ result: { statusCode: 200, data: { records: [] } } });
    await api.request("/orders?query=%E8%BD%B4&status=active");
    await api.request("/records", { method: "POST", data: { completedQuantity: 5 } });
    expect(cloud.init).toHaveBeenCalledOnce();
    expect(cloud.init).toHaveBeenCalledWith({ env: "factory-env", traceUser: false });
    expect(cloud.callFunction).toHaveBeenNthCalledWith(1, {
      config: { env: "factory-env" }, name: "factoryProxy",
      data: { method: "GET", path: "/orders?query=%E8%BD%B4&status=active", token: "cloud-token", body: undefined },
    });
    expect(cloud.callFunction).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: { path: "/records", method: "POST", body: { completedQuantity: 5 }, token: "cloud-token" },
    }));
    expect(wx.request).not.toHaveBeenCalled();
    expect(() => api.saveServer("http://other-server")).toThrow("管理员");
  });
  it("does not forward tokens from the old HTTP demo or another cloud environment", async () => {
    store.set("factory_session", { token: "old-http-token" });
    const api = load(); expect(api.session()).toBeNull();
    api.saveSession({ token: "first-env-token" });
    const other = load("other-env");
    cloud.callFunction.mockResolvedValue({ result: { statusCode: 200, data: { machines: [] } } });
    await other.request("/machines");
    expect(cloud.callFunction.mock.calls[0][0].data.token).toBeUndefined();
    expect(other.session()).toBeNull();
  });
  it("keeps failed POST outcomes uncertain without retrying or falling back to HTTP", async () => {
    cloud.callFunction.mockRejectedValue(new Error("timeout"));
    await expect(load().request("/records", { method: "POST", data: {} })).rejects.toMatchObject({ uncertain: true });
    expect(cloud.callFunction).toHaveBeenCalledOnce();
    expect(wx.request).not.toHaveBeenCalled();
  });
  it("handles expired tokens and bad credentials through the same backend contract", async () => {
    const api = load(); api.saveSession({ token: "expired" });
    cloud.callFunction.mockResolvedValueOnce({ result: { statusCode: 401, data: { error: "账号或密码错误" } } });
    await expect(api.request("/auth/login", { method: "POST", auth: false })).rejects.toThrow("账号或密码错误");
    expect(cloud.callFunction.mock.calls[0][0].data.token).toBeUndefined();
    expect(wx.reLaunch).not.toHaveBeenCalled();
    cloud.callFunction.mockResolvedValueOnce({ result: { statusCode: 401, data: { error: "登录过期" } } });
    await expect(api.request("/auth/me")).rejects.toThrow("登录过期");
    expect(api.session()).toBeNull();
    expect(wx.reLaunch).toHaveBeenCalledWith({ url: "/pages/login/index" });
  });
  it("fails before sending credentials if cloud setup is incomplete", async () => {
    await expect(load("").request("/auth/login", { method: "POST", auth: false })).rejects.toThrow("尚未配置");
    expect(cloud.callFunction).not.toHaveBeenCalled(); expect(wx.request).not.toHaveBeenCalled();
  });
  it("treats a missing cloud result as an uncertain write", async () => {
    cloud.callFunction.mockResolvedValue({ result: null });
    await expect(load().request("/records", { method: "POST", data: {} })).rejects.toMatchObject({ uncertain: true });
    expect(cloud.callFunction).toHaveBeenCalledOnce(); expect(wx.request).not.toHaveBeenCalled();
  });
});

describe("mini program fixed HTTPS gateway", () => {
  const store = new Map<string, unknown>();
  const wx = { request: vi.fn(), reLaunch: vi.fn(), getStorageSync: vi.fn((key: string) => store.get(key)),
    setStorageSync: vi.fn((key: string, value: unknown) => store.set(key, value)), removeStorageSync: vi.fn((key: string) => store.delete(key)) };
  const gateway = "https://factory-demo.example/factory-proxy";
  const load = (url = gateway) => loadModule("utils/api.js", { wx }, { "../config": {
    defaultServer: "http://old-demo:18080", connection: { mode: "gateway", url },
  } });
  beforeEach(() => { store.clear(); vi.resetAllMocks(); });
  it("sends login and authenticated writes only to the fixed gateway with an explicit envelope", async () => {
    const api = load();
    const login = api.request("/auth/login", { method: "POST", auth: false, data: { username: "worker", password: "test" } });
    expect(wx.request.mock.calls[0][0]).toMatchObject({ url: gateway, method: "POST",
      data: { method: "POST", path: "/auth/login", body: { username: "worker", password: "test" } } });
    expect(wx.request.mock.calls[0][0].header.Authorization).toBeUndefined();
    wx.request.mock.calls[0][0].success({ statusCode: 200, data: { token: "business-token" } }); await login;
    api.saveSession({ token: "business-token" });
    const saved = api.request("/records", { method: "POST", data: { completedQuantity: 11, shippedQuantity: 4 } });
    expect(wx.request.mock.calls[1][0]).toMatchObject({ url: gateway, method: "POST", data: {
      path: "/records", token: "business-token", body: { completedQuantity: 11, shippedQuantity: 4 } } });
    wx.request.mock.calls[1][0].success({ statusCode: 201, data: { records: [] } }); await saved;
    expect(api.connectionInfo()).toMatchObject({ cloud: true });
    expect(() => api.saveServer("http://other-server")).toThrow("管理员");
  });
  it("drops credentials when switching gateway and never retries an uncertain write", async () => {
    const api = load(); api.saveSession({ token: "old" });
    expect(load("https://other.example/factory-proxy").session()).toBeNull();
    const pending = api.request("/records", { method: "POST", data: {} });
    const rejected = expect(pending).rejects.toMatchObject({ uncertain: true });
    wx.request.mock.calls[0][0].fail(); await rejected;
    expect(wx.request).toHaveBeenCalledOnce();
    await expect(load("http://unsafe.example/factory-proxy").request("/auth/login", { method: "POST", auth: false })).rejects.toThrow("尚未配置");
    expect(wx.request).toHaveBeenCalledOnce();
  });
  it("marks an HTML or malformed success response as an uncertain write", async () => {
    const pending = load().request("/records", { method: "POST", data: {} });
    const rejected = expect(pending).rejects.toMatchObject({ uncertain: true });
    wx.request.mock.calls[0][0].success({ statusCode: 200, data: "<html>unexpected response</html>" });
    await rejected; expect(wx.request).toHaveBeenCalledOnce();
  });
});

// Exercise native Page logic with the same API contract, without mocking the submit implementation.
describe("native cloud login", () => {
  it("uses the fixed cloud connection instead of saving the old editable server", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let page: any;
    const api = { getServer: vi.fn(() => "http://old-demo:18080"), connectionInfo: vi.fn(() => ({ cloud: true })),
      session: vi.fn(() => null), saveServer: vi.fn(), saveSession: vi.fn(),
      request: vi.fn().mockResolvedValue({ token: "token", user: {} }) };
    const wx = { switchTab: vi.fn(), showTabBar: vi.fn() };
    loadModule("pages/login/index.js", { wx, Page: (definition: unknown) => { page = definition; } }, { "../../utils/api": api });
    page.data = structuredClone(page.data);
    page.setData = (values: object) => Object.assign(page.data, values);
    page.onLoad();
    page.data.username = " worker "; page.data.password = "password";
    await page.login();
    expect(page.data.cloud).toBe(true); expect(api.saveServer).not.toHaveBeenCalled();
    expect(api.request).toHaveBeenCalledWith("/auth/login", { method: "POST", auth: false,
      data: { username: "worker", password: "password" } });
    expect(api.saveSession).toHaveBeenCalledWith({ token: "token", user: {} });
    expect(page.data.password).toBe("");
    expect(wx.switchTab).toHaveBeenCalledWith({ url: "/pages/assistant/index" });
  });
});

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
