import { createPublicClient, encodeFunctionData, http, parseEther, type Address } from "viem";
import { InterlockFirewall, type AgentAction, type PlannedAgentTool, withInterlockFirewall } from "@interlock/firewall-sdk";
import { agentRegistryAbi, deployedAddresses, mantleSepolia } from "@interlock/shared";

type AgentPrompt = {
  agentId: bigint;
  policyId: bigint;
  target: Address;
};

type ToolOutput = {
  execution: "approved";
  target: Address;
};

const rpcUrl = process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0];
const agentId = readOptionalBigIntEnv("AGENT_ID");
const policyId = process.env.POLICY_ID ? BigInt(process.env.POLICY_ID) : undefined;
const target = envAddress("ACTION_TARGET", deployedAddresses.mantleSepolia.agentRegistry);

if (agentId === undefined) {
  showConfigurationReadiness();
} else if (policyId === undefined) {
  await showFrameworkReadiness();
} else {
  await runGuardedTool();
}

function showConfigurationReadiness() {
  console.log("Agent framework adapter is configured for Mantle Sepolia.");
  console.log({
    rpcUrl,
    agentRegistry: deployedAddresses.mantleSepolia.agentRegistry,
    actionTarget: target,
    nextStep: "Set AGENT_ID to read a real registered agent. Add POLICY_ID to run a live Interlock pre-flight.",
  });
}

async function showFrameworkReadiness() {
  const publicClient = createPublicClient({ chain: mantleSepolia, transport: http(rpcUrl) });
  const agent = await publicClient.readContract({
    address: deployedAddresses.mantleSepolia.agentRegistry,
    abi: agentRegistryAbi,
    functionName: "getAgent",
    args: [agentId!],
  });

  console.log("Agent framework adapter is connected to Mantle Sepolia");
  console.log({
    agentId: agentId!.toString(),
    owner: agent.owner,
    exists: agent.exists,
    nextStep: "Set POLICY_ID to run a live Interlock pre-flight around the planned tool action.",
  });
}

async function runGuardedTool() {
  const firewall = new InterlockFirewall({
    chain: mantleSepolia,
    rpcUrl,
    contracts: deployedAddresses.mantleSepolia,
  });

  const readAgentTool: PlannedAgentTool<AgentPrompt, ToolOutput> = {
    name: "read_agent_registry",
    description: "Plans an AgentRegistry read action and executes only after firewall approval.",
    plan(input): AgentAction {
      return {
        agentId: input.agentId,
        policyId: input.policyId,
        tx: {
          to: input.target,
          value: parseEther(process.env.ACTION_VALUE_MNT ?? "0"),
          data: encodeFunctionData({ abi: agentRegistryAbi, functionName: "getAgent", args: [input.agentId] }),
        },
        metadata: {
          intent: "Read registered agent state from AgentRegistry.",
          expectedSlippageBps: 0,
        },
      };
    },
    execute(action) {
      return {
        execution: "approved",
        target: action.tx.to,
      };
    },
  };

  const guardedTool = withInterlockFirewall(readAgentTool, firewall, { recordDecision: false });
  const result = await guardedTool.run({ agentId: agentId!, policyId: policyId!, target });
  console.log(`${result.status}: ${result.decision.decision} / ${result.decision.reasonCode}`);
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
