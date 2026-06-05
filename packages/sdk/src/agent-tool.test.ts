import { describe, expect, it } from "vitest";
import { createAgentFirewallTool, decisionToToolResult, normalizeAgentToolAction, AgentToolInputError } from "./agent-tool.js";
import type { InterlockFirewall } from "./firewall.js";
import type { FirewallDecision } from "./types.js";

const decision: FirewallDecision = {
  allowed: true,
  decision: "ALLOW",
  reasonCode: "POLICY_PASSED",
  riskScore: 8,
  simulationHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  calldataHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  selector: "0x12345678",
  explanation: "ok",
  tx: { to: "0xe4dfef03e107225f2239cfff955a378a9a8158be", value: 0n, data: "0x12345678" },
  agentId: 1n,
  policyId: 2n,
  simulation: { success: true },
  checks: { targetAllowed: true, selectorAllowed: true, valueWithinLimit: true, slippageWithinLimit: true, policyActive: true },
};

describe("agent tool", () => {
  it("normalizes JSON-like agent tool input", () => {
    const action = normalizeAgentToolAction({ to: decision.tx.to, value: "10", data: decision.tx.data }, { firewall: {} as InterlockFirewall, agentId: 1n, policyId: 2n });
    expect(action.tx.value).toBe(10n);
  });

  it("rejects malformed input", () => {
    expect(() => normalizeAgentToolAction({ to: "bad" }, { firewall: {} as InterlockFirewall, agentId: 1n, policyId: 2n })).toThrow(AgentToolInputError);
  });

  it("rejects odd-length calldata before RPC simulation", () => {
    expect(() =>
      normalizeAgentToolAction({ to: decision.tx.to, value: "0", data: "0x0" }, { firewall: {} as InterlockFirewall, agentId: 1n, policyId: 2n }),
    ).toThrow(AgentToolInputError);
  });

  it("rejects negative slippage before RPC simulation", () => {
    expect(() =>
      normalizeAgentToolAction(
        { to: decision.tx.to, value: "0", data: decision.tx.data, expectedSlippageBps: -1 },
        { firewall: {} as InterlockFirewall, agentId: 1n, policyId: 2n },
      ),
    ).toThrow(AgentToolInputError);
  });

  it("returns JSON-safe tool results", () => {
    expect(decisionToToolResult(decision).agentId).toBe("1");
  });

  it("checks actions through the configured firewall", async () => {
    const firewall = { checkAction: async () => decision } as unknown as InterlockFirewall;
    const tool = createAgentFirewallTool({ firewall, agentId: 1n, policyId: 2n });
    await expect(tool.check({ to: decision.tx.to, data: decision.tx.data })).resolves.toMatchObject({ allowed: true });
  });
});
