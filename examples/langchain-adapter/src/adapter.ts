import type { AgentAction, InterlockFirewall, FirewallDecision, PlannedAgentTool } from "@interlock/firewall-sdk";
import { withInterlockFirewall } from "@interlock/firewall-sdk";

export type LangChainToolContext<TInput> = {
  input: TInput;
  decision: FirewallDecision;
};

export type LangChainStyleStructuredTool<TInput, TOutput> = {
  name: string;
  description: string;
  schema: Record<string, string>;
  plan(input: TInput): AgentAction;
  call(action: AgentAction, context: LangChainToolContext<TInput>): Promise<TOutput> | TOutput;
};

export function guardLangChainStyleTool<TInput, TOutput>(
  tool: LangChainStyleStructuredTool<TInput, TOutput>,
  firewall: InterlockFirewall,
) {
  const plannedTool: PlannedAgentTool<TInput, TOutput> = {
    name: tool.name,
    description: tool.description,
    plan: (input) => tool.plan(input),
    execute: (action, context) =>
      tool.call(action, {
        input: context.input,
        decision: context.decision,
      }),
  };

  return withInterlockFirewall(plannedTool, firewall, { recordDecision: false });
}
