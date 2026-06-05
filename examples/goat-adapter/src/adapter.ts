import { encodeFunctionData, parseEther, type Address } from "viem";
import {
  type AgentAction,
  type InterlockFirewall,
  type FirewallDecision,
  type PlannedAgentTool,
  withInterlockFirewall,
} from "@interlock/firewall-sdk";
import { agentRegistryAbi } from "@interlock/shared";

export type GoatToolInput = {
  agentId: bigint;
  policyId: bigint;
  target: Address;
};

export type GoatToolOutput = {
  provider: "goat-style";
  execution: "approved";
  target: Address;
  reasonCode: FirewallDecision["reasonCode"];
};

export type GoatStyleTool<TInput, TOutput> = {
  name: string;
  description: string;
  parameters: Record<string, string>;
  buildAction(input: TInput): AgentAction;
  execute(input: TInput, action: AgentAction, decision: FirewallDecision): Promise<TOutput> | TOutput;
};

export function guardGoatStyleTool<TInput, TOutput>(tool: GoatStyleTool<TInput, TOutput>, firewall: InterlockFirewall) {
  const plannedTool: PlannedAgentTool<TInput, TOutput> = {
    name: tool.name,
    description: tool.description,
    plan: (input) => tool.buildAction(input),
    execute: (action, context) => tool.execute(context.input, action, context.decision),
  };

  return withInterlockFirewall(plannedTool, firewall, { recordDecision: false });
}

export function createGoatStyleReadAgentTool(valueMnt = "0"): GoatStyleTool<GoatToolInput, GoatToolOutput> {
  return {
    name: "mantle_read_agent_registry",
    description: "GOAT-style action that reads AgentRegistry only after Interlock Firewall allows it.",
    parameters: {
      agentId: "Agent id to read",
      policyId: "Interlock policy id",
      target: "AgentRegistry target address",
    },
    buildAction(input): AgentAction {
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
          intent: "GOAT-style tool wants to read the agent registry before taking a next step.",
          route: "goat-style-read-agent",
          expectedSlippageBps: 0,
        },
      };
    },
    execute(_input, action, decision) {
      return {
        provider: "goat-style",
        execution: "approved",
        target: action.tx.to,
        reasonCode: decision.reasonCode,
      };
    },
  };
}
