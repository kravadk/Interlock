import { encodeFunctionData, parseEther, type Address } from "viem";
import {
  type AgentAction,
  type InterlockFirewall,
  type FirewallDecision,
  type PlannedAgentTool,
  withInterlockFirewall,
} from "@interlock/firewall-sdk";
import { agentRegistryAbi, mantleSepolia } from "@interlock/shared";

export type AgentKitNetwork = {
  chainId: number;
  networkId: string;
};

export type AgentKitActionInput = {
  agentId: bigint;
  policyId: bigint;
  target: Address;
};

export type AgentKitActionOutput = {
  provider: "agentkit-style";
  execution: "approved";
  networkId: string;
  target: Address;
  reasonCode: FirewallDecision["reasonCode"];
};

export type AgentKitStyleActionProvider<TInput, TOutput> = {
  name: string;
  supportsNetwork(network: AgentKitNetwork): boolean;
  prepare(input: TInput, network: AgentKitNetwork): AgentAction;
  invoke(input: TInput, action: AgentAction, decision: FirewallDecision, network: AgentKitNetwork): Promise<TOutput> | TOutput;
};

export function guardAgentKitStyleProvider<TInput, TOutput>(
  provider: AgentKitStyleActionProvider<TInput, TOutput>,
  firewall: InterlockFirewall,
  network: AgentKitNetwork,
) {
  if (!provider.supportsNetwork(network)) {
    throw new Error(`${provider.name} does not support ${network.networkId}.`);
  }

  const plannedTool: PlannedAgentTool<TInput, TOutput> = {
    name: provider.name,
    description: "AgentKit-style provider guarded by Interlock Firewall.",
    plan: (input) => provider.prepare(input, network),
    execute: (action, context) => provider.invoke(context.input, action, context.decision, network),
  };

  return withInterlockFirewall(plannedTool, firewall, { recordDecision: false });
}

export function createAgentKitStyleReadAgentProvider(
  valueMnt = "0",
): AgentKitStyleActionProvider<AgentKitActionInput, AgentKitActionOutput> {
  return {
    name: "interlock_read_agent_provider",
    supportsNetwork(nextNetwork) {
      return nextNetwork.chainId === mantleSepolia.id;
    },
    prepare(input, nextNetwork): AgentAction {
      return {
        agentId: input.agentId,
        policyId: input.policyId,
        tx: {
          to: input.target,
          value: parseEther(valueMnt),
          data: encodeFunctionData({
            abi: agentRegistryAbi,
            functionName: "getAgent",
            args: [input.agentId],
          }),
        },
        metadata: {
          intent: "AgentKit-style action provider wants to read AgentRegistry before wallet execution.",
          route: `agentkit-style-${nextNetwork.networkId}`,
          expectedSlippageBps: 0,
        },
      };
    },
    invoke(_input, action, decision, nextNetwork) {
      return {
        provider: "agentkit-style",
        execution: "approved",
        networkId: nextNetwork.networkId,
        target: action.tx.to,
        reasonCode: decision.reasonCode,
      };
    },
  };
}
