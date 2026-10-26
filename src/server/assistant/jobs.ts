import { createHash, randomUUID } from "node:crypto";
import { ApiError } from "@/server/miniapp/http";
import type { Answer, ChatInput } from "./agent";

type Actor = { id: string; workspaceId: string };
type Job = { id: string; actor: Actor; input: string; requestId: string; createdAt: number; state: "pending" | "completed" | "failed"; answer?: Answer; error?: string };
const TTL = 10 * 60 * 1000;
export function createJobStore(now = Date.now) {
  const jobs = new Map<string, Job>();
  const prune = () => { for (const [id, job] of jobs) if (now() - job.createdAt > TTL) jobs.delete(id); };
  const view = (job: Job) => ({ id: job.id, state: job.state, ...(job.answer ? { answer: job.answer } : {}), ...(job.error ? { error: job.error } : {}) });
  return {
    create(actor: Actor, input: ChatInput, run: () => Promise<Answer>) {
      prune();
      const owned = [...jobs.values()].filter(j => j.actor.id === actor.id && j.actor.workspaceId === actor.workspaceId);
      const inputHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
      const existing = owned.find(j => j.requestId === input.requestId);
      if (existing) {
        if (existing.input !== inputHash) throw new ApiError(409, "请求编号已使用，请重新提问");
        return { job: view(existing), execute: null };
      }
      if (owned.some(j => j.state === "pending") || owned.filter(j => now() - j.createdAt < 60000).length >= 6 || jobs.size >= 200 || [...jobs.values()].filter(j => j.state === "pending").length >= 8) {
        throw new ApiError(429, "查询较多，请等待当前回答完成或稍后再试");
      }
      const job: Job = { id: randomUUID(), actor: { id: actor.id, workspaceId: actor.workspaceId }, input: inputHash, requestId: input.requestId, createdAt: now(), state: "pending" };
      jobs.set(job.id, job);
      let started = false;
      return { job: view(job), execute: async () => {
        if (started) return;
        started = true;
        try { const answer = await run(); if (job.state === "pending") { job.answer = answer; job.state = "completed"; } }
        catch { job.error = "助手暂时无法完成查询，请稍后再试；可直接打开机器或订单页面查看。"; job.state = "failed"; }
        // Only the input digest is retained; no prompt/key/provider error logging.
      } };
    },
    read(actor: Actor, id: string) {
      prune();
      const job = jobs.get(id);
      if (!job || job.actor.id !== actor.id || job.actor.workspaceId !== actor.workspaceId) throw new ApiError(404, "查询已过期或不存在，请重新提问");
      if (job.state === "pending" && now() - job.createdAt > 90000) { job.state = "failed"; job.error = "查询超时，请稍后重新提问"; }
      return view(job);
    },
  };
}

// The two Next route bundles share a bounded, temporary store in this single Node process.
// Restarting the demo server expires outstanding jobs; no schema/database migration required.
const shared = globalThis as typeof globalThis & { factoryAssistantJobs?: ReturnType<typeof createJobStore> };
export const assistantJobs = shared.factoryAssistantJobs ??= createJobStore();
