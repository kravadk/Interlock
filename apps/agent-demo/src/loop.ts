import { InterlockFirewall, createDefaultBenchmarkScenarios } from "@interlock/firewall-sdk";
import { deployedAddresses, mantleSepolia } from "@interlock/shared";
import { isAddress, type Address } from "viem";

/**
 * Autonomous agent demo loop. Each tick proposes a varied action (safe read = ALLOW; unknown
 * target / overspend / slippage = BLOCK), runs it through the firewall (checkAction), and records
 * the decision on-chain (recordDecisionAndWait) — for BOTH ALLOW and BLOCK, since a BLOCK
 * attestation is pre-flight evidence too. Records auto-index and stream into the live Flight
 * Recorder. Record-decisions-only: no arbitrary transaction sends.
 *
 *   pnpm --filter @interlock/agent-demo demo:loop -- --iterations 3 --interval 4
 *
 * Without --iterations it runs continuously. Requires PRIVATE_KEY + AGENT_ID + POLICY_ID.
 */
await runAgentLoop();

async function runAgentLoop() {
  const privateKey = normalizePrivateKey(process.env.PRIVATE_KEY);
  if (!privateKey) {
    throw new Error("Set PRIVATE_KEY to run the autonomous demo loop (it records attestations on Mantle Sepolia).");
  }
  const iterations = parseNumberFlag("--iterations");
  const intervalMs = (parseNumberFlag("--interval") ?? 4) * 1000;
  const rpcUrl = process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0];
  const agentId = readRequiredBigIntEnv("AGENT_ID");
  const policyId = readRequiredBigIntEnv("POLICY_ID");
  const contracts = {
    agentRegistry: envAddress("AGENT_REGISTRY", deployedAddresses.mantleSepolia.agentRegistry),
    policyRegistry: envAddress("POLICY_REGISTRY", deployedAddresses.mantleSepolia.policyRegistry),
    actionAttestation: envAddress("ACTION_ATTESTATION", deployedAddresses.mantleSepolia.actionAttestation),
  };

  const firewall = new InterlockFirewall({ chain: mantleSepolia, rpcUrl, privateKey, contracts });
  const policy = await firewall.getPolicy(policyId);
  const scenarios = createDefaultBenchmarkScenarios({
    agentId,
    policyId,
    contracts,
    policyMaxNativeValue: policy.maxNativeValue,
    policyMaxSlippageBps: policy.maxSlippageBps,
  });

  const max = iterations ?? Number.POSITIVE_INFINITY;
  console.log(
    `Interlock demo loop — agent ${agentId} / policy ${policyId} · ${
      Number.isFinite(max) ? `${max} iterations` : "continuous"
    } · ${scenarios.length} rotating scenarios`,
  );

  for (let i = 0; i < max; i += 1) {
    const scenario = scenarios[i % scenarios.length];
    try {
      const decision = await firewall.checkAction(scenario.action);
      const attestation = await firewall.recordDecisionAndWait(decision);
      console.log(
        `[${i + 1}] ${scenario.name}: ${decision.decision} (${decision.reasonCode}) · ` +
          `risk ${decision.riskScore} · tx ${attestation.transactionHash}`,
      );
    } catch (error) {
      console.error(`[${i + 1}] ${scenario.name}: ERROR ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
    }
    if (i + 1 < max) await sleep(intervalMs);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseNumberFlag(flag: string): number | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function envAddress(name: string, fallback: Address) {
  const value = process.env[name];
  if (!value) return fallback;
  if (!isAddress(value)) throw new Error(`${name} must be a valid EVM address.`);
  return value;
}

function normalizePrivateKey(value?: string) {
  if (!value) return undefined;
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("PRIVATE_KEY must be a 32-byte hex private key.");
  }
  return normalized as `0x${string}`;
}

function readRequiredBigIntEnv(name: string) {
  const value = process.env[name];
  if (!value || !/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be set to a positive id from the deployed Interlock contracts.`);
  }
  return BigInt(value);
}
