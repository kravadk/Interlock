import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { createFirewallActionHandler } from "./action-handler.js";
import type { InterlockFirewall } from "./firewall.js";
import type { AgentAction, FirewallDecision } from "./types.js";

const target = "0xe4dfef03e107225f2239cfff955a378a9a8158be";
const attestationHash = `0x${"a".repeat(64)}` as Hex;

describe("createFirewallActionHandler", () => {
  it("returns a JSON-safe allowed response", async () => {
    const firewall = fixtureFirewall((action) => decisionFor(action, true, "ALLOW", "POLICY_PASSED"));
    const handler = createFirewallActionHandler({ firewall, agentId: 1n, policyId: 2n });

    const response = await handler.handle({
      to: target,
      value: "10",
      data: "0xd0e30db0",
      intent: "Deposit into approved vault",
    });

    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error(response.message);
    expect(response.status).toBe("allowed");
    expect(response.decision.agentId).toBe("1");
    expect(response.decision.policyId).toBe("2");
    expect(response.decision.allowed).toBe(true);
    expect(response.decision.reasonCode).toBe("POLICY_PASSED");
    expect(response.decision.action.value).toBe("10");
  });

  it("can record the decision when configured", async () => {
    let recorded: FirewallDecision | undefined;
    const firewall = fixtureFirewall(
      (action) => decisionFor(action, false, "BLOCK", "TARGET_NOT_ALLOWED"),
      async (decision) => {
        recorded = decision;
        return attestationHash;
      },
    );
    const handler = createFirewallActionHandler({ firewall, agentId: 1n, policyId: 2n, recordDecision: true });

    const response = await handler.handle({ to: target, data: "0xd0e30db0" });

    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error(response.message);
    expect(response.status).toBe("blocked");
    expect(response.attestationHash).toBe(attestationHash);
    expect(recorded?.reasonCode).toBe("TARGET_NOT_ALLOWED");
  });

  it("returns structured errors for invalid input", async () => {
    const firewall = fixtureFirewall((action) => decisionFor(action, true, "ALLOW", "POLICY_PASSED"));
    const handler = createFirewallActionHandler({ firewall, agentId: 1n, policyId: 2n });

    const response = await handler.handle({ to: "not-an-address" });

    expect(response.ok).toBe(false);
    if (response.ok) throw new Error("expected error");
    expect(response.status).toBe("error");
    expect(response.code).toBe("AGENT_TOOL_INPUT_INVALID");
    expect(response.message).toContain("Invalid target address");
    expect(response.action).toContain("Fix the agent-proposed transaction JSON");
  });
});

function fixtureFirewall(
  checkAction: (action: AgentAction) => FirewallDecision | Promise<FirewallDecision>,
  recordDecision: (decision: FirewallDecision) => Promise<Hex> = async () => attestationHash,
): InterlockFirewall {
  return { checkAction, recordDecision } as unknown as InterlockFirewall;
}

function decisionFor(action: AgentAction, allowed: boolean, decision: "ALLOW" | "BLOCK", reasonCode: FirewallDecision["reasonCode"]): FirewallDecision {
  return {
    allowed,
    decision,
    reasonCode,
    riskScore: allowed ? 8 : 92,
    simulationHash: `0x${"1".repeat(64)}`,
    calldataHash: `0x${"2".repeat(64)}`,
    selector: action.tx.data.slice(0, 10) as Hex,
    explanation: allowed ? "Policy passed." : "Policy blocked the action.",
    tx: action.tx,
    agentId: action.agentId,
    policyId: action.policyId,
    simulation: { success: true },
    checks: {
      targetAllowed: allowed,
      selectorAllowed: true,
      valueWithinLimit: true,
      slippageWithinLimit: true,
      policyActive: true,
    },
  };
}
