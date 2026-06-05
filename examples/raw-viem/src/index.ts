import { createPublicClient, createWalletClient, encodeFunctionData, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { InterlockFirewall, createGuardedViemWallet } from "@interlock/firewall-sdk";
import { agentRegistryAbi, deployedAddresses, mantleSepolia } from "@interlock/shared";

const rpcUrl = process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0];
const agentId = readOptionalBigIntEnv("AGENT_ID");
const policyId = process.env.POLICY_ID ? BigInt(process.env.POLICY_ID) : undefined;
const target = envAddress("ACTION_TARGET", deployedAddresses.mantleSepolia.agentRegistry);

if (agentId === undefined) {
  showConfigurationReadiness();
} else if (!process.env.PRIVATE_KEY || policyId === undefined) {
  await showReadOnlyState();
} else {
  await runGuardedWallet();
}

function showConfigurationReadiness() {
  console.log("Raw Viem integration is configured for Mantle Sepolia.");
  console.log({
    rpcUrl,
    agentRegistry: deployedAddresses.mantleSepolia.agentRegistry,
    actionTarget: target,
    nextStep: "Set AGENT_ID to read a real registered agent. Add POLICY_ID and PRIVATE_KEY to send a guarded transaction.",
  });
}

async function showReadOnlyState() {
  const publicClient = createPublicClient({ chain: mantleSepolia, transport: http(rpcUrl) });
  const agent = await publicClient.readContract({
    address: deployedAddresses.mantleSepolia.agentRegistry,
    abi: agentRegistryAbi,
    functionName: "getAgent",
    args: [agentId!],
  });

  console.log("Raw Viem integration is connected to Mantle Sepolia");
  console.log({
    agentId: agentId!.toString(),
    owner: agent.owner,
    exists: agent.exists,
    allowedActions: agent.allowedActions.toString(),
    blockedActions: agent.blockedActions.toString(),
    nextStep: "Set PRIVATE_KEY and POLICY_ID to send a guarded transaction.",
  });
}

async function runGuardedWallet() {
  const data = encodeFunctionData({ abi: agentRegistryAbi, functionName: "getAgent", args: [agentId!] });
  const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
  const walletClient = createWalletClient({
    account,
    chain: mantleSepolia,
    transport: http(rpcUrl),
  });

  const firewall = new InterlockFirewall({
    chain: mantleSepolia,
    rpcUrl,
    walletClient,
    contracts: deployedAddresses.mantleSepolia,
  });

  const guardedWallet = createGuardedViemWallet({
    firewall,
    walletClient,
    agentId: agentId!,
    policyId: policyId!,
    defaultMetadata: {
      intent: "Read registered agent state from AgentRegistry through a guarded Viem wallet.",
      expectedSlippageBps: 0,
    },
  });

  const result = await guardedWallet.sendTransaction({
    to: target,
    value: parseEther(process.env.ACTION_VALUE_MNT ?? "0"),
    data,
  });

  console.log({
    executionTxHash: result.transactionHash,
    attestationTxHash: result.attestationHash,
    decision: result.decision.decision,
    reasonCode: result.decision.reasonCode,
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
