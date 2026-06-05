import { maxSlippageBps as maxAllowedSlippageBps } from "./validation.js";
import { parsePolicyPack, type PolicyPack } from "./policy-pack.js";

// Policy-as-code linter. `parsePolicyPack` already enforces structure/types; the linter adds
// advisory findings a reviewer (or CI) should see before a policy is applied on-chain.

const APPROVE_SELECTOR = "0x095ea7b3"; // approve(address,uint256)

export type PolicyLintLevel = "error" | "warning";

export type PolicyLintFinding = {
  level: PolicyLintLevel;
  code: string;
  message: string;
};

export type PolicyLintResult = {
  ok: boolean; // false if any error-level finding
  errors: number;
  warnings: number;
  findings: PolicyLintFinding[];
};

/** Lint a parsed policy pack for risky or incomplete configuration. */
export function lintPolicyPack(pack: PolicyPack): PolicyLintResult {
  const findings: PolicyLintFinding[] = [];
  const warn = (code: string, message: string) => findings.push({ level: "warning", code, message });
  const error = (code: string, message: string) => findings.push({ level: "error", code, message });

  if (pack.targets.length === 0) {
    error("NO_TARGETS", "Policy has no allowlisted targets — no action could ever be allowed.");
  }
  if (pack.selectors.length === 0) {
    error("NO_SELECTORS", "Policy has no allowlisted selectors — no action could ever be allowed.");
  }
  if (pack.chainId === undefined) {
    warn("NO_CHAIN_ID", "No chainId set. Pin chainId so the policy is not applied on the wrong chain.");
  }

  if (pack.maxSlippageBps > 1000) {
    warn("HIGH_SLIPPAGE", `maxSlippageBps ${pack.maxSlippageBps} (>10%) is permissive for a strategy agent.`);
  }
  if (pack.maxSlippageBps > maxAllowedSlippageBps) {
    error("SLIPPAGE_OUT_OF_RANGE", `maxSlippageBps ${pack.maxSlippageBps} exceeds the maximum ${maxAllowedSlippageBps}.`);
  }

  const hasApprove = pack.selectors.some((s) => s.selector.toLowerCase() === APPROVE_SELECTOR);
  if (hasApprove) {
    warn(
      "APPROVE_SELECTOR",
      "Pack allows approve(address,uint256). Review the spender and prefer exact-amount approvals — never unlimited.",
    );
    if (BigInt(pack.maxNativeValue) === 0n) {
      warn("APPROVE_WITH_ZERO_VALUE", "approve is allowed but maxNativeValue is 0; confirm this is a token-only (no native) policy.");
    }
  }

  // Duplicate targets / selectors.
  const dupTargets = duplicates(pack.targets.map((t) => t.address.toLowerCase()));
  for (const t of dupTargets) warn("DUPLICATE_TARGET", `Target ${t} is listed more than once.`);
  const dupSelectors = duplicates(pack.selectors.map((s) => s.selector.toLowerCase()));
  for (const s of dupSelectors) warn("DUPLICATE_SELECTOR", `Selector ${s} is listed more than once.`);

  // Unlabeled selectors are harder to review.
  const unlabeled = pack.selectors.filter((s) => !s.label || s.label === "custom selector").length;
  if (unlabeled > 0) {
    warn("UNLABELED_SELECTORS", `${unlabeled} selector(s) have no human label; add labels for reviewability.`);
  }

  const errors = findings.filter((f) => f.level === "error").length;
  const warnings = findings.filter((f) => f.level === "warning").length;
  return { ok: errors === 0, errors, warnings, findings };
}

/** Parse + lint raw JSON text. Parse/structure failures surface as a single error finding. */
export function lintPolicyPackJson(jsonText: string): PolicyLintResult {
  let pack: PolicyPack;
  try {
    pack = parsePolicyPack(jsonText);
  } catch (error) {
    return {
      ok: false,
      errors: 1,
      warnings: 0,
      findings: [{ level: "error", code: "INVALID_PACK", message: error instanceof Error ? error.message : String(error) }],
    };
  }
  return lintPolicyPack(pack);
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) dups.add(v);
    seen.add(v);
  }
  return [...dups];
}
