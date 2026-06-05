import { ActionBlockedError } from "./errors.js";
import type { AgentAction, FirewallDecision } from "./types.js";

export type FirewallChecker = {
  checkAction(action: AgentAction): Promise<FirewallDecision>;
  recordDecision?(decision: FirewallDecision): Promise<unknown>;
};

export type PlannedAgentTool<TInput, TOutput> = {
  name: string;
  description?: string;
  plan(input: TInput): Promise<AgentAction> | AgentAction;
  execute(action: AgentAction, context: { input: TInput; decision: FirewallDecision }): Promise<TOutput> | TOutput;
};

export type FirewallWrappedToolOptions = {
  recordDecision?: boolean;
  throwOnBlock?: boolean;
};

export type FirewallWrappedToolAllowedResult<TOutput> = {
  status: "executed";
  tool: string;
  decision: FirewallDecision;
  output: TOutput;
};

export type FirewallWrappedToolBlockedResult = {
  status: "blocked";
  tool: string;
  decision: FirewallDecision;
  output?: never;
};

export type FirewallWrappedToolResult<TOutput> = FirewallWrappedToolAllowedResult<TOutput> | FirewallWrappedToolBlockedResult;

export function withInterlockFirewall<TInput, TOutput>(
  tool: PlannedAgentTool<TInput, TOutput>,
  firewall: FirewallChecker,
  options: FirewallWrappedToolOptions = {},
) {
  return {
    name: `${tool.name}_with_interlock_firewall`,
    description: tool.description,
    async run(input: TInput): Promise<FirewallWrappedToolResult<TOutput>> {
      const action = await tool.plan(input);
      const decision = await firewall.checkAction(action);

      if (options.recordDecision ?? true) {
        await firewall.recordDecision?.(decision);
      }

      if (!decision.allowed) {
        if (options.throwOnBlock ?? false) {
          throw new ActionBlockedError(decision);
        }
        return {
          status: "blocked",
          tool: tool.name,
          decision,
        };
      }

      const output = await tool.execute(action, { input, decision });
      return {
        status: "executed",
        tool: tool.name,
        decision,
        output,
      };
    },
  };
}
