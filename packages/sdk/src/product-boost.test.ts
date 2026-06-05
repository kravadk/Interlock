import { describe, expect, it } from "vitest";
import { maxUint256, parseEther } from "viem";
import { deployedAddresses } from "@interlock/shared";
import { generatePolicyPackFromAbi } from "./abi-policy-builder.js";
import { checkActionBundle, summarizeBundleRisk } from "./action-bundle.js";
import { buildErc8004AgentManifest } from "./erc8004.js";
import { buildRwaRiskEvidence, hashRwaRiskEvidence, rwaRiskToReasonCode } from "./rwa-guard.js";
import { decodeErc20Action, erc20ApproveCalldata, erc20TransferCalldata, evaluateTokenRules } from "./token-guard.js";
import type { FirewallDecision } from "./types.js";

const agentRegistry = deployedAddresses.mantleSepolia.agentRegistry;
const policyRegistry = deployedAddresses.mantleSepolia.policyRegistry;
const token = "0x1111111111111111111111111111111111111111" as const;
const recipient = "0x2222222222222222222222222222222222222222" as const;
const spender = "0x3333333333333333333333333333333333333333" as const;

describe("product boost SDK helpers", () => {
  it("decodes ERC20 transfer and blocks recipients outside the token rule", () => {
    const calldata = erc20TransferCalldata({ to: recipient, amount: 11n });

    expect(decodeErc20Action(calldata)).toMatchObject({ kind: "transfer", recipient, amount: 11n });
    expect(evaluateTokenRules({ token, calldata, rules: [{ token, allowedRecipients: [recipient], maxAmount: "12" }] })).toMatchObject({
      ok: true,
      reasonCode: "TOKEN_RULE_PASSED",
    });
    expect(evaluateTokenRules({ token, calldata, rules: [{ token, allowedRecipients: [spender], maxAmount: "12" }] })).toMatchObject({
      ok: false,
      reasonCode: "TOKEN_RECIPIENT_NOT_ALLOWED",
    });
  });

  it("blocks unlimited approve unless the token rule explicitly allows it", () => {
    const calldata = erc20ApproveCalldata({ spender, amount: maxUint256 });

    expect(decodeErc20Action(calldata)).toMatchObject({ kind: "approve", spender, amount: maxUint256 });
    expect(evaluateTokenRules({ token, calldata, rules: [{ token, allowedSpenders: [spender] }] })).toMatchObject({
      ok: false,
      reasonCode: "UNLIMITED_APPROVE_BLOCKED",
    });
    expect(evaluateTokenRules({ token, calldata, rules: [{ token, allowedSpenders: [spender], allowUnlimitedApprove: true }] })).toMatchObject({
      ok: true,
      reasonCode: "TOKEN_RULE_PASSED",
    });
  });

  it("summarizes bundle risk and blocks the bundle when one action blocks", async () => {
    const allow = decision({ reasonCode: "POLICY_PASSED", decision: "ALLOW", allowed: true, riskScore: 5 });
    const block = decision({ reasonCode: "TARGET_NOT_ALLOWED", decision: "BLOCK", allowed: false, riskScore: 90 });
    const firewall = {
      checkAction: async (action: { tx: { to: string } }) => (action.tx.to === agentRegistry ? allow : block),
    };

    const report = await checkActionBundle(firewall as never, {
      agentId: 1n,
      policyId: 1n,
      intent: "Review multi-step route",
      actions: [
        { agentId: 1n, policyId: 1n, tx: { to: agentRegistry, value: 0n, data: "0x" } },
        { agentId: 1n, policyId: 1n, tx: { to: policyRegistry, value: 0n, data: "0x" } },
      ],
    });

    expect(report.allowed).toBe(false);
    expect(report.reasonCode).toBe("TARGET_NOT_ALLOWED");
    expect(report.actionCount).toBe(2);
    expect(summarizeBundleRisk(report)).toContain("blocked");
  });

  it("generates a template policy pack from a real ABI", () => {
    const pack = generatePolicyPackFromAbi({
      address: agentRegistry,
      abi: [
        {
          type: "function",
          name: "getAgent",
          stateMutability: "view",
          inputs: [{ name: "agentId", type: "uint256" }],
          outputs: [],
        },
      ],
      includeViewFunctions: true,
    });

    expect(pack.mode).toBe("template");
    expect(pack.source).toBe("abi");
    expect(pack.targets[0]?.address.toLowerCase()).toBe(agentRegistry.toLowerCase());
    expect(pack.generatedSelectors[0]?.name).toBe("getAgent");
    expect(pack.generatedSelectors[0]?.selector).toMatch(/^0x[0-9a-f]{8}$/);
  });

  it("builds RWA risk evidence and stable evidence hash", () => {
    const evidence = buildRwaRiskEvidence({
      guard: { maxExposureBpsPerAsset: 9000 },
      portfolio: {
        totalValue: parseEther("10"),
        positions: [{ asset: token, value: parseEther("1") }],
        proposed: { asset: token, addValue: parseEther("1") },
      },
      yieldData: {
        source: "defillama",
        project: "mantle-yield",
        chain: "Mantle",
        poolId: "pool-1",
        symbol: "mETH",
        tvlUsd: 100_000,
        apy: 45,
        fetchedAt: new Date().toISOString(),
      },
      thresholds: { minTvlUsd: 500_000, maxApy: 30 },
    });

    expect(evidence.ok).toBe(false);
    expect(rwaRiskToReasonCode(evidence)).toBe("RWA_TVL_TOO_LOW");
    expect(hashRwaRiskEvidence(evidence)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("builds ERC-8004 manifest without requiring a registry address", () => {
    const manifest = buildErc8004AgentManifest({
      interlockAgentId: "7",
      name: "Interlock Guarded Agent",
      description: "Agent linked to Interlock safety evidence.",
      services: [{ type: "mcp", url: "https://example.com/mcp", description: "MCP endpoint" }],
    });

    expect(manifest.interlockAgentId).toBe("7");
    expect(manifest.services[0]?.type).toBe("mcp");
  });
});

function decision(input: {
  allowed: boolean;
  decision: "ALLOW" | "BLOCK";
  reasonCode: FirewallDecision["reasonCode"];
  riskScore: number;
}): FirewallDecision {
  return {
    allowed: input.allowed,
    decision: input.decision,
    reasonCode: input.reasonCode,
    reason: input.reasonCode,
    riskScore: input.riskScore,
    explanation: input.reasonCode,
    agentId: 1n,
    policyId: 1n,
    tx: { to: agentRegistry, value: 0n, data: "0x" },
    selector: "0x00000000",
    calldataHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
    simulationHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
    simulation: { success: input.allowed },
    checks: {},
  };
}
