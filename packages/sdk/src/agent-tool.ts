import { isAddress, type Address, type Hex } from "viem";
import { InterlockError } from "./errors.js";
import type { InterlockFirewall } from "./firewall.js";
import type { AgentAction, FirewallDecision } from "./types.js";
import { assertValidCalldata, assertValidSlippageBps } from "./validation.js";
import { decisionToAgentToolResult } from "./viem-adapter.js";

export type AgentFirewallToolConfig = {
  firewall: InterlockFirewall;
  agentId: bigint;
  policyId: bigint;
  defaultMetadata?: AgentAction["metadata"];
};

export type AgentFirewallToolInput = {
  to: string;
  value?: string | number | bigint;
  data?: string;
  intent?: string;
  route?: string;
  expectedSlippageBps?: number;
  agentId?: string | number | bigint;
  policyId?: string | number | bigint;
};

export type AgentFirewallToolResult = ReturnType<typeof decisionToAgentToolResult> & {
  agentId: string;
  policyId: string;
  action: {
    to: Address;
    value: string;
    data: Hex;
    metadata?: AgentAction["metadata"];
  };
  simulation: {
    success: boolean;
    error?: string;
  };
};

export class AgentToolInputError extends InterlockError {
  constructor(message: string) {
    super("AGENT_TOOL_INPUT_INVALID", message, {
      action: "Fix the agent-proposed transaction JSON before running preflight. Use an EVM address, non-negative integer values, and 0x-prefixed hex calldata.",
    });
    this.name = "AgentToolInputError";
  }
}

export function createAgentFirewallTool(config: AgentFirewallToolConfig) {
  return {
    name: "interlock_firewall_check",
    description: "Pre-flight check for an AI agent transaction before it moves funds on Mantle.",
    async check(input: AgentFirewallToolInput): Promise<AgentFirewallToolResult> {
      const action = normalizeAgentToolAction(input, config);
      const decision = await config.firewall.checkAction(action);
      return decisionToToolResult(decision, action);
    },
  };
}

export function normalizeAgentToolAction(input: AgentFirewallToolInput, config: AgentFirewallToolConfig): AgentAction {
  if (!isAddress(input.to)) {
    throw new AgentToolInputError(`Invalid target address: ${input.to}`);
  }

  const data = input.data ?? "0x";
  try {
    assertValidCalldata(data, "data");
    assertValidSlippageBps(input.expectedSlippageBps, "expectedSlippageBps");
  } catch (error) {
    throw new AgentToolInputError(error instanceof Error ? error.message : "Invalid agent tool input.");
  }

  return {
    agentId: input.agentId === undefined ? config.agentId : parseToolBigInt(input.agentId, "agentId"),
    policyId: input.policyId === undefined ? config.policyId : parseToolBigInt(input.policyId, "policyId"),
    tx: {
      to: input.to,
      value: input.value === undefined ? 0n : parseToolBigInt(input.value, "value"),
      data,
    },
    metadata: {
      ...config.defaultMetadata,
      intent: input.intent ?? config.defaultMetadata?.intent,
      route: input.route ?? config.defaultMetadata?.route,
      expectedSlippageBps: input.expectedSlippageBps ?? config.defaultMetadata?.expectedSlippageBps,
    },
  };
}

export function decisionToToolResult(decision: FirewallDecision, action?: AgentAction): AgentFirewallToolResult {
  return {
    ...decisionToAgentToolResult(decision),
    agentId: decision.agentId.toString(),
    policyId: decision.policyId.toString(),
    action: {
      to: decision.tx.to,
      value: decision.tx.value.toString(),
      data: decision.tx.data,
      metadata: action?.metadata,
    },
    simulation: decision.simulation,
  };
}

function parseToolBigInt(value: string | number | bigint, field: string): bigint {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") {
      if (!Number.isInteger(value) || value < 0) {
        throw new Error("Expected a non-negative integer.");
      }
      return BigInt(value);
    }
    if (!/^\d+$/.test(value)) {
      throw new Error("Expected a decimal integer string.");
    }
    return BigInt(value);
  } catch (error) {
    throw new AgentToolInputError(`Invalid ${field}: ${error instanceof Error ? error.message : "unknown parse error"}`);
  }
}
