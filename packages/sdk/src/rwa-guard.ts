import type { Address } from "viem";
import { keccak256, toHex, type Hex } from "viem";
import type { ReasonCodeLabel } from "@interlock/shared";

// Advisory RWA / yield risk checks. Interlock does not custody funds or track portfolio
// state, so the caller supplies the current portfolio context; these checks then flag a
// proposed position change that would over-concentrate, exceed a rebalance budget, or touch
// an unapproved vault/asset. Advisory-only off-chain (recordable once V3 reason codes ship).

export type RwaGuardConfig = {
  /** Max share (basis points, 0-10000) a single asset may occupy after the action. */
  maxExposureBpsPerAsset?: number;
  /** Max share any one position may occupy portfolio-wide (concentration ceiling). */
  maxConcentrationBps?: number;
  /** Max number of rebalances allowed per day. */
  maxDailyRebalances?: number;
  /** Allowlisted vault addresses (case-insensitive). Empty/undefined = not enforced. */
  allowedVaults?: Address[];
  /** Allowlisted asset addresses (case-insensitive). Empty/undefined = not enforced. */
  allowedAssets?: Address[];
};

export type RwaPortfolioContext = {
  /** Current total portfolio value (any consistent unit). */
  totalValue: bigint;
  /** Current positions by asset. */
  positions: Array<{ asset: Address; value: bigint }>;
  /** The proposed change. */
  proposed: {
    vault?: Address;
    asset?: Address;
    /** Value added to `asset` by this action (use negative for withdrawals). */
    addValue: bigint;
  };
  /** Rebalances already performed in the current day. */
  rebalancesToday?: number;
};

export type RwaGuardFinding = {
  ok: boolean;
  reason?: ReasonCodeLabel;
  detail: string;
  /** Post-action exposure of the proposed asset, in basis points (0-10000). */
  exposureBps?: number;
};

export type RwaYieldDataPoint = {
  source: string;
  poolId: string;
  project: string;
  chain?: string;
  symbol?: string;
  tvlUsd?: number;
  apy?: number;
  fetchedAt: string;
};

export type RwaRiskEvidenceInput = {
  guard: RwaGuardConfig;
  portfolio: RwaPortfolioContext;
  yieldData?: RwaYieldDataPoint;
  thresholds?: {
    minTvlUsd?: number;
    maxApy?: number;
    staleAfterMs?: number;
  };
};

export type RwaRiskEvidence = {
  version: "interlock.rwa-risk.v1";
  ok: boolean;
  reasonCode: ReasonCodeLabel | "RWA_DATA_STALE" | "RWA_TVL_TOO_LOW" | "RWA_APY_TOO_HIGH";
  finding: RwaGuardFinding;
  checks: Array<{ name: string; ok: boolean; evidence: string; suggestedFix: string }>;
  yieldData?: RwaYieldDataPoint;
  evidenceHash: Hex;
};

const lc = (a: Address) => a.toLowerCase();

function exposureBpsAfter(ctx: RwaPortfolioContext): number {
  if (!ctx.proposed.asset) return 0;
  const asset = lc(ctx.proposed.asset);
  const current = ctx.positions
    .filter((p) => lc(p.asset) === asset)
    .reduce((sum, p) => sum + p.value, 0n);
  const after = current + ctx.proposed.addValue;
  const totalAfter = ctx.totalValue + ctx.proposed.addValue;
  if (totalAfter <= 0n) return 0;
  // bps with integer math; clamp negatives to 0.
  const bps = Number((after * 10000n) / totalAfter);
  return bps < 0 ? 0 : bps;
}

/** Evaluate the RWA guard. Returns the first failing rule (priority order) or `ok: true`. */
export function evaluateRwaGuard(config: RwaGuardConfig, ctx: RwaPortfolioContext): RwaGuardFinding {
  // 1. Unknown vault.
  if (config.allowedVaults?.length && ctx.proposed.vault) {
    const set = new Set(config.allowedVaults.map(lc));
    if (!set.has(lc(ctx.proposed.vault))) {
      return { ok: false, reason: "TARGET_NOT_ALLOWED", detail: `Vault ${ctx.proposed.vault} is not in the approved vault list.` };
    }
  }

  // 2. Unknown asset.
  if (config.allowedAssets?.length && ctx.proposed.asset) {
    const set = new Set(config.allowedAssets.map(lc));
    if (!set.has(lc(ctx.proposed.asset))) {
      return { ok: false, reason: "TARGET_NOT_ALLOWED", detail: `Asset ${ctx.proposed.asset} is not in the approved asset list.` };
    }
  }

  // 3. Daily rebalance budget.
  if (config.maxDailyRebalances !== undefined && (ctx.rebalancesToday ?? 0) >= config.maxDailyRebalances) {
    return {
      ok: false,
      reason: "DAILY_REBALANCE_EXCEEDED",
      detail: `Already performed ${ctx.rebalancesToday ?? 0}/${config.maxDailyRebalances} rebalances today.`,
    };
  }

  const exposureBps = exposureBpsAfter(ctx);

  // 4. Per-asset overexposure (the proposed asset).
  if (config.maxExposureBpsPerAsset !== undefined && exposureBps > config.maxExposureBpsPerAsset) {
    return {
      ok: false,
      reason: "RWA_OVEREXPOSURE",
      detail: `Proposed action puts ${(exposureBps / 100).toFixed(2)}% into one asset (limit ${(config.maxExposureBpsPerAsset / 100).toFixed(2)}%).`,
      exposureBps,
    };
  }

  // 5. Portfolio-wide concentration ceiling.
  if (config.maxConcentrationBps !== undefined && exposureBps > config.maxConcentrationBps) {
    return {
      ok: false,
      reason: "CONCENTRATION_RISK",
      detail: `Post-action concentration ${(exposureBps / 100).toFixed(2)}% exceeds ceiling ${(config.maxConcentrationBps / 100).toFixed(2)}%.`,
      exposureBps,
    };
  }

  return { ok: true, detail: "Within RWA risk limits.", exposureBps };
}

export function buildRwaRiskEvidence(input: RwaRiskEvidenceInput): RwaRiskEvidence {
  const finding = evaluateRwaGuard(input.guard, input.portfolio);
  const thresholds = input.thresholds ?? {};
  const checks: RwaRiskEvidence["checks"] = [
    {
      name: "portfolio-guard",
      ok: finding.ok,
      evidence: finding.detail,
      suggestedFix: finding.ok ? "No action needed." : "Review vault/asset allowlists, exposure caps, and daily rebalance settings.",
    },
  ];

  if (input.yieldData && thresholds.minTvlUsd !== undefined) {
    const ok = (input.yieldData.tvlUsd ?? 0) >= thresholds.minTvlUsd;
    checks.push({
      name: "minimum-tvl",
      ok,
      evidence: `TVL ${input.yieldData.tvlUsd ?? "unknown"} USD, minimum ${thresholds.minTvlUsd} USD.`,
      suggestedFix: ok ? "No action needed." : "Use a higher-liquidity pool or keep this action read-only.",
    });
  }

  if (input.yieldData && thresholds.maxApy !== undefined) {
    const ok = (input.yieldData.apy ?? 0) <= thresholds.maxApy;
    checks.push({
      name: "apy-threshold",
      ok,
      evidence: `APY ${input.yieldData.apy ?? "unknown"}%, maximum ${thresholds.maxApy}%.`,
      suggestedFix: ok ? "No action needed." : "Treat unusually high APY as an advisory risk and require manual approval.",
    });
  }

  if (input.yieldData && thresholds.staleAfterMs !== undefined) {
    const ageMs = Date.now() - Date.parse(input.yieldData.fetchedAt);
    const ok = Number.isFinite(ageMs) && ageMs <= thresholds.staleAfterMs;
    checks.push({
      name: "data-freshness",
      ok,
      evidence: `Fetched at ${input.yieldData.fetchedAt}.`,
      suggestedFix: ok ? "No action needed." : "Refresh yield/RWA data before using it as evidence.",
    });
  }

  const reasonCode = rwaRiskToReasonCode({ finding, checks });
  const evidenceWithoutHash = {
    version: "interlock.rwa-risk.v1" as const,
    ok: finding.ok && checks.every((check) => check.ok),
    reasonCode,
    finding,
    checks,
    yieldData: input.yieldData,
  };
  return {
    ...evidenceWithoutHash,
    evidenceHash: hashRwaRiskEvidence(evidenceWithoutHash),
  };
}

export function rwaRiskToReasonCode(input: {
  finding: RwaGuardFinding;
  checks: RwaRiskEvidence["checks"];
}): RwaRiskEvidence["reasonCode"] {
  if (!input.finding.ok && input.finding.reason) return input.finding.reason;
  if (input.checks.find((check) => check.name === "data-freshness" && !check.ok)) return "RWA_DATA_STALE";
  if (input.checks.find((check) => check.name === "minimum-tvl" && !check.ok)) return "RWA_TVL_TOO_LOW";
  if (input.checks.find((check) => check.name === "apy-threshold" && !check.ok)) return "RWA_APY_TOO_HIGH";
  return "POLICY_PASSED";
}

export function hashRwaRiskEvidence(evidence: Omit<RwaRiskEvidence, "evidenceHash">): Hex {
  return keccak256(toHex(JSON.stringify(evidence)));
}
