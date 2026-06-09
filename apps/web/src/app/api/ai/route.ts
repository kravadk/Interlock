import Anthropic from "@anthropic-ai/sdk";
import {
  EXPLAIN_TOOL,
  POLICY_TOOL,
  STRATEGY_TOOL,
  SUMMARY_TOOL,
  validateBlockSummary,
  validateExplanation,
  validatePolicyDraft,
  validateStrategyAdvice,
  type AiRequest,
  type ExplainPayload,
  type PolicyPayload,
  type StrategyPayload,
  type SummaryPayload,
} from "../../../lib/ai-types";
import { rateLimit } from "../../../lib/rate-limit";

/**
 * Server-side AI layer. Reads ANTHROPIC_API_KEY (server-only, never exposed to the browser),
 * mirroring the /api/attest key pattern. ADVISORY ONLY — the output never drives an ALLOW/BLOCK
 * and never enters the on-chain attestation; it explains, drafts, and narrates. Output is forced
 * through Claude tool-use and validated before returning, so malformed responses fall back cleanly.
 */

const HAIKU = "claude-haiku-4-5";
const SONNET = "claude-sonnet-4-6";
const TIMEOUT_MS = 12_000;
const MAX_TOKENS = 1024;

export async function POST(request: Request) {
  const limited = rateLimit(request, "ai");
  if (limited) return limited;

  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    return Response.json(
      { error: "AI layer is not configured. Set ANTHROPIC_API_KEY (server-side)." },
      { status: 503 },
    );
  }

  let body: AiRequest;
  try {
    body = (await request.json()) as AiRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (
    !body ||
    (body.task !== "explain" && body.task !== "policy" && body.task !== "summary" && body.task !== "strategy")
  ) {
    return Response.json({ error: "Unknown task." }, { status: 400 });
  }

  const client = new Anthropic({ apiKey: key });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const spec = buildRequest(body);
    const message = await client.messages.create(
      {
        model: spec.model,
        max_tokens: MAX_TOKENS,
        system: spec.system,
        tools: [spec.tool],
        tool_choice: { type: "tool", name: spec.tool.name },
        messages: [{ role: "user", content: spec.user }],
      },
      { signal: controller.signal },
    );

    const toolUse = message.content.find((block) => block.type === "tool_use");
    if (!toolUse || toolUse.type !== "tool_use") {
      return Response.json({ error: "Model returned no structured output." }, { status: 502 });
    }

    const data = spec.validate(toolUse.input);
    if (!data) {
      return Response.json({ error: "Model output failed validation." }, { status: 502 });
    }
    return Response.json({ data });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return Response.json(
      { error: aborted ? "AI request timed out." : error instanceof Error ? error.message : String(error) },
      { status: aborted ? 504 : 500 },
    );
  } finally {
    clearTimeout(timeout);
  }
}

type RequestSpec = {
  model: string;
  system: string;
  user: string;
  tool: typeof EXPLAIN_TOOL | typeof POLICY_TOOL | typeof SUMMARY_TOOL | typeof STRATEGY_TOOL;
  validate: (input: unknown) => unknown;
};

function buildRequest(body: AiRequest): RequestSpec {
  switch (body.task) {
    case "explain":
      return {
        model: HAIKU,
        system:
          "You are the risk-explanation layer of Interlock, a pre-flight firewall for autonomous " +
          "blockchain agents. A deterministic firewall has ALREADY decided ALLOW or BLOCK — you do " +
          "NOT change that verdict. Explain the decision in plain language for a developer operator " +
          "and give your own independent 0-100 risk score. Be concise and concrete.",
        user: explainPrompt(body.payload),
        tool: EXPLAIN_TOOL,
        validate: validateExplanation,
      };
    case "policy":
      return {
        model: SONNET,
        system:
          "You are the policy-drafting assistant of Interlock. Turn a natural-language intent into a " +
          "concrete firewall policy: a max native spend (MNT), max slippage (bps), allowlisted target " +
          "addresses, and allowlisted 4-byte selectors. Prefer selectors/targets from the provided " +
          "ecosystem packs when they match the intent. If you must guess an address or selector, list it " +
          "under assumptions. Be conservative — tighter limits are safer. The user reviews and edits the " +
          "draft before anything is written on-chain.",
        user: policyPrompt(body.payload),
        tool: POLICY_TOOL,
        validate: validatePolicyDraft,
      };
    case "summary":
      return {
        model: SONNET,
        system:
          "You are the analytics layer of Interlock. Given aggregated block-reason counts and recent " +
          "blocked actions, narrate what is going wrong, the top risks, and concrete policy adjustments. " +
          "Be specific and actionable; avoid generic security platitudes.",
        user: summaryPrompt(body.payload),
        tool: SUMMARY_TOOL,
        validate: validateBlockSummary,
      };
    case "strategy":
      return {
        model: SONNET,
        system:
          "You are the strategy-review layer of Interlock, a pre-flight firewall for autonomous trading " +
          "agents. A deterministic strategy has ALREADY picked a yield allocation from live Mantle pools, " +
          "and the firewall — not you — decides whether it executes. Give an INDEPENDENT advisory opinion: " +
          "do you agree with the pick, what is the key risk trade-off (liquidity, APY sustainability, " +
          "concentration), and your confidence. You do NOT change the allocation or the firewall verdict. " +
          "Be concise and concrete.",
        user: strategyPrompt(body.payload),
        tool: STRATEGY_TOOL,
        validate: validateStrategyAdvice,
      };
  }
}

function explainPrompt(p: ExplainPayload): string {
  const checks = Object.entries(p.checks)
    .map(([name, ok]) => `  - ${name}: ${ok ? "pass" : "FAIL"}`)
    .join("\n");
  return [
    `Firewall decision: ${p.decision} (reason code: ${p.reason})`,
    `Deterministic risk score: ${p.riskScore}/100`,
    `Target contract: ${p.target}`,
    `Native value: ${p.value} MNT`,
    `Function selector: ${p.selector}`,
    `Simulation hash: ${p.simulationHash}`,
    `Policy checks:\n${checks}`,
  ].join("\n");
}

function policyPrompt(p: PolicyPayload): string {
  const packs = p.packs
    .map((pack) => {
      const sels = pack.selectors.map((s) => `${s.selector}${s.label ? ` (${s.label})` : ""}`).join(", ");
      const targets = pack.targets?.length ? `; targets: ${pack.targets.join(", ")}` : "";
      const limits = `; maxNativeValue: ${pack.maxNativeValue ?? "?"}; maxSlippageBps: ${pack.maxSlippageBps ?? "?"}`;
      return `- ${pack.name} [${pack.id}]: selectors: ${sels || "none"}${targets}${limits}`;
    })
    .join("\n");
  return [
    `Operator intent: "${p.intent}"`,
    "",
    "Available ecosystem packs (prefer these selectors/targets when relevant):",
    packs || "(none)",
  ].join("\n");
}

function strategyPrompt(p: StrategyPayload): string {
  const pools = p.pools
    .map((pool) => {
      const apy = pool.apy != null ? `${pool.apy.toFixed(2)}% APY` : "no APY";
      const tvl = pool.tvlUsd != null ? `$${Math.round(pool.tvlUsd).toLocaleString()} TVL` : "no TVL";
      const status = pool.investable ? "investable" : `skipped (${pool.riskFlags.join(", ")})`;
      return `  - ${pool.project}${pool.symbol ? ` ${pool.symbol}` : ""}: ${apy}, ${tvl} — ${status}`;
    })
    .join("\n");
  const chosen = p.chosen
    ? `${p.chosen.project}${p.chosen.symbol ? ` ${p.chosen.symbol}` : ""} at ${p.chosen.apy ?? "?"}% APY`
    : "(none — holding)";
  return [
    `Live yield candidates (Mantle, from DefiLlama):\n${pools || "  (none)"}`,
    "",
    `Deterministic strategy picked: ${chosen}`,
    `Sizing: ${p.allocationPctBps / 100}% of the budget (policy cap ${p.maxNativeValueMnt} MNT).`,
    "",
    "Do you agree? Flag the key risks and give your confidence.",
  ].join("\n");
}

function summaryPrompt(p: SummaryPayload): string {
  const reasons = p.reasons.map((r) => `  - ${r.reason}: ${r.count}`).join("\n");
  const recent = p.recentBlocks
    .map((b) => `  - ${b.reasonCode} → ${b.target} (${b.value} MNT)`)
    .join("\n");
  return [
    `Totals: ${p.totals.total} actions, ${p.totals.allowed} allowed, ${p.totals.blocked} blocked.`,
    `Block-reason distribution:\n${reasons || "  (none)"}`,
    `Recent blocked actions:\n${recent || "  (none)"}`,
  ].join("\n");
}
