// @vitest-environment node
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
type ProxyResult = { statusCode: number; data: Record<string, unknown> };
const { createProxy, createHandler } = require("../../cloudfunctions/factoryProxy/index.js") as {
  createProxy: (origin: string, timeout?: number) => (event: object) => Promise<{ statusCode: number; data: Record<string, unknown> }>;
  createHandler: (proxy: (event: object) => Promise<ProxyResult>) => (event: object) => Promise<{
    statusCode: number; body?: string; headers?: Record<string, string>; data?: Record<string, unknown>;
  }>;
};
const token = "a".repeat(43);
const servers: ReturnType<typeof createServer>[] = [];
async function upstream(handler: (req: IncomingMessage, res: ServerResponse) => void) {
  const server = createServer(handler); servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
    server.closeAllConnections(); server.close(() => resolve());
  })));
});

describe("free cloud function proxy over real HTTP", () => {
  it("unwraps gateway JSON while preserving backend status and the SDK call contract", async () => {
    const seen: string[] = [];
    const handler = createHandler(createProxy(await upstream((req, res) => {
      seen.push(req.url!);
      res.writeHead(401, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "登录已过期" }));
    })));
    const result = await handler({ httpMethod: "POST", path: "/", headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ method: "GET", path: "/machines", token }) });
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body!)).toEqual({ error: "登录已过期" });
    expect(result.headers?.["cache-control"]).toBe("no-store");
    expect(await handler({ path: "/orders", token })).toEqual({ statusCode: 401, data: { error: "登录已过期" } });
    expect(seen).toEqual(["/api/miniapp/machines", "/api/miniapp/orders"]);
  });
  it("rejects invalid gateway envelopes and arbitrary nested targets before contacting upstream", async () => {
    let calls = 0;
    const handler = createHandler(createProxy(await upstream((_req, res) => { calls++; res.end(); })));
    const event = { httpMethod: "POST", path: "/", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: "/machines", token }) };
    for (const patch of [{ httpMethod: "GET" }, { path: "/factory-proxy/extra" }, { isBase64Encoded: true },
      { body: "not-json" }, { body: "x".repeat(21000) }, { headers: { "content-type": "text/plain" } },
      { body: JSON.stringify({ path: "http://untrusted.invalid/orders", token }) }]) {
      const result = await handler({ ...event, ...patch });
      expect(result.statusCode).toBe(400); expect(JSON.parse(result.body!)).toHaveProperty("error");
    }
    expect(calls).toBe(0);
  });
  it("forwards login and search to the fixed upstream without cookies or arbitrary headers", async () => {
    const requests: { url?: string; authorization?: string; body: string; cookie?: string }[] = [];
    const origin = await upstream((req, res) => {
      let body = ""; req.on("data", chunk => { body += chunk; });
      req.on("end", () => {
        requests.push({ url: req.url, authorization: req.headers.authorization, body, cookie: req.headers.cookie });
        res.writeHead(200, { "content-type": "application/json; charset=utf-8", "set-cookie": "do-not-forward=1" });
        res.end(JSON.stringify(req.url?.includes("login") ? { token, user: { role: "employee" } } : { orders: [] }));
      });
    });
    const proxy = createProxy(origin);
    expect(await proxy({ method: "POST", path: "/auth/login", token, body: { username: "worker", password: "password" },
      origin: "http://untrusted.invalid", headers: { Cookie: "browser-session", Authorization: "other" } }))
      .toEqual({ statusCode: 200, data: { token, user: { role: "employee" } } });
    expect(await proxy({ method: "GET", path: "/orders?query=%E8%BD%B4&status=in_progress", token }))
      .toEqual({ statusCode: 200, data: { orders: [] } });
    expect(requests).toEqual([
      { url: "/api/miniapp/auth/login", authorization: undefined, body: '{"username":"worker","password":"password"}', cookie: undefined },
      { url: "/api/miniapp/orders?query=%E8%BD%B4&status=in_progress", authorization: `Bearer ${token}`, body: "", cookie: undefined },
    ]);
  });
  it("allows only authenticated assistant submission and job reads, not arbitrary agent routes", async () => {
    const requests: string[] = [];
    const proxy = createProxy(await upstream((req, res) => { requests.push(req.url!); res.writeHead(200, { "content-type": "application/json" }); res.end('{"job":{"state":"pending"}}'); }));
    expect((await proxy({ method: "POST", path: "/assistant", token, body: { message: "查进度" } })).statusCode).toBe(200);
    expect((await proxy({ path: "/assistant/jobs/test-job", token })).statusCode).toBe(200);
    expect((await proxy({ path: "/assistant/jobs/test-job" })).statusCode).toBe(401);
    expect((await proxy({ method: "POST", path: "/assistant/jobs/test-job", token })).statusCode).toBe(400);
    expect((await proxy({ path: "/assistant?url=http://evil.invalid", token })).statusCode).toBe(400);
    expect(requests).toEqual(["/api/miniapp/assistant", "/api/miniapp/assistant/jobs/test-job"]);
  });
  it("preserves record creation, validation errors, expired tokens and logout status", async () => {
    const results = [
      { statusCode: 201, data: { records: [{ quantity: 11 }, { quantity: 4 }] } },
      { statusCode: 400, data: { error: "机器未关联该订单，不能录入记录" } },
      { statusCode: 401, data: { error: "登录已过期，请重新登录" } },
      { statusCode: 200, data: { ok: true } },
    ];
    const origin = await upstream((_req, res) => {
      const value = results.shift()!;
      res.writeHead(value.statusCode, { "content-type": "application/json" }); res.end(JSON.stringify(value.data));
    });
    const proxy = createProxy(origin);
    const written = await proxy({ method: "POST", path: "/records", token, body: { completedQuantity: 11, shippedQuantity: 4 } });
    expect(written).toMatchObject({ statusCode: 201, data: { records: [{ quantity: 11 }, { quantity: 4 }] } });
    expect(await proxy({ method: "POST", path: "/records", token, body: {} })).toMatchObject({ statusCode: 400 });
    expect(await proxy({ method: "GET", path: "/auth/me", token })).toMatchObject({ statusCode: 401 });
    expect(await proxy({ method: "POST", path: "/auth/logout", token })).toMatchObject({ statusCode: 200 });
  });
  it("rejects arbitrary URLs, traversal, unauthorized routes and oversized bodies before contacting upstream", async () => {
    let calls = 0;
    const proxy = createProxy(await upstream((_req, res) => { calls++; res.end(); }));
    for (const path of ["http://evil.invalid/orders", "//evil.invalid/orders", "/../orders", "/orders/../../admin",
      "/orders/%2e%2e", "/orders\\admin", "/admin", "/auth/login?target=evil", "/orders?url=http://evil.invalid"]) {
      expect((await proxy({ method: "GET", path, token })).statusCode).toBe(400);
    }
    expect((await proxy({ method: "DELETE", path: "/orders", token })).statusCode).toBe(400);
    expect((await proxy({ method: "POST", path: "/records", token, body: { notes: "x".repeat(20000) } })).statusCode).toBe(400);
    expect((await proxy({ path: "/machines" })).statusCode).toBe(401);
    expect((await proxy({ path: "/machines", token: "x\r\ny" })).statusCode).toBe(401);
    expect(calls).toBe(0);
  });
  it("does not follow redirects or return HTML/error internals", async () => {
    let calls = 0;
    const proxy = createProxy(await upstream((_req, res) => {
      calls++;
      if (calls === 1) res.writeHead(302, { location: "/api/miniapp/auth/login" });
      else res.writeHead(500, { "content-type": "text/html" });
      res.end("private stack trace");
    }));
    for (let n = 0; n < 2; n++) {
      const result = await proxy({ path: "/auth/me", token });
      expect(result.statusCode).toBe(502); expect(JSON.stringify(result)).not.toContain("private stack trace");
    }
    expect(calls).toBe(2);
  });
  it("limits response size and rejects malformed JSON", async () => {
    let calls = 0;
    const proxy = createProxy(await upstream((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(++calls === 1 ? '{"data":"' + "x".repeat(1024 * 1024) + '"}' : "invalid JSON");
    }));
    expect((await proxy({ path: "/orders", token })).statusCode).toBe(502);
    expect((await proxy({ path: "/orders", token })).statusCode).toBe(502);
  });
  it("bounds the entire upstream request and never retries a timed-out write", async () => {
    let calls = 0;
    const proxy = createProxy(await upstream(() => { calls++; }), 50);
    const start = Date.now();
    expect((await proxy({ method: "POST", path: "/records", token, body: {} })).statusCode).toBe(504);
    expect(calls).toBe(1); expect(Date.now() - start).toBeLessThan(1000);
  });
});
