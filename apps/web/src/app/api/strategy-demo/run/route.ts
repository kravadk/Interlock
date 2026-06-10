import { InterlockFirewall, pickAllocation, testStrategyRouterRouteNativeDepositCalldata, type YieldSignal } from "@interlock/firewall-sdk";
import { createLogger, mantleSepolia, requestId } from "@interlock/shared";
import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import { explorerTxUrl, mantleRpcUrl, webContracts } from "../../../../lib/contracts";
import { rateLimit } from "../../../../lib/rate-limit";

const log = createLogger("web:strategy-demo");

// One step waits for two on-chain receipts (executed tx + attestation) with retries, which can exceed
// the default serverless timeout. Allow up to 60s (Fluid Compute) so a slow Mantle block doesn't 504.
export const maxDuration = 60;

/**
 * AI yield-strategy agent — server side. Pulls LIVE Mantle yields (DefiLlama, real data — no mocks),
 * ranks them with the deterministic `pickAllocation` strategy, and routes the chosen allocation THROUGH
 * the Interlock firewall (`runGatewayAction` "execute-if-allowed") into the on-chain strategy vault:
 * ALLOW executes + records, BLOCK records the reason. Every decision is auditable on-chain (V4). One
 * call = one step so the client can stream. step%2: 0 = risk-sized allocation, 1 = a deliberately
 * over-budget allocation to demonstrate the firewall BLOCKING a bad trade. Reads PRIVATE_KEY server-only.
 */
export async function POST(request: Request) {
  const limited = rateLimit(request, "demo");
  if (limited) return limited;

  const privateKey = normalizeKey(process.env.PRIVATE_KEY);
  if (!privateKey) {
    return Response.json({ error: "Set PRIVATE_KEY (server-side) to run the strategy agent." }, { status: 503 });
  }
  const agentIdRaw = (process.env.AGENT_ID ?? process.env.NEXT_PUBLIC_DEFAULT_AGENT_ID)?.trim();
  const policyIdRaw = (process.env.POLICY_ID ?? process.env.NEXT_PUBLIC_DEFAULT_POLICY_ID)?.trim();
  if (!isPositiveId(agentIdRaw) || !isPositiveId(policyIdRaw)) {
    return Response.json({ error: "Set AGENT_ID and POLICY_ID to a registered agent + policy." }, { status: 503 });
  }
  const router = envAddress("TEST_STRATEGY_ROUTER", "NEXT_PUBLIC_TEST_STRATEGY_ROUTER");
  const vault = envAddress("TEST_STRATEGY_VAULT", "NEXT_PUBLIC_TEST_STRATEGY_VAULT");
  if (!router || !vault) {
    return Response.json(
      {
        error:
          "Strategy venue not configured. Deploy the strategy vault/router (DEPLOY_TEST_STRATEGY_CONTRACTS) and set TEST_STRATEGY_ROUTER + TEST_STRATEGY_VAULT, then allowlist the router + routeNativeDeposit selector in the policy.",
      },
      { status: 503 },
    );
  }

  let body: { step?: number };
  try {
    body = (await request.json()) as { step?: number };
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const step = Number.isInteger(body.step) && body.step! >= 0 ? body.step! : 0;
  const greedy = step % 2 === 1; // odd steps demonstrate a BLOCK

  try {
    const agentId = BigInt(agentIdRaw!);
    const policyId = BigInt(policyIdRaw!);
    const contracts = {
      agentRegistry: webContracts.agentRegistry,
      policyRegistry: webContracts.policyRegistry,
      actionAttestation: webContracts.actionAttestation,
    };
    const firewall = new InterlockFirewall({ chain: mantleSepolia, rpcUrl: mantleRpcUrl(), privateKey, contracts });
    const policy = await firewall.getPolicy(policyId);

    // 1. LIVE signal — real DefiLlama Mantle pools (no mock data).
    const signals = await fetchMantleYields();

    // 2. Deterministic, explainable strategy.
    const decisionPlan = pickAllocation({
      signals,
      config: {
        minTvlUsd: numberEnv("STRATEGY_MIN_TVL_USD", 100_000),
        maxApy: numberEnv("STRATEGY_MAX_APY", 50),
        maxAllocationWei: policy.maxNativeValue / 2n, // safe ticket = half the policy value limit
      },
    });

    // 3. Size the on-chain action. Greedy step intentionally exceeds the policy value limit → BLOCK.
    const allocateWei = greedy ? policy.maxNativeValue * 20n : decisionPlan.allocateWei;
    const receiver = privateKeyToAccount(privateKey).address;
    const data = testStrategyRouterRouteNativeDepositCalldata({ vault, receiver, maxSlippageBps: policy.maxSlippageBps });
    const action = { agentId, policyId, tx: { to: router, value: allocateWei, data } };

    // 4. Route THROUGH the firewall — pre-flight + (if allowed) execute + record on-chain.
    const id = requestId();
    const gateway = await firewall.runGatewayAction(action, { mode: "execute-if-allowed", recordDecision: true });
    log.info("strategy step", {
      requestId: id,
      step,
      chosen: decisionPlan.chosen?.poolId,
      decision: gateway.decision.decision,
      reasonCode: gateway.decision.reasonCode,
      status: gateway.status,
    });

    return Response.json(
      {
        step,
        mode: greedy ? "risk-check (over-budget)" : "allocate",
        signalCount: signals.length,
        topPools: decisionPlan.ranked.slice(0, 5).map((p) => ({
          project: p.signal.project,
          symbol: p.signal.symbol ?? null,
          apy: p.signal.apy ?? null,
          tvlUsd: p.signal.tvlUsd ?? null,
          investable: p.investable,
          riskFlags: p.riskFlags,
        })),
        chosen: decisionPlan.chosen
          ? { project: decisionPlan.chosen.project, symbol: decisionPlan.chosen.symbol ?? null, apy: decisionPlan.chosen.apy ?? null }
          : null,
        metrics: decisionPlan.metrics,
        rationale: greedy
          ? `Risk check: agent attempted to allocate 20x the policy value limit — the firewall must block this.`
          : decisionPlan.rationale,
        allocateWei: allocateWei.toString(),
        decision: gateway.decision.decision,
        reasonCode: gateway.decision.reasonCode,
        allowed: gateway.decision.allowed,
        riskScore: gateway.decision.riskScore,
        status: gateway.status,
        executed: gateway.sent,
        txHash: gateway.transactionHash ?? gateway.attestationHash ?? null,
        explorerUrl: gateway.transactionHash
          ? explorerTxUrl(gateway.transactionHash)
          : gateway.attestationHash
            ? explorerTxUrl(gateway.attestationHash)
            : null,
      },
      { headers: { "x-request-id": id } },
    );
  } catch (error) {
    // Surface the full RPC failure (method/params/details) so misconfig vs RPC-rejection is diagnosable.
    const e = error as { shortMessage?: string; message?: string; name?: string; details?: string; metaMessages?: string[] };
    const parts = [
      e?.name ? `[${e.name}]` : "",
      e?.shortMessage || e?.message?.split("\n")[0] || String(error),
      e?.details ? `details: ${e.details}` : "",
      e?.metaMessages?.length ? e.metaMessages.join(" | ") : "",
    ].filter(Boolean);
    const message = parts.join(" — ").replace(/\s+/g, " ").slice(0, 600);
    log.error("strategy step failed", { message });
    return Response.json({ error: message }, { status: 500 });
  }
}

/** Live DefiLlama yields filtered to Mantle, mapped to the strategy signal shape. Real data, no mock. */
async function fetchMantleYields(): Promise<YieldSignal[]> {
  const res = await fetch("https://yields.llama.fi/pools", { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`DefiLlama yields fetch failed (${res.status}).`);
  const json = (await res.json()) as { data?: Array<{ pool: string; chain: string; project: string; symbol?: string; tvlUsd?: number; apy?: number }> };
  const fetchedAt = new Date().toISOString();
  return (json.data ?? [])
    .filter((p) => p.chain === "Mantle")
    .map((p) => ({ source: "defillama", poolId: p.pool, project: p.project, chain: p.chain, symbol: p.symbol, tvlUsd: p.tvlUsd, apy: p.apy, fetchedAt }));
}

function envAddress(serverKey: string, publicKey: string): Address | undefined {
  const v = (process.env[serverKey] ?? process.env[publicKey])?.trim();
  return v && /^0x[0-9a-fA-F]{40}$/.test(v) ? (v as Address) : undefined;
}
function numberEnv(key: string, fallback: number): number {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}
function normalizeKey(value?: string): Hex | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const normalized = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  return /^0x[0-9a-fA-F]{64}$/.test(normalized) ? (normalized as Hex) : undefined;
}
function isPositiveId(value?: string): boolean {
  return Boolean(value && /^[1-9]\d*$/.test(value));
}
