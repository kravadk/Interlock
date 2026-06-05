import { InterlockFirewall, createDefaultBenchmarkScenarios } from "@interlock/firewall-sdk";
import { createLogger, mantleSepolia, requestId } from "@interlock/shared";
import type { Hex } from "viem";
import { explorerTxUrl, mantleRpcUrl, webContracts } from "../../../../lib/contracts";
import { rateLimit } from "../../../../lib/rate-limit";

const log = createLogger("web:demo");

/**
 * Autonomous agent demo — server side. Runs ONE firewall decision + on-chain record per call so the
 * client can stream a bounded run step-by-step. Reads PRIVATE_KEY server-only (mirrors /api/attest):
 * never exposed to the browser; 503 if unset. Record-decisions-only — the deployer key is both the
 * tx sender and the EIP-712 attestor (it is the on-chain attestor + policy owner). The recorded
 * attestation auto-indexes and appears in the live Flight Recorder.
 */

const STEP_CAP = 23; // hard ceiling on step index → bounds gas regardless of client

export async function POST(request: Request) {
  const limited = rateLimit(request, "demo");
  if (limited) return limited;

  const privateKey = normalizeKey(process.env.PRIVATE_KEY);
  if (!privateKey) {
    return Response.json(
      { error: "Live demo is not configured. Set PRIVATE_KEY (server-side) to record attestations." },
      { status: 503 },
    );
  }

  const agentIdRaw = (process.env.AGENT_ID ?? process.env.NEXT_PUBLIC_DEFAULT_AGENT_ID)?.trim();
  const policyIdRaw = (process.env.POLICY_ID ?? process.env.NEXT_PUBLIC_DEFAULT_POLICY_ID)?.trim();
  if (!isPositiveId(agentIdRaw) || !isPositiveId(policyIdRaw)) {
    return Response.json(
      { error: "Set AGENT_ID and POLICY_ID (or NEXT_PUBLIC_DEFAULT_*) to a registered agent + policy." },
      { status: 503 },
    );
  }

  let body: { step?: number };
  try {
    body = (await request.json()) as { step?: number };
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const step = Number.isInteger(body.step) && body.step! >= 0 ? Math.min(body.step!, STEP_CAP) : 0;

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
    const scenarios = createDefaultBenchmarkScenarios({
      agentId,
      policyId,
      contracts,
      policyMaxNativeValue: policy.maxNativeValue,
      policyMaxSlippageBps: policy.maxSlippageBps,
    });
    const scenario = scenarios[step % scenarios.length];

    const id = requestId();
    const decision = await firewall.checkAction(scenario.action);
    const attestation = await firewall.recordDecisionAndWait(decision);
    log.info("demo step recorded", {
      requestId: id,
      step,
      decision: decision.decision,
      reasonCode: decision.reasonCode,
      txHash: attestation.transactionHash,
    });

    return Response.json(
      {
        step,
        total: scenarios.length,
        label: scenario.name,
        intent: scenario.intent,
        decision: decision.decision,
        reasonCode: decision.reasonCode,
        allowed: decision.allowed,
        riskScore: decision.riskScore,
        txHash: attestation.transactionHash,
        explorerUrl: explorerTxUrl(attestation.transactionHash),
      },
      { headers: { "x-request-id": id } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    log.error("demo step failed", { message });
    return Response.json({ error: message }, { status: 500 });
  }
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
