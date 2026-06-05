import type { Hex } from "viem";
import type { InterlockFirewall } from "./firewall.js";
import { actionableError } from "./errors.js";
import { decisionToToolResult, normalizeAgentToolAction, type AgentFirewallToolInput, type AgentFirewallToolResult } from "./agent-tool.js";
import type { AgentAction } from "./types.js";

export type FirewallActionHandlerConfig = {
  firewall: InterlockFirewall;
  agentId: bigint;
  policyId: bigint;
  defaultMetadata?: AgentAction["metadata"];
  recordDecision?: boolean;
};

export type FirewallActionRequest = AgentFirewallToolInput;

export type FirewallActionHandlerResponse =
  | {
      ok: true;
      status: "allowed" | "blocked";
      decision: AgentFirewallToolResult;
      attestationHash?: Hex;
    }
  | {
      ok: false;
      status: "error";
      code: string;
      message: string;
      action: string;
    };

export function createFirewallActionHandler(config: FirewallActionHandlerConfig) {
  return {
    async handle(input: FirewallActionRequest): Promise<FirewallActionHandlerResponse> {
      try {
        const action = normalizeAgentToolAction(input, {
          firewall: config.firewall,
          agentId: config.agentId,
          policyId: config.policyId,
          defaultMetadata: config.defaultMetadata,
        });
        const decision = await config.firewall.checkAction(action);
        const attestationHash = config.recordDecision ? await config.firewall.recordDecision(decision) : undefined;

        return {
          ok: true,
          status: decision.allowed ? "allowed" : "blocked",
          decision: decisionToToolResult(decision, action),
          attestationHash,
        };
      } catch (error) {
        const actionable = actionableError(error);
        return {
          ok: false,
          status: "error",
          code: actionable.code,
          message: actionable.message,
          action: actionable.action,
        };
      }
    },
  };
}
