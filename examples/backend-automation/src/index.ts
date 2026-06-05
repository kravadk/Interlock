import { createPublicClient, createWalletClient, encodeFunctionData, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { InterlockFirewall } from "@interlock/firewall-sdk";
import { agentRegistryAbi, deployedAddresses, mantleSepolia } from "@interlock/shared";

const rpcUrl = process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0];
const agentId = readOptionalBigIntEnv("AGENT_ID");
const policyId = process.env.POLICY_ID ? BigInt(process.env.POLICY_ID) : undefined;
const target = envAddress("ACTION_TARGET", deployedAddresses.mantleSepolia.agentRegistry);

if (agentId === undefined) {
  showConfigurationReadiness();
} else if (!process.env.PRIVATE_KEY || policyId === undefined) {
  await showWorkerReadiness();
} else {
  await runGuardedWorker();
}

function showConfigurationReadiness() {
  console.log("Backend automation worker is configured for Mantle Sepolia.");
  console.log({
    rpcUrl,
    agentRegistry: deployedAddresses.mantleSepolia.agentRegistry,
    actionTarget: target,
    nextStep: "Set AGENT_ID to read a real registered agent. Add POLICY_ID and PRIVATE_KEY to submit a guarded action.",
  });
}

async function showWorkerReadiness() {
  const publicClient = createPublicClient({ chain: mantleSepolia, transport: http(rpcUrl) });
  const chainId = await publicClient.getChainId();
  const agent = await publicClient.readContract({
    address: deployedAddresses.mantleSepolia.agentRegistry,
    abi: agentRegistryAbi,
    functionName: "getAgent",
    args: [agentId!],
  });

  console.log("Backend automation worker is connected to live chain data");
  console.log({
    chainId,
    agentId: agentId!.toString(),
    owner: agent.owner,
    exists: agent.exists,
    nextStep: "Set PRIVATE_KEY and POLICY_ID to let the worker submit a guarded action.",
  });
}

async function runGuardedWorker() {
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

  const result = await firewall.guardedSendTransaction({
    agentId: agentId!,
    policyId: policyId!,
    tx: {
      to: target,
      value: parseEther(process.env.ACTION_VALUE_MNT ?? "0"),
      data,
    },
    metadata: {
      intent: "Backend worker reads registered agent state through an allowlisted AgentRegistry selector.",
      expectedSlippageBps: 0,
    },
  });

  console.log({
    sent: result.sent,
    decision: result.decision.decision,
    reasonCode: result.decision.reasonCode,
    executionTxHash: result.transactionHash,
    attestationTxHash: result.attestationHash,
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
