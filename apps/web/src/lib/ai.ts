/**
 * Client helpers for the advisory AI layer. Each POSTs the shared /api/ai route and returns a
 * discriminated result so every caller can fall back deterministically on `ok: false` (no key,
 * 503, timeout, malformed output). Results are cached in-memory for the session so re-renders and
 * repeat decisions don't re-bill. AI never drives ALLOW/BLOCK — these are presentational.
 */
import type {
  AiBlockSummary,
  AiExplanation,
  AiPolicyDraft,
  AiRequest,
  ExplainPayload,
  PolicyPayload,
  SummaryPayload,
} from "./ai-types";

export type AiResult<T> = { ok: true; data: T } | { ok: false; reason: string };

/** UI hint: show AI affordances unless explicitly disabled. The route still 503s without a key. */
export function aiEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AI_ENABLED !== "false";
}

const cache = new Map<string, unknown>();

async function callAi<T>(request: AiRequest, cacheKey: string): Promise<AiResult<T>> {
  const key = `${request.task}:${cacheKey}`;
  if (cache.has(key)) {
    return { ok: true, data: cache.get(key) as T };
  }
  try {
    const response = await fetch("/api/ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      return { ok: false, reason: detail?.error ?? `AI request failed (${response.status}).` };
    }
    const json = (await response.json()) as { data?: T };
    if (!json.data) return { ok: false, reason: "AI returned no data." };
    cache.set(key, json.data);
    return { ok: true, data: json.data };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "AI request error." };
  }
}

export function explainDecision(payload: ExplainPayload): Promise<AiResult<AiExplanation>> {
  // simulationHash already uniquely captures decision + checks + target + value + selector.
  return callAi<AiExplanation>({ task: "explain", payload }, payload.simulationHash);
}

export function synthesizePolicy(payload: PolicyPayload): Promise<AiResult<AiPolicyDraft>> {
  return callAi<AiPolicyDraft>({ task: "policy", payload }, payload.intent.trim().toLowerCase());
}

export function summarizeBlocks(payload: SummaryPayload): Promise<AiResult<AiBlockSummary>> {
  const sig = `${payload.totals.total}:${payload.reasons.map((r) => `${r.reason}=${r.count}`).join(",")}`;
  return callAi<AiBlockSummary>({ task: "summary", payload }, sig);
}

export type { AiBlockSummary, AiExplanation, AiPolicyDraft, ExplainPayload, PolicyPayload, SummaryPayload };
