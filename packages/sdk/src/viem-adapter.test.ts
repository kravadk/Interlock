import { describe, expect, it, vi } from "vitest";
import { ActionBlockedError } from "./errors.js";
import { createGuardedViemWallet, decisionToAgentToolResult } from "./viem-adapter.js";
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
  tx: { to: "0xe4dfef03e107225f2239cfff955a378a9a8158be", value: 0n, data: "0x" },
  agentId: 1n,
  policyId: 2n,
  simulation: { success: true },
  checks: { targetAllowed: true, selectorAllowed: true, valueWithinLimit: true, slippageWithinLimit: true, policyActive: true },
};

describe("viem adapter", () => {
  it("returns compact JSON-safe decisions", () => {
    expect(decisionToAgentToolResult(decision)).toMatchObject({ allowed: true, selector: "0x12345678" });
  });

  it("checks, records, and sends allowed transactions", async () => {
    const firewall = {
      chain: { id: 5003 },
      checkAction: vi.fn(async () => decision),
      recordDecisionWithWalletClient: vi.fn(async () => "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    } as unknown as InterlockFirewall;
    const walletClient = { account: { address: decision.tx.to }, sendTransaction: vi.fn(async () => "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb") } as any;
    const guarded = createGuardedViemWallet({ firewall, walletClient, agentId: 1n, policyId: 2n });
    const result = await guarded.sendTransaction({ to: decision.tx.to, data: "0x" });
    expect(result.sent).toBe(true);
    expect(walletClient.sendTransaction).toHaveBeenCalledOnce();
  });

  it("throws blocked decisions by default", async () => {
    const blocked = { ...decision, allowed: false, decision: "BLOCK" as const, reasonCode: "TARGET_NOT_ALLOWED" as const };
    const firewall = { chain: { id: 5003 }, checkAction: vi.fn(async () => blocked), recordDecisionWithWalletClient: vi.fn() } as unknown as InterlockFirewall;
    const walletClient = { account: { address: decision.tx.to }, sendTransaction: vi.fn() } as any;
    const guarded = createGuardedViemWallet({ firewall, walletClient, agentId: 1n, policyId: 2n, recordDecision: false });
    await expect(guarded.sendTransaction({ to: decision.tx.to })).rejects.toThrow(ActionBlockedError);
  });

  it("can return blocked result without throwing", async () => {
    const blocked = { ...decision, allowed: false, decision: "BLOCK" as const, reasonCode: "TARGET_NOT_ALLOWED" as const };
    const firewall = { chain: { id: 5003 }, checkAction: vi.fn(async () => blocked), recordDecisionWithWalletClient: vi.fn() } as unknown as InterlockFirewall;
    const walletClient = { account: { address: decision.tx.to }, sendTransaction: vi.fn() } as any;
    const guarded = createGuardedViemWallet({ firewall, walletClient, agentId: 1n, policyId: 2n, throwOnBlock: false, recordDecision: false });
    await expect(guarded.sendTransaction({ to: decision.tx.to })).resolves.toMatchObject({ sent: false });
  });
});
