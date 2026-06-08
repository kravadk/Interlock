// Yield-strategy agent — the "AI Trading & Strategy" brain that drives actions THROUGH the Interlock
// firewall. Given LIVE Mantle yield signals (real DefiLlama data, supplied by the caller — this module
// does no I/O and is deterministic so it is fully unit-testable and auditable), it ranks pools by a
// transparent risk-adjusted score, picks the best investable opportunity, and sizes an allocation
// scaled by liquidity confidence. The chosen allocation becomes an on-chain action that the firewall
// pre-flights (policy + simulation + RWA concentration guard) and records on-chain — so the strategy is
// explainable, defensible, and verifiable, not a black box.
//
// Risk-adjusted score (transparent + defensible, no hidden ML):
//   - exclude pools with non-positive/absurd APY (apy > maxApy = likely manipulation/unsustainable),
//   - exclude pools below the TVL floor (minTvlUsd = too thin to enter safely),
//   - rank survivors by  apy * liquidityConfidence  (deeper pools rank higher at equal APY),
//   - size the allocation as  maxAllocationWei * liquidityConfidence  (thin pools get a smaller ticket).

import type { RwaYieldDataPoint } from "../rwa-guard.js";

/** A live yield signal — reuse the RWA data-point shape (DefiLlama pool: apy, tvlUsd, project, symbol). */
export type YieldSignal = RwaYieldDataPoint;

export type YieldStrategyConfig = {
  /** Skip pools thinner than this TVL (USD). Below it = too illiquid to enter. */
  minTvlUsd: number;
  /** Treat APY above this (%) as a risk flag and exclude (likely unsustainable / manipulated). */
  maxApy: number;
  /** Budget (wei) for a single allocation step; the actual ticket is scaled by liquidity confidence. */
  maxAllocationWei: bigint;
  /** TVL (USD) at which a pool earns full sizing confidence. Defaults to 10x `minTvlUsd`. */
  fullConfidenceTvlUsd?: number;
};

export type RankedPool = {
  signal: YieldSignal;
  /** Risk-adjusted score used for ranking (higher = better). 0 for excluded pools. */
  score: number;
  /** 0–10000: how much of the budget this pool's liquidity supports. */
  confidenceBps: number;
  /** Why a pool was excluded (empty = investable). */
  riskFlags: string[];
  investable: boolean;
};

export type AllocationDecision = {
  /** The best investable pool, or undefined if none passed the risk filters. */
  chosen?: YieldSignal;
  /** Every input pool, ranked (investable first, by score desc). */
  ranked: RankedPool[];
  /** Wei to allocate this step (0 if nothing is safe to enter). */
  allocateWei: bigint;
  /** Plain-language rationale — also fed to the advisory AI "explain" task and into evidence. */
  rationale: string;
};

function clampBps(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n >= 10000 ? 10000 : Math.round(n);
}

/** Liquidity confidence (0–10000 bps): full at `fullConfidenceTvlUsd`, linear below. */
function liquidityConfidenceBps(tvlUsd: number, fullConfidenceTvlUsd: number): number {
  if (fullConfidenceTvlUsd <= 0) return 10000;
  return clampBps((tvlUsd / fullConfidenceTvlUsd) * 10000);
}

function evaluatePool(signal: YieldSignal, config: YieldStrategyConfig, fullTvl: number): RankedPool {
  const apy = signal.apy;
  const tvl = signal.tvlUsd;
  const riskFlags: string[] = [];

  if (apy === undefined || !Number.isFinite(apy) || apy <= 0) riskFlags.push("no-apy");
  if (tvl === undefined || !Number.isFinite(tvl)) riskFlags.push("no-tvl");
  if (tvl !== undefined && tvl < config.minTvlUsd) riskFlags.push("tvl-below-floor");
  if (apy !== undefined && apy > config.maxApy) riskFlags.push("apy-too-high");

  const investable = riskFlags.length === 0;
  const confidenceBps = investable ? liquidityConfidenceBps(tvl!, fullTvl) : 0;
  const score = investable ? (apy! * confidenceBps) / 10000 : 0;
  return { signal, score, confidenceBps, riskFlags, investable };
}

/**
 * Rank live yield signals and pick a risk-adjusted allocation. Pure + deterministic (no I/O, no clock).
 * The caller supplies fresh signals (e.g. from `GET /ecosystem/yields` / `fetchDefiLlamaMantleYields`).
 */
export function pickAllocation(input: {
  signals: YieldSignal[];
  config: YieldStrategyConfig;
}): AllocationDecision {
  const { config } = input;
  const fullTvl = config.fullConfidenceTvlUsd ?? config.minTvlUsd * 10;

  const ranked = input.signals
    .map((s) => evaluatePool(s, config, fullTvl))
    .sort((a, b) => {
      if (a.investable !== b.investable) return a.investable ? -1 : 1;
      return b.score - a.score;
    });

  const best = ranked.find((p) => p.investable);
  if (!best) {
    const skipped = ranked.length;
    return {
      ranked,
      allocateWei: 0n,
      rationale: `No investable pool: all ${skipped} signal(s) failed risk filters (TVL ≥ $${config.minTvlUsd}, APY ≤ ${config.maxApy}%). Holding — nothing sent.`,
    };
  }

  const allocateWei = (config.maxAllocationWei * BigInt(best.confidenceBps)) / 10000n;
  const pct = (best.confidenceBps / 100).toFixed(0);
  const label = `${best.signal.project}${best.signal.symbol ? ` ${best.signal.symbol}` : ""}`;
  const rationale =
    `Picked ${label} at ${best.signal.apy}% APY (TVL $${Math.round(best.signal.tvlUsd ?? 0).toLocaleString()}). ` +
    `Allocating ${pct}% of the budget, scaled by liquidity confidence; ` +
    `${ranked.filter((p) => !p.investable).length} pool(s) skipped on risk filters.`;

  return { chosen: best.signal, ranked, allocateWei, rationale };
}
