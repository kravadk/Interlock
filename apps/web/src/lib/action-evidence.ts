import { isAddress, type Address, type Hex } from "viem";
import { buildRwaRiskEvidence, decodeErc20Action, evaluateTokenRules } from "@interlock/firewall-sdk";
import { short } from "./dashboard-data";
import type { YieldDataPoint } from "./indexer";

// Pure advisory-evidence helpers for the preflight panel. Kept out of the "use client"
// view so they can be unit-tested in a node environment. These are OFF-CHAIN ADVISORY:
// they never change the on-chain ALLOW/BLOCK decision or the recorded attestation.

export function formatUsd(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "n/a";
  return `$${Math.round(value).toLocaleString()}`;
}

export function formatPercent(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(2)}%`;
}

export type TokenEvidence = { status: "ready" | "pass" | "fail"; message: string; details: string[]; reasonCode?: string };

// Runs the SDK `evaluateTokenRules` evaluator on the live action so advisory token reason
// codes (e.g. UNLIMITED_APPROVE_BLOCKED) are produced, not just a calldata decode. Without a
// configured token allowlist we apply a default advisory rule that blocks unlimited approve.
export function tokenEvidenceFromAction(target: string, calldata: string): TokenEvidence {
  if (!/^0x([0-9a-fA-F]{2})*$/.test(calldata)) {
    return { status: "fail", message: "Calldata is not valid even-byte hex, so ERC20 evidence cannot be decoded.", details: [] };
  }
  const decoded = decodeErc20Action(calldata as Hex);
  const details = tokenActionDetails(decoded);
  if (decoded.kind === "unknown") {
    return {
      status: "ready",
      message: "Current calldata is not a recognized ERC20 transfer, transferFrom, or approve call.",
      details: [`selector ${decoded.selector}`],
    };
  }
  if (!isAddress(target)) {
    return {
      status: "ready",
      message: "Set a valid token target address to run the advisory ERC20 token-rule check.",
      details,
    };
  }
  const result = evaluateTokenRules({
    token: target as Address,
    calldata: calldata as Hex,
    // Default advisory rule: bounded transfers/approvals pass; unlimited approve is blocked.
    rules: [{ token: target as Address, allowUnlimitedApprove: false }],
  });
  return {
    status: result.ok ? "pass" : "fail",
    reasonCode: result.reasonCode,
    message: result.ok ? `${result.explanation} (advisory, off-chain)` : `${result.explanation} ${result.suggestedFix} (advisory, off-chain)`,
    details,
  };
}

export function tokenActionDetails(decoded: ReturnType<typeof decodeErc20Action>): string[] {
  if (decoded.kind === "approve") {
    return [`spender ${short(decoded.spender)}`, `amount ${decoded.amount.toString()}`, decoded.unlimited ? "unlimited" : "bounded"];
  }
  if (decoded.kind === "transferFrom") {
    return [`owner ${short(decoded.owner)}`, `recipient ${short(decoded.recipient)}`, `amount ${decoded.amount.toString()}`];
  }
  if (decoded.kind === "transfer") {
    return [`recipient ${short(decoded.recipient)}`, `amount ${decoded.amount.toString()}`];
  }
  return [];
}

export type RwaEvidence = { status: "ready" | "pass" | "fail"; message: string; rows: string[]; reasonCode?: string; evidenceHash?: string };

// Builds advisory RWA/yield evidence from the SDK `buildRwaRiskEvidence` evaluator (single
// source of truth) over the live yield signals, surfacing real reason codes + an evidence hash
// that can feed ActionAttestationV3.evidenceHash. Off-chain advisory; no on-chain change here.
export function buildRwaEvidenceRows(points: YieldDataPoint[]): RwaEvidence {
  if (!points.length) {
    return {
      status: "ready",
      message: "No live yield/RWA records are loaded. Sync the Recorder Service to use real advisory evidence.",
      rows: [],
    };
  }
  const thresholds = { minTvlUsd: 100_000, maxApy: 50, staleAfterMs: 24 * 60 * 60 * 1000 };
  const neutralPortfolio = { totalValue: 0n, positions: [] as { asset: Address; value: bigint }[], proposed: { addValue: 0n } };
  const evidences = points.slice(0, 6).map((point) =>
    buildRwaRiskEvidence({
      guard: {},
      portfolio: neutralPortfolio,
      yieldData: {
        source: point.source,
        poolId: point.poolId,
        project: point.project,
        chain: point.chain,
        symbol: point.symbol,
        tvlUsd: point.tvlUsd,
        apy: point.apy,
        fetchedAt: point.fetchedAt,
      },
      thresholds,
    }),
  );
  const flagged = evidences.filter((evidence) => !evidence.ok);
  const top = flagged[0] ?? evidences[0];
  return {
    status: flagged.length ? "fail" : "pass",
    reasonCode: top.reasonCode,
    evidenceHash: top.evidenceHash,
    message: flagged.length
      ? `${flagged.length} live yield signal(s) flagged (${top.reasonCode}); apply stricter RWA/DeFi policy limits before allowing these actions.`
      : "Loaded yield signals pass the advisory TVL/APY/freshness checks.",
    rows: points.slice(0, 8).map((point) => `${point.project}: TVL ${formatUsd(point.tvlUsd)}, APY ${formatPercent(point.apy)}`),
  };
}
