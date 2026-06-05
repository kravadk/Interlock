import { getAddress } from "viem";
import { describe, expect, it, vi } from "vitest";
import { deployedAddresses, mantleSepolia } from "@interlock/shared";
import { createByrealGatewayAdapter, normalizeByrealSkillAction } from "./byreal-adapter.js";
import type { GatewayActionResult } from "./types.js";

describe("Byreal / RealClaw adapter", () => {
  it("normalizes a Byreal-compatible skill action into an AgentAction", () => {
    const action = normalizeByrealSkillAction({
      source: "realclaw",
      skillId: "openclaw.mantle.read-agent",
      strategy: "SteadyClaw",
      chainId: mantleSepolia.id,
      agentId: "1",
      policyId: 2n,
      to: deployedAddresses.mantleSepolia.agentRegistry,
      valueWei: "0",
      data: "0x1234",
      expectedSlippageBps: 0,
    });

    expect(action.agentId).toBe(1n);
    expect(action.policyId).toBe(2n);
    expect(action.tx.to).toBe(getAddress(deployedAddresses.mantleSepolia.agentRegistry));
    expect(action.tx.value).toBe(0n);
    expect(action.tx.data).toBe("0x1234");
    expect(action.metadata?.route).toBe("byreal:openclaw.mantle.read-agent");
    expect(action.metadata?.intent).toContain("SteadyClaw");
  });

  it("rejects wrong chain, invalid ids, invalid calldata, and invalid slippage before RPC", () => {
    const base = {
      agentId: "1",
      policyId: "1",
      to: deployedAddresses.mantleSepolia.agentRegistry,
      valueWei: "0",
      data: "0x",
    };

    expect(() => normalizeByrealSkillAction({ ...base, chainId: 1 })).toThrow(/chainId/);
    expect(() => normalizeByrealSkillAction({ ...base, agentId: "0" })).toThrow(/agentId/);
    expect(() => normalizeByrealSkillAction({ ...base, data: "0x0" })).toThrow(/calldata/);
    expect(() => normalizeByrealSkillAction({ ...base, expectedSlippageBps: 10001 })).toThrow(/expectedSlippageBps/);
  });

  it("runs the normalized action through the gateway", async () => {
    const gatewayResult: GatewayActionResult = {
      mode: "dry-run",
      status: "allowed",
      decision: {
        allowed: true,
        decision: "ALLOW",
        reasonCode: "POLICY_PASSED",
        riskScore: 0,
        simulationHash: "0x00",
        calldataHash: "0x00",
        selector: "0x00000000",
        explanation: "ok",
        tx: { to: deployedAddresses.mantleSepolia.agentRegistry, value: 0n, data: "0x" },
        agentId: 1n,
        policyId: 1n,
        simulation: { success: true },
        checks: {
          targetAllowed: true,
          selectorAllowed: true,
          valueWithinLimit: true,
          slippageWithinLimit: true,
          policyActive: true,
        },
      },
      sent: false,
      recorded: false,
      nextAction: "continue",
    };
    const runGatewayAction = vi.fn(async () => gatewayResult);
    const adapter = createByrealGatewayAdapter({ runGatewayAction });

    const result = await adapter.run({
      agentId: "1",
      policyId: "1",
      to: deployedAddresses.mantleSepolia.agentRegistry,
    });

    expect(result).toBe(gatewayResult);
    expect(runGatewayAction).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: 1n, policyId: 1n }),
      undefined,
    );
  });
});
