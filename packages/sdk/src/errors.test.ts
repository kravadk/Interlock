import { describe, expect, it } from "vitest";
import {
  actionableError,
  assertAllowed,
  ActionBlockedError,
  AgentRegistrationFailedError,
  PolicyCreationFailedError,
  PolicyUpdateFailedError,
  WalletClientRequiredError,
} from "./errors.js";
import type { FirewallDecision } from "./types.js";

const blockedDecision: FirewallDecision = {
  allowed: false,
  decision: "BLOCK",
  reasonCode: "TARGET_NOT_ALLOWED",
  riskScore: 90,
  simulationHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  calldataHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  selector: "0x12345678",
  explanation: "Target contract is not allowlisted.",
  tx: { to: "0xe4dfef03e107225f2239cfff955a378a9a8158be", value: 0n, data: "0x" },
  agentId: 1n,
  policyId: 1n,
  simulation: { success: true },
  checks: { targetAllowed: false, selectorAllowed: true, valueWithinLimit: true, slippageWithinLimit: true, policyActive: true },
};

describe("SDK errors", () => {
  it("throws a typed ActionBlockedError for blocked decisions", () => {
    expect(() => assertAllowed(blockedDecision)).toThrow(ActionBlockedError);
  });

  it("formats missing wallet client errors", () => {
    const error = new WalletClientRequiredError("createPolicy");
    expect(error.code).toBe("WALLET_CLIENT_REQUIRED");
    expect(error.message).toContain("createPolicy");
    expect(error.action).toContain("Pass a privateKey");
  });

  it("wraps write failures with stable codes", () => {
    expect(new AgentRegistrationFailedError(new Error("rpc failed")).code).toBe("AGENT_REGISTRATION_FAILED");
    expect(new PolicyCreationFailedError(new Error("rpc failed")).code).toBe("POLICY_CREATION_FAILED");
    expect(new PolicyUpdateFailedError(new Error("rpc failed")).code).toBe("POLICY_UPDATE_FAILED");
  });

  it("formats actionable errors for REST/API responses", () => {
    const formatted = actionableError(new WalletClientRequiredError("recordDecision"));
    expect(formatted).toEqual({
      code: "WALLET_CLIENT_REQUIRED",
      message: "recordDecision requires a privateKey or account in InterlockFirewall config.",
      action: "Pass a privateKey, account, or walletClient for write methods. Use read-only methods without a wallet.",
    });
  });
});
