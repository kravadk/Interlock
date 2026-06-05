import { createPublicClient, encodeFunctionData, http, parseEther, type Address } from "viem";
import { InterlockFirewall, type AgentAction, type FirewallDecision } from "@interlock/firewall-sdk";
import { agentRegistryAbi, deployedAddresses, mantleSepolia } from "@interlock/shared";
import { guardLangChainStyleTool, type LangChainStyleStructuredTool } from "./adapter.js";

type ToolInput = {
  agentId: bigint;
  policyId: bigint;
  target: Address;
};

type ToolOutput = {
  provider: "langchain-style";
  execution: "approved";
  reasonCode: FirewallDecision["reasonCode"];
  target: Address;
};

const rpcUrl = process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0];
const agentId = readOptionalBigIntEnv("AGENT_ID");
const policyId = process.env.POLICY_ID ? BigInt(process.env.POLICY_ID) : undefined;
const target = envAddress("ACTION_TARGET", deployedAddresses.mantleSepolia.agentRegistry);

if (agentId === undefined) {
  showConfigurationReadiness();
} else if (policyId === undefined) {
  await showReadiness();
} else {
  await runLangChainStylePreflight();
}

function showConfigurationReadiness() {
  console.log("LangChain-style adapter is configured for Mantle Sepolia.");
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

  console.log("LangChain-style adapter is ready.");
  console.log({
    agentId: agentId!.toString(),
    owner: agent.owner,
    exists: agent.exists,
    nextStep: "Set POLICY_ID to run a live Interlock pre-flight around the structured tool.",
  });
}

async function runLangChainStylePreflight() {
  const firewall = new InterlockFirewall({
    chain: mantleSepolia,
    rpcUrl,
    contracts: deployedAddresses.mantleSepolia,
  });

  const readAgentTool: LangChainStyleStructuredTool<ToolInput, ToolOutput> = {
    name: "interlock_check_transaction",
    description: "LangChain-style structured tool guarded by Interlock Firewall.",
    schema: {
      agentId: "Registered Interlock agent id",
      policyId: "Interlock policy id",
      target: "AgentRegistry target contract",
    },
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
          intent: "LangChain-style tool wants to inspect registered agent state before a follow-up action.",
          route: "langchain-style-read-agent",
          expectedSlippageBps: 0,
        },
      };
    },
    call(action, context) {
      return {
        provider: "langchain-style",
        execution: "approved",
        reasonCode: context.decision.reasonCode,
        target: action.tx.to,
      };
    },
  };

  const guardedTool = guardLangChainStyleTool(readAgentTool, firewall);
  const result = await guardedTool.run({ agentId: agentId!, policyId: policyId!, target });

  console.log({
    status: result.status,
    decision: result.decision.decision,
    reasonCode: result.decision.reasonCode,
    executed: result.status === "executed",
  });
}

function envAddress(name: string, defaultAddress: Address) {
  return (process.env[name] as Address | undefined) ?? defaultAddress;
}

function readOptionalBigIntEnv(name: string) {
  const value = process.env[name];
  if (!value) return undefined;
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be set to a positive id from the deployed Interlock contracts.`);
  }
  return BigInt(value);
}
