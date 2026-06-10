import { describe, expect, it, vi } from "vitest";
import { ActionBlockedError } from "./errors.js";
import { InterlockFirewall } from "./firewall.js";
import type { AgentAction, FirewallDecision } from "./types.js";

const hash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as const;
const txHash = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as const;
const action: AgentAction = { agentId: 1n, policyId: 2n, tx: { to: "0xe4dfef03e107225f2239cfff955a378a9a8158be", value: 0n, data: "0x" } };
const decision: FirewallDecision = {
  allowed: true,
  decision: "ALLOW",
  reasonCode: "POLICY_PASSED",
  riskScore: 8,
  simulationHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  calldataHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  selector: "0x12345678",
  explanation: "ok",
  tx: action.tx,
  agentId: 1n,
  policyId: 2n,
  simulation: { success: true },
  checks: { targetAllowed: true, selectorAllowed: true, valueWithinLimit: true, slippageWithinLimit: true, policyActive: true },
};

describe("guardedSendTransaction", () => {
  it("records and sends an allowed action", async () => {
    const firewall = Object.create(InterlockFirewall.prototype) as InterlockFirewall;
    const calls: string[] = [];
    firewall.checkAction = vi.fn(async () => decision);
    firewall.recordDecision = vi.fn(async () => {
      calls.push("record");
      return hash;
    });
    (firewall as any).requireWalletClient = () => ({
      account: { address: action.tx.to },
      sendTransaction: vi.fn(async () => {
        calls.push("send");
        return txHash;
      }),
    });
    (firewall as any).publicClient = { waitForTransactionReceipt: vi.fn(async () => ({ status: "success" })) };
    const result = await firewall.guardedSendTransaction(action);
    expect(result.sent).toBe(true);
    expect(calls).toEqual(["send", "record"]);
  });

  it("can record an allowed action before sending when explicitly requested", async () => {
    const firewall = Object.create(InterlockFirewall.prototype) as InterlockFirewall;
    const calls: string[] = [];
    firewall.checkAction = vi.fn(async () => decision);
    firewall.recordDecision = vi.fn(async () => {
      calls.push("record");
      return hash;
    });
    (firewall as any).requireWalletClient = () => ({
      account: { address: action.tx.to },
      sendTransaction: vi.fn(async () => {
        calls.push("send");
        return txHash;
      }),
    });
    (firewall as any).publicClient = { waitForTransactionReceipt: vi.fn(async () => ({ status: "success" })) };
    const result = await firewall.guardedSendTransaction(action, { recordTiming: "before-send" });
    expect(result.sent).toBe(true);
    expect(calls).toEqual(["record", "send"]);
  });

  it("records and throws for a blocked action by default", async () => {
    const firewall = Object.create(InterlockFirewall.prototype) as InterlockFirewall;
    const blockedDecision: FirewallDecision = { ...decision, allowed: false, decision: "BLOCK", reasonCode: "TARGET_NOT_ALLOWED" };
    firewall.checkAction = vi.fn(async () => blockedDecision);
    firewall.recordDecision = vi.fn(async () => hash);
    await expect(firewall.guardedSendTransaction(action)).rejects.toThrow(ActionBlockedError);
  });

  it("can return blocked result without throwing", async () => {
    const firewall = Object.create(InterlockFirewall.prototype) as InterlockFirewall;
    const blockedDecision: FirewallDecision = { ...decision, allowed: false, decision: "BLOCK", reasonCode: "TARGET_NOT_ALLOWED" };
    firewall.checkAction = vi.fn(async () => blockedDecision);
    firewall.recordDecision = vi.fn(async () => hash);
    await expect(firewall.guardedSendTransaction(action, { throwOnBlock: false })).resolves.toMatchObject({ sent: false });
  });
});
