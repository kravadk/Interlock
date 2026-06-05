import { describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";
import { InterlockFirewall } from "./firewall.js";
import type { AgentAction, FirewallDecision } from "./types.js";

const txHash = `0x${"a".repeat(64)}` as Hex;
const attestationHash = `0x${"b".repeat(64)}` as Hex;

const action: AgentAction = {
  agentId: 1n,
  policyId: 2n,
  tx: {
    to: "0x0000000000000000000000000000000000000001" as Address,
    value: 0n,
    data: "0x",
  },
};

const allowedDecision = decision({ allowed: true, decision: "ALLOW", reasonCode: "POLICY_PASSED" });
const blockedDecision = decision({ allowed: false, decision: "BLOCK", reasonCode: "TARGET_NOT_ALLOWED" });

describe("runGatewayAction", () => {
  it("dry-runs without recording or sending", async () => {
    const firewall = stubFirewall(allowedDecision);

    const result = await firewall.runGatewayAction(action);

    expect(result).toMatchObject({ mode: "dry-run", status: "allowed", sent: false, recorded: false });
    expect(firewall.checkAction).toHaveBeenCalledWith(action);
    expect(firewall.recordDecision).not.toHaveBeenCalled();
  });

  it("records without sending in record-only mode", async () => {
    const firewall = stubFirewall(blockedDecision);

    const result = await firewall.runGatewayAction(action, { mode: "record-only" });

    expect(result).toMatchObject({ mode: "record-only", status: "recorded", sent: false, recorded: true, attestationHash });
    expect(result.alert).toMatchObject({ event: "action.blocked", reasonCode: "TARGET_NOT_ALLOWED" });
    expect(firewall.recordDecision).toHaveBeenCalledWith(blockedDecision);
  });

  it("delegates execute-if-allowed to guardedSendTransaction", async () => {
    const firewall = stubFirewall(allowedDecision);
    firewall.guardedSendTransaction = vi.fn(async () => ({
      decision: allowedDecision,
      sent: true,
      transactionHash: txHash,
      attestationHash,
    }));

    const result = await firewall.runGatewayAction(action, { mode: "execute-if-allowed" });

    expect(result).toMatchObject({ mode: "execute-if-allowed", status: "executed", sent: true, recorded: true, transactionHash: txHash });
    expect(firewall.guardedSendTransaction).toHaveBeenCalledWith(action, {
      recordDecision: true,
      recordTiming: undefined,
      throwOnBlock: false,
    });
  });

  it("returns an alert payload in block-and-alert mode without recording by default", async () => {
    const firewall = stubFirewall(blockedDecision);

    const result = await firewall.runGatewayAction(action, { mode: "block-and-alert" });

    expect(result).toMatchObject({ mode: "block-and-alert", status: "alert", sent: false, recorded: false });
    expect(result.alert).toMatchObject({ event: "action.blocked", reasonCode: "TARGET_NOT_ALLOWED" });
    expect(firewall.recordDecision).not.toHaveBeenCalled();
  });
});

function stubFirewall(result: FirewallDecision) {
  const firewall = Object.create(InterlockFirewall.prototype) as InterlockFirewall;
  firewall.checkAction = vi.fn(async () => result);
  firewall.recordDecision = vi.fn(async () => attestationHash);
  return firewall;
}

function decision(input: Pick<FirewallDecision, "allowed" | "decision" | "reasonCode">): FirewallDecision {
  return {
    ...input,
    agentId: action.agentId,
    policyId: action.policyId,
    riskScore: input.allowed ? 5 : 90,
    simulationHash: `0x${"1".repeat(64)}` as Hex,
    calldataHash: `0x${"2".repeat(64)}` as Hex,
    selector: "0x00000000",
    explanation: input.allowed ? "Allowed by policy." : "Blocked by policy.",
    tx: action.tx,
    simulation: { success: input.allowed },
    checks: {
      targetAllowed: input.allowed,
      selectorAllowed: true,
      valueWithinLimit: true,
      slippageWithinLimit: true,
      policyActive: true,
    },
  };
}
