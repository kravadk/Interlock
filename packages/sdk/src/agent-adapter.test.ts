import { describe, expect, it, vi } from "vitest";
import { withInterlockFirewall, type PlannedAgentTool } from "./agent-adapter.js";
import { ActionBlockedError } from "./errors.js";
import type { AgentAction, FirewallDecision } from "./types.js";

const action: AgentAction = {
  agentId: 1n,
  policyId: 2n,
  tx: {
    to: "0xe4dfef03e107225f2239cfff955a378a9a8158be",
    value: 0n,
    data: "0x12345678",
  },
};

const allowedDecision: FirewallDecision = {
  allowed: true,
  decision: "ALLOW",
  reasonCode: "POLICY_PASSED",
  riskScore: 8,
  simulationHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  calldataHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  selector: "0x12345678",
  explanation: "ok",
  tx: action.tx,
  agentId: action.agentId,
  policyId: action.policyId,
  simulation: { success: true },
  checks: {
    targetAllowed: true,
    selectorAllowed: true,
    valueWithinLimit: true,
    slippageWithinLimit: true,
    policyActive: true,
  },
};

const tool: PlannedAgentTool<{ amount: string }, { txHash: string }> = {
  name: "deposit_tool",
  plan: () => action,
  execute: async (_action, context) => ({
    txHash: context.decision.allowed ? "0xsent" : "0xblocked",
  }),
};

describe("withInterlockFirewall", () => {
  it("executes an allowed planned action", async () => {
    const firewall = {
      checkAction: vi.fn(async () => allowedDecision),
      recordDecision: vi.fn(async () => "0xattestation"),
    };
    const wrapped = withInterlockFirewall(tool, firewall);
    const result = await wrapped.run({ amount: "0.01" });
    expect(result.status).toBe("executed");
    expect(firewall.recordDecision).toHaveBeenCalledWith(allowedDecision);
  });

  it("returns blocked result without executing by default", async () => {
    const blockedDecision: FirewallDecision = {
      ...allowedDecision,
      allowed: false,
      decision: "BLOCK",
      reasonCode: "TARGET_NOT_ALLOWED",
    };
    const execute = vi.fn(tool.execute);
    const wrapped = withInterlockFirewall({ ...tool, execute }, { checkAction: vi.fn(async () => blockedDecision) });
    const result = await wrapped.run({ amount: "0.01" });
    expect(result.status).toBe("blocked");
    expect(execute).not.toHaveBeenCalled();
  });

  it("can throw for blocked actions", async () => {
    const blockedDecision: FirewallDecision = {
      ...allowedDecision,
      allowed: false,
      decision: "BLOCK",
      reasonCode: "VALUE_LIMIT_EXCEEDED",
    };
    const wrapped = withInterlockFirewall(tool, { checkAction: vi.fn(async () => blockedDecision) }, { throwOnBlock: true });
    await expect(wrapped.run({ amount: "1" })).rejects.toThrow(ActionBlockedError);
  });
});
