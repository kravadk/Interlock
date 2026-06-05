import { createPublicClient, http } from "viem";
import { InterlockFirewall } from "@interlock/firewall-sdk";
import { agentRegistryAbi, deployedAddresses, mantleSepolia } from "@interlock/shared";
import { createAgentKitStyleReadAgentProvider, guardAgentKitStyleProvider, type AgentKitNetwork } from "./adapter.js";

const rpcUrl = process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0];
const agentId = readOptionalBigIntEnv("AGENT_ID");
const policyId = process.env.POLICY_ID ? BigInt(process.env.POLICY_ID) : undefined;
const target = envAddress("ACTION_TARGET", deployedAddresses.mantleSepolia.agentRegistry);
const network: AgentKitNetwork = {
  chainId: mantleSepolia.id,
  networkId: "mantle-sepolia",
};

if (agentId === undefined) {
  showConfigurationReadiness();
} else if (policyId === undefined) {
  await showReadiness();
} else {
  await runAgentKitStylePreflight();
}

function showConfigurationReadiness() {
  console.log("AgentKit-style adapter is configured for Mantle Sepolia.");
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

  console.log("AgentKit-style adapter is ready.");
  console.log({
    agentId: agentId!.toString(),
    owner: agent.owner,
    exists: agent.exists,
    nextStep: "Set POLICY_ID to run a live Interlock pre-flight around the AgentKit-style action provider.",
  });
}

async function runAgentKitStylePreflight() {
  const firewall = new InterlockFirewall({
    chain: mantleSepolia,
    rpcUrl,
    contracts: deployedAddresses.mantleSepolia,
  });

  const provider = createAgentKitStyleReadAgentProvider(process.env.ACTION_VALUE_MNT ?? "0");
  const guardedAction = guardAgentKitStyleProvider(provider, firewall, network);
  const result = await guardedAction.run({ agentId: agentId!, policyId: policyId!, target });

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
