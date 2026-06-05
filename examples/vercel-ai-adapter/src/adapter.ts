import type { AgentAction, InterlockFirewall, FirewallDecision, PlannedAgentTool } from "@interlock/firewall-sdk";
import { withInterlockFirewall } from "@interlock/firewall-sdk";

export type VercelAiToolContext<TInput> = {
  input: TInput;
  decision: FirewallDecision;
};

export type VercelAiStyleTool<TInput, TOutput> = {
  description: string;
  parameters: Record<string, string>;
  prepare(input: TInput): AgentAction;
  execute(action: AgentAction, context: VercelAiToolContext<TInput>): Promise<TOutput> | TOutput;
};

export function guardVercelAiStyleTool<TInput, TOutput>(
  name: string,
  tool: VercelAiStyleTool<TInput, TOutput>,
  firewall: InterlockFirewall,
) {
  const plannedTool: PlannedAgentTool<TInput, TOutput> = {
    name,
    description: tool.description,
    plan: (input) => tool.prepare(input),
    execute: (action, context) =>
      tool.execute(action, {
        input: context.input,
        decision: context.decision,
      }),
  };

  return withInterlockFirewall(plannedTool, firewall, { recordDecision: false });
}
