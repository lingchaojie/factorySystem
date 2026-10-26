// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { chatInput, providerConfig, runAgent, type ChatInput } from "@/server/assistant/agent";
import { createJobStore } from "@/server/assistant/jobs";

const input: ChatInput = { message: "1 号机加工了多少？", history: [], requestId: "request-00000001", consent: true };
const result = { items: [{ kind: "machine" as const, id: "m1", title: "1 · 1号机", status: "运行中", summary: "今日加工 11 件，今日出货 4 件" }], hasMore: false, queriedAt: "2026-10-26T10:00:00Z" };
const config = { baseUrl: "https://provider.example", apiKey: "server-only-test-key", model: "test-model" };
const call = { type: "function_call", call_id: "call-1", name: "lookup_progress", arguments: JSON.stringify({ kind: "machine", query: "1", id: "" }) };
const reply = (output: object[]) => new Response(JSON.stringify({ status: "completed", output }), { headers: { "content-type": "application/json" } });

describe("read-only factory assistant", () => {
  it("requires explicit sharing configuration and a trusted HTTPS provider", () => {
    expect(providerConfig({ FACTORY_AI_BASE_URL: config.baseUrl, FACTORY_AI_API_KEY: "key", FACTORY_AI_MODEL: "model" })).toBeNull();
    const env = { FACTORY_AI_BASE_URL: config.baseUrl, FACTORY_AI_API_KEY: "key", FACTORY_AI_MODEL: "model", FACTORY_AI_DATA_SHARING_ENABLED: "true" };
    expect(providerConfig(env)?.model).toBe("model");
    for (const url of ["http://provider.example", "https://user:pass@provider.example", "https://provider.example?key=x"]) expect(providerConfig({ ...env, FACTORY_AI_BASE_URL: url })).toBeNull();
    expect(chatInput.safeParse({ ...input, consent: false }).success).toBe(false);
    expect(chatInput.safeParse({ ...input, workspaceId: "another" }).success).toBe(false);
  });
  it("executes real query tools and returns only server-supplied source cards", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(reply([call])).mockResolvedValueOnce(reply([{ type: "message", content: [{ type: "output_text", text: "本次查询：1号机今日加工11件、出货4件。" }] }]));
    const lookup = vi.fn().mockResolvedValue(result);
    const answer = await runAgent(config, input, lookup, fetcher);
    expect(lookup).toHaveBeenCalledExactlyOnceWith({ kind: "machine", query: "1", id: "" });
    expect(answer.sources).toEqual(result.items);
    const first = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(first.store).toBe(false); expect(first.tool_choice).toBe("required");
    expect(first.tools.map((t: { name: string }) => t.name)).toEqual(["lookup_progress"]);
    const second = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(second.input.at(-1)).toMatchObject({ type: "function_call_output", call_id: "call-1" });
    expect(second.input.at(-1).output).toContain("今日加工 11");
    expect(JSON.stringify(first)).not.toContain(config.apiKey);
    expect(fetcher.mock.calls[0][1].redirect).toBe("error");
  });
  it("rejects invented progress, write tools, workspace arguments and unbounded tool loops", async () => {
    const lookup = vi.fn().mockResolvedValue(result);
    await expect(runAgent(config, input, lookup, vi.fn().mockResolvedValue(reply([{ type: "message", content: [{ type: "output_text", text: "加工 99" }] }])))).rejects.toThrow("实时查询");
    await expect(runAgent(config, input, lookup, vi.fn().mockResolvedValue(reply([{ ...call, name: "write_record" }])))).rejects.toThrow("不支持的工具");
    await expect(runAgent(config, input, lookup, vi.fn().mockResolvedValue(reply([{ ...call, arguments: JSON.stringify({ kind: "order", query: "", id: "", workspaceId: "other" }) }])))).rejects.toThrow("参数无效");
    expect(lookup).not.toHaveBeenCalled();
    const fetcher = vi.fn().mockImplementation(async () => reply([call]));
    await expect(runAgent(config, input, lookup, fetcher)).rejects.toThrow("过于复杂");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("never retries or exposes a provider error body or secret", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("private-key-and-provider-debug", { status: 401 }));
    await expect(runAgent(config, input, vi.fn(), fetcher)).rejects.toThrow("模型服务暂不可用");
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

describe("temporary query jobs", () => {
  const actor = { id: "u1", workspaceId: "w1" };
  const answer = { text: "进度", sources: result.items, queriedAt: result.queriedAt };
  it("returns immediately, deduplicates completed requests and hides other users' jobs", async () => {
    const store = createJobStore(); const run = vi.fn().mockResolvedValue(answer);
    const started = store.create(actor, input, run);
    expect(run).not.toHaveBeenCalled(); expect(started.job.state).toBe("pending");
    expect(store.create(actor, input, run).execute).toBeNull();
    expect(() => store.read({ id: "u2", workspaceId: "w1" }, started.job.id)).toThrow("不存在");
    expect(() => store.read({ id: "u1", workspaceId: "w2" }, started.job.id)).toThrow("不存在");
    await started.execute!(); await started.execute!();
    expect(run).toHaveBeenCalledOnce();
    expect(store.read(actor, started.job.id)).toMatchObject({ state: "completed", answer });
    expect(store.create(actor, input, run).job.state).toBe("completed");
    expect(() => store.create(actor, { ...input, message: "changed" }, run)).toThrow("编号已使用");
  });
  it("bounds concurrent requests, sanitizes failures and expires conversations", async () => {
    let now = 1000; const store = createJobStore(() => now);
    const started = store.create(actor, input, vi.fn().mockRejectedValue(new Error("secret upstream credentials")));
    expect(() => store.create(actor, { ...input, requestId: "request-00000002" }, vi.fn())).toThrow("等待");
    await started.execute!();
    expect(store.read(actor, started.job.id)).toMatchObject({ state: "failed" });
    expect(JSON.stringify(store.read(actor, started.job.id))).not.toContain("secret");
    now += 11 * 60 * 1000;
    expect(() => store.read(actor, started.job.id)).toThrow("已过期");
  });
});
