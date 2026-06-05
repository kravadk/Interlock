import { encodeFunctionData, type Address, type Hex } from "viem";
import { InterlockFirewall, createByrealGatewayAdapter } from "@interlock/firewall-sdk";
import { agentRegistryAbi, deployedAddresses, mantleSepolia } from "@interlock/shared";

const rpcUrl = process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0];
const agentId = readOptionalBigIntEnv("AGENT_ID");
const policyId = readOptionalBigIntEnv("POLICY_ID");
const target = envAddress("ACTION_TARGET", deployedAddresses.mantleSepolia.agentRegistry);
const actionCalldata = process.env.ACTION_CALLDATA as Hex | undefined;

if (agentId === undefined || policyId === undefined) {
  showReadiness();
} else {
  await runByrealCompatibilityCheck();
}

function showReadiness() {
  console.log("Byreal / RealClaw compatibility adapter is configured for Mantle Sepolia.");
  console.log({
    rpcUrl,
    chainId: mantleSepolia.id,
    source: "realclaw | byreal-agent-skill | openclaw | byreal-compatible",
    defaultActionTarget: target,
    defaultActionTargetPurpose:
      target === deployedAddresses.mantleSepolia.agentRegistry
        ? "Real deployed AgentRegistry test target. Replace ACTION_TARGET with the real Byreal/OpenClaw skill target for integration."
        : "Team-supplied ACTION_TARGET.",
    requiredEnvForLiveCheck: ["AGENT_ID", "POLICY_ID"],
    optionalEnv: ["ACTION_TARGET", "ACTION_CALLDATA", "ACTION_VALUE_WEI", "ACTION_SKILL_ID", "ACTION_STRATEGY"],
    nextStep:
      "Set AGENT_ID and POLICY_ID for a live dry-run gateway check. Use only real deployed targets; this adapter does not ship fake Byreal protocol addresses.",
  });
}

async function runByrealCompatibilityCheck() {
  if (agentId === undefined || policyId === undefined) {
    throw new Error("AGENT_ID and POLICY_ID are required for a live Byreal/RealClaw compatibility check.");
  }

  const firewall = new InterlockFirewall({
    chain: mantleSepolia,
    rpcUrl,
    contracts: deployedAddresses.mantleSepolia,
    privateKey: process.env.PRIVATE_KEY as Hex | undefined,
  });
  const adapter = createByrealGatewayAdapter(firewall);

  const result = await adapter.run(
    {
      source: "realclaw",
      skillId: process.env.ACTION_SKILL_ID ?? "openclaw.mantle.proposed-evm-action",
      strategy: process.env.ACTION_STRATEGY ?? "Interlock guarded Mantle action",
      chainId: mantleSepolia.id,
      agentId,
      policyId,
      to: target,
      valueWei: process.env.ACTION_VALUE_WEI ?? "0",
      data: actionCalldata ?? defaultReadAgentCalldata(agentId),
      intent: process.env.ACTION_INTENT ?? "RealClaw-compatible skill asks Interlock to preflight a proposed Mantle action.",
      expectedSlippageBps: process.env.ACTION_SLIPPAGE_BPS ? Number(process.env.ACTION_SLIPPAGE_BPS) : 0,
    },
    { mode: "dry-run" },
  );

  console.log({
    adapter: "byreal-realclaw-compatible",
    mode: result.mode,
    status: result.status,
    decision: result.decision.decision,
    reasonCode: result.decision.reasonCode,
    sent: result.sent,
    recorded: result.recorded,
    nextAction: result.nextAction,
    target: result.decision.tx.to,
  });
}

function defaultReadAgentCalldata(id: bigint) {
  return encodeFunctionData({
    abi: agentRegistryAbi,
    functionName: "getAgent",
    args: [id],
  });
}

function envAddress(name: string, fallback: Address) {
  const value = process.env[name];
  if (!value) return fallback;
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    throw new Error(`${name} must be a real EVM address.`);
  }
  return value as Address;
}

function readOptionalBigIntEnv(name: string) {
  const value = process.env[name];
  if (!value) return undefined;
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be set to a positive id from the deployed Interlock contracts.`);
  }
  return BigInt(value);
}
