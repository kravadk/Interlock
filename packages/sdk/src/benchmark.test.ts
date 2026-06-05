import { describe, expect, it } from "vitest";
import { zeroAddress } from "viem";
import { createDefaultBenchmarkScenarios, defaultBenchmarkSafeSelector, runInterlockBenchmark } from "./benchmark.js";
import type { FirewallDecision } from "./types.js";

const contracts = {
  agentRegistry: "0x1111111111111111111111111111111111111111" as const,
  policyRegistry: "0x2222222222222222222222222222222222222222" as const,
  actionAttestation: "0x3333333333333333333333333333333333333333" as const,
};

describe("benchmark scenarios", () => {
  it("builds safe and risky scenarios from real configured contract addresses", () => {
    const scenarios = createDefaultBenchmarkScenarios({
      agentId: 1n,
      policyId: 2n,
      contracts,
      policyMaxNativeValue: 10n,
      policyMaxSlippageBps: 100,
    });

    expect(scenarios.map((scenario) => scenario.id)).toEqual([
      "safe-agent-read",
      "unknown-target-attack",
      "overspend-attempt",
      "high-slippage-attempt",
      "unapproved-approve-selector",
      "incomplete-calldata-simulation-fail",
      "empty-calldata-selector-check",
    ]);
    expect(scenarios[0]?.action.tx.to).toBe(contracts.agentRegistry);
    expect(scenarios[0]?.action.tx.data.startsWith(defaultBenchmarkSafeSelector)).toBe(true);
    expect(scenarios[1]?.action.tx.to).toBe(contracts.actionAttestation);
    expect(scenarios[1]?.action.tx.to).not.toBe(zeroAddress);
    expect(scenarios[2]?.action.tx.value).toBe(11n);
    expect(scenarios[3]?.expectedReasonCode).toBe("SLIPPAGE_LIMIT_EXCEEDED");
    expect(scenarios[4]?.expectedReasonCode).toBe("UNKNOWN_SELECTOR");
    expect(scenarios[4]?.action.tx.data).toBe("0x095ea7b3");
    expect(scenarios[5]?.expectedReasonCode).toBe("SIMULATION_FAILED");
    expect(scenarios[5]?.action.tx.data).toBe(defaultBenchmarkSafeSelector);
    expect(scenarios[6]?.expectedReasonCode).toBe("UNKNOWN_SELECTOR");
    expect(scenarios[6]?.action.tx.data).toBe("0x");
    expect(scenarios.every((scenario) => scenario.trackFit.length > 0)).toBe(true);
    expect(scenarios.every((scenario) => scenario.ecosystemFit.length > 0)).toBe(true);
    expect(scenarios.every((scenario) => scenario.remediation.length > 20)).toBe(true);
  });

  it("keeps high slippage as an allow boundary when policy already allows 10000 bps", () => {
    const scenarios = createDefaultBenchmarkScenarios({
      agentId: 1n,
      policyId: 2n,
      contracts,
      policyMaxNativeValue: 10n,
      policyMaxSlippageBps: 10_000,
    });

    const highSlippage = scenarios.find((scenario) => scenario.id === "high-slippage-attempt");
    expect(highSlippage?.expectedDecision).toBe("ALLOW");
    expect(highSlippage?.expectedReasonCode).toBe("POLICY_PASSED");
  });

  it("returns a v2 benchmark report with coverage and actionable remediation", async () => {
    const report = await runInterlockBenchmark({
      firewall: {
        getPolicy: async () => ({
          owner: contracts.agentRegistry,
          agentId: 1n,
          maxNativeValue: 10n,
          maxSlippageBps: 100,
          active: true,
        }),
        checkAction: async (action) => decisionFor(action),
      } as never,
      agentId: 1n,
      policyId: 2n,
      contracts,
    });

    expect(report.version).toBe("v2");
    expect(report.total).toBe(7);
    expect(report.passed).toBe(7);
    expect(report.score).toBe(100);
    expect(report.coverage.categories).toContain("simulation-risk");
    expect(report.coverage.tracks).toContain("AI DevTools");
    expect(report.coverage.reasons).toContain("SIMULATION_FAILED");
    expect(report.summary.safePathPassed).toBe(true);
    expect(report.summary.protectiveBlocksPassed).toBe(6);
    expect(report.summary.failedScenarios).toEqual([]);
    expect(report.summary.recommendations).toEqual(["All default benchmark scenarios matched expected firewall behavior."]);
    expect(report.runs.every((run) => run.matchedDecision && run.matchedReasonCode)).toBe(true);
  });
});

function decisionFor(action: { tx: { to: `0x${string}`; data: `0x${string}`; value: bigint }; metadata?: { expectedSlippageBps?: number } }): FirewallDecision {
  const { to, data, value } = action.tx;
  if (to === contracts.actionAttestation) {
    return makeDecision("BLOCK", "TARGET_NOT_ALLOWED", false, data, value);
  }
  if (data === "0x095ea7b3" || data === "0x") {
    return makeDecision("BLOCK", "UNKNOWN_SELECTOR", false, data, value);
  }
  if (data === defaultBenchmarkSafeSelector) {
    return makeDecision("BLOCK", "SIMULATION_FAILED", false, data, value);
  }
  if (value === 11n) {
    return makeDecision("BLOCK", "VALUE_LIMIT_EXCEEDED", false, data, value);
  }
  if ((action.metadata?.expectedSlippageBps ?? 0) > 100) {
    return makeDecision("BLOCK", "SLIPPAGE_LIMIT_EXCEEDED", false, data, value);
  }
  return makeDecision("ALLOW", "POLICY_PASSED", true, data, value);
}

function makeDecision(
  decision: FirewallDecision["decision"],
  reasonCode: FirewallDecision["reasonCode"],
  allowed: boolean,
  data: `0x${string}`,
  value: bigint,
): FirewallDecision {
  return {
    allowed,
    decision,
    reasonCode,
    riskScore: allowed ? 8 : 80,
    simulationHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
    calldataHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
    selector: data.length >= 10 ? (data.slice(0, 10) as `0x${string}`) : "0x00000000",
    explanation: reasonCode,
    tx: { to: contracts.agentRegistry, value, data },
    agentId: 1n,
    policyId: 2n,
    simulation: { success: allowed },
    checks: {
      targetAllowed: true,
      selectorAllowed: reasonCode !== "UNKNOWN_SELECTOR",
      valueWithinLimit: reasonCode !== "VALUE_LIMIT_EXCEEDED",
      slippageWithinLimit: reasonCode !== "SLIPPAGE_LIMIT_EXCEEDED",
      policyActive: true,
    },
  };
}
