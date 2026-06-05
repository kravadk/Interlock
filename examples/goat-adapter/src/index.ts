import { createPublicClient, http } from "viem";
import { InterlockFirewall } from "@interlock/firewall-sdk";
import { agentRegistryAbi, deployedAddresses, mantleSepolia } from "@interlock/shared";
import { createGoatStyleReadAgentTool, guardGoatStyleTool } from "./adapter.js";

const rpcUrl = process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0];
const agentId = readOptionalBigIntEnv("AGENT_ID");
const policyId = process.env.POLICY_ID ? BigInt(process.env.POLICY_ID) : undefined;
const target = envAddress("ACTION_TARGET", deployedAddresses.mantleSepolia.agentRegistry);

if (agentId === undefined) {
  showConfigurationReadiness();
} else if (policyId === undefined) {
  await showReadiness();
} else {
  await runGoatStylePreflight();
}

function showConfigurationReadiness() {
  console.log("GOAT-style adapter is configured for Mantle Sepolia.");
  console.log({
    rpcUrl,
    agentRegistry: deployedAddresses.mantleSepolia.agentRegistry,
    actionTarget: target,
    nextStep: "Set AGENT_ID to read a real registered agent. Add POLICY_ID to run a live Interlock pre-flight.",
  });
}

async function showReadiness() {
  const publicClient = createPublicClient({ chain: mantleSepolia, transport: http(rpcUrl) });
  const agent = await publicClient.readContract({
    address: deployedAddresses.mantleSepolia.agentRegistry,
    abi: agentRegistryAbi,
    functionName: "getAgent",
    args: [agentId!],
  });

  console.log("GOAT-style adapter is ready.");
  console.log({
    agentId: agentId!.toString(),
    owner: agent.owner,
    exists: agent.exists,
    nextStep: "Set POLICY_ID to run a live Interlock pre-flight around the GOAT-style tool action.",
  });
}

async function runGoatStylePreflight() {
  const firewall = new InterlockFirewall({
    chain: mantleSepolia,
    rpcUrl,
    contracts: deployedAddresses.mantleSepolia,
  });

  const goatTool = createGoatStyleReadAgentTool(process.env.ACTION_VALUE_MNT ?? "0");
  const guardedTool = guardGoatStyleTool(goatTool, firewall);
  const result = await guardedTool.run({ agentId: agentId!, policyId: policyId!, target });

  console.log({
    status: result.status,
    decision: result.decision.decision,
    reasonCode: result.decision.reasonCode,
    executed: result.status === "executed",
  });
}

function envAddress(name: string, defaultAddress: `0x${string}`) {
  return (process.env[name] as `0x${string}` | undefined) ?? defaultAddress;
}

function readOptionalBigIntEnv(name: string) {
  const value = process.env[name];
  if (!value) return undefined;
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be set to a positive id from the deployed Interlock contracts.`);
  }
  return BigInt(value);
}
