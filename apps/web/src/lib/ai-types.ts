/**
 * Shared AI-layer contracts (types + Claude tool input_schemas + runtime validators).
 *
 * Phase 4 — the AI layer is ADVISORY ONLY. Nothing here ever drives an ALLOW/BLOCK or
 * enters the on-chain attestation; it explains, scores, drafts, and narrates. The server
 * route (`app/api/ai/route.ts`) and the client lib (`lib/ai.ts`) both import these so the
 * request/response shape is defined once.
 */

export type AiTask = "explain" | "policy" | "summary";

/* ------------------------------------------------------------------ *
 * Request payloads (plain JSON — serializable, no bigint/viem types). *
 * ------------------------------------------------------------------ */

export type ExplainPayload = {
  decision: "ALLOW" | "BLOCK" | "REVIEW";
  reason: string;
  riskScore: number;
  target: string;
  value: string; // MNT decimal string
  selector: string;
  simulationHash: string;
  checks: Record<string, boolean>;
};

export type PolicyPayloadPack = {
  id: string;
  name: string;
  selectors: { selector: string; label?: string }[];
  maxNativeValue?: string;
  maxSlippageBps?: number;
  targets?: string[];
};

export type PolicyPayload = {
  intent: string;
  packs: PolicyPayloadPack[];
};

export type SummaryPayload = {
  reasons: { reason: string; count: number }[];
  totals: { total: number; allowed: number; blocked: number };
  recentBlocks: { reasonCode: string; target: string; value: string }[];
};

export type AiRequest =
  | { task: "explain"; payload: ExplainPayload }
  | { task: "policy"; payload: PolicyPayload }
  | { task: "summary"; payload: SummaryPayload };

/* ------------------------------------------------------------------ *
 * Response types.                                                     *
 * ------------------------------------------------------------------ */

export type AiSeverity = "low" | "medium" | "high" | "critical";

export type AiExplanation = {
  riskScore: number; // 0–100, AI's own score (shown beside the deterministic one)
  severity: AiSeverity;
  headline: string;
  plain: string;
  recommendation: string;
};

export type AiPolicyDraft = {
  maxNativeValue: string; // MNT decimal string
  maxSlippageBps: number;
  targets: string[];
  selectors: string[];
  rationale: string;
  assumptions: string[];
};

export type AiBlockSummary = {
  narrative: string;
  topRisks: string[];
  suggestions: string[];
};

/* ------------------------------------------------------------------ *
 * Claude tool input_schemas (JSON Schema, used with forced tool_use). *
 * ------------------------------------------------------------------ */

export const EXPLAIN_TOOL = {
  name: "report_risk",
  description: "Return a plain-language risk explanation and an independent 0-100 risk score.",
  input_schema: {
    type: "object" as const,
    properties: {
      riskScore: { type: "integer", minimum: 0, maximum: 100 },
      severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
      headline: { type: "string", description: "One short sentence summarizing the decision." },
      plain: { type: "string", description: "2-3 sentences explaining why, in plain language." },
      recommendation: { type: "string", description: "One actionable next step for the operator." },
    },
    required: ["riskScore", "severity", "headline", "plain", "recommendation"],
  },
};

export const POLICY_TOOL = {
  name: "draft_policy",
  description: "Turn a natural-language intent into a concrete firewall policy draft.",
  input_schema: {
    type: "object" as const,
    properties: {
      maxNativeValue: { type: "string", description: "Max native spend in MNT as a decimal string, e.g. \"2\"." },
      maxSlippageBps: { type: "integer", minimum: 0, maximum: 10000 },
      targets: { type: "array", items: { type: "string" }, description: "Allowlisted target addresses (0x...)." },
      selectors: { type: "array", items: { type: "string" }, description: "Allowlisted 4-byte selectors (0x + 8 hex)." },
      rationale: { type: "string" },
      assumptions: { type: "array", items: { type: "string" }, description: "Anything you inferred or guessed." },
    },
    required: ["maxNativeValue", "maxSlippageBps", "targets", "selectors", "rationale", "assumptions"],
  },
};

export const SUMMARY_TOOL = {
  name: "summarize_blocks",
  description: "Narrate block-reason patterns and suggest policy adjustments.",
  input_schema: {
    type: "object" as const,
    properties: {
      narrative: { type: "string", description: "2-4 sentences on what the block patterns show." },
      topRisks: { type: "array", items: { type: "string" } },
      suggestions: { type: "array", items: { type: "string" }, description: "Concrete policy tweaks." },
    },
    required: ["narrative", "topRisks", "suggestions"],
  },
};

/* ------------------------------------------------------------------ *
 * Runtime validators (hand-rolled — no zod dep). Reject malformed     *
 * tool output so the client falls back deterministically.            *
 * ------------------------------------------------------------------ */

const isStr = (v: unknown): v is string => typeof v === "string";
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function validateExplanation(v: unknown): AiExplanation | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!isNum(o.riskScore) || !isStr(o.severity) || !isStr(o.headline) || !isStr(o.plain) || !isStr(o.recommendation)) {
    return null;
  }
  if (!["low", "medium", "high", "critical"].includes(o.severity)) return null;
  return {
    riskScore: Math.max(0, Math.min(100, Math.round(o.riskScore))),
    severity: o.severity as AiSeverity,
    headline: o.headline,
    plain: o.plain,
    recommendation: o.recommendation,
  };
}

export function validatePolicyDraft(v: unknown): AiPolicyDraft | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!isStr(o.maxNativeValue) || !isNum(o.maxSlippageBps) || !isStrArr(o.targets) || !isStrArr(o.selectors)) {
    return null;
  }
  if (!isStr(o.rationale) || !isStrArr(o.assumptions)) return null;
  return {
    maxNativeValue: o.maxNativeValue,
    maxSlippageBps: Math.max(0, Math.min(10000, Math.round(o.maxSlippageBps))),
    targets: o.targets,
    selectors: o.selectors,
    rationale: o.rationale,
    assumptions: o.assumptions,
  };
}

export function validateBlockSummary(v: unknown): AiBlockSummary | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!isStr(o.narrative) || !isStrArr(o.topRisks) || !isStrArr(o.suggestions)) return null;
  return { narrative: o.narrative, topRisks: o.topRisks, suggestions: o.suggestions };
}
