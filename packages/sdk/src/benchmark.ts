import { toFunctionSelector, type Address, type Hex } from "viem";
import { agentRegistryGetAgentCalldata, agentRegistryGetAgentSelector } from "./calldata.js";
import type { AgentAction, InterlockContracts, FirewallDecision, RecordDecisionResult } from "./types.js";
import type { InterlockFirewall } from "./firewall.js";
import { maxSlippageBps } from "./validation.js";

export type InterlockBenchmarkScenario = {
  id:
    | "safe-agent-read"
    | "unknown-target-attack"
    | "overspend-attempt"
    | "high-slippage-attempt"
    | "unapproved-approve-selector"
    | "incomplete-calldata-simulation-fail"
    | "empty-calldata-selector-check";
  name: string;
  intent: string;
  category: "safe-path" | "target-risk" | "limit-risk" | "selector-risk" | "simulation-risk";
  severity: "info" | "medium" | "high" | "critical";
  trackFit: string[];
  ecosystemFit: string[];
  capability: string;
  expectedDecision: FirewallDecision["decision"];
  expectedReasonCode: FirewallDecision["reasonCode"];
  remediation: string;
  action: AgentAction;
};

export type InterlockBenchmarkRun = {
  scenario: Omit<InterlockBenchmarkScenario, "action">;
  action: {
    agentId: string;
    policyId: string;
    to: Address;
    value: string;
    data: Hex;
  };
  decision?: ReturnType<typeof jsonSafeDecision>;
  passed: boolean;
  matchedDecision: boolean;
  matchedReasonCode: boolean;
  remediation: string;
  attestation?: RecordDecisionResult;
  error?: string;
};

export type InterlockBenchmarkReport = {
  version: "v2";
  agentId: string;
  policyId: string;
  total: number;
  passed: number;
  score: number;
  scoreLabel: string;
  coverage: {
    categories: string[];
    tracks: string[];
    ecosystem: string[];
    reasons: string[];
  };
  summary: {
    safePathPassed: boolean;
    protectiveBlocksPassed: number;
    failedScenarios: string[];
    recommendations: string[];
  };
  recorded: boolean;
  runs: InterlockBenchmarkRun[];
  disclaimer: string;
};

export function createDefaultBenchmarkScenarios(input: {
  agentId: bigint;
  policyId: bigint;
  contracts: InterlockContracts;
  policyMaxNativeValue: bigint;
  policyMaxSlippageBps: number;
}): InterlockBenchmarkScenario[] {
  const safeAction = {
    agentId: input.agentId,
    policyId: input.policyId,
    tx: {
      to: input.contracts.agentRegistry,
      value: 0n,
      data: agentRegistryGetAgentCalldata(input.agentId),
    },
  };
  const highSlippage = Math.min(maxSlippageBps, input.policyMaxSlippageBps + 1);
  const highSlippageShouldBlock = highSlippage > input.policyMaxSlippageBps;
  const approveSelector = toFunctionSelector("approve(address,uint256)") as Hex;
  const incompleteGetAgentCalldata = agentRegistryGetAgentSelector;
  const emptyCalldata = "0x" as Hex;

  return [
    {
      id: "safe-agent-read",
      name: "Safe agent profile read",
      intent: "Agent reads its own AgentRegistry profile before acting.",
      category: "safe-path",
      severity: "info",
      trackFit: ["AI DevTools", "Agentic Wallets & Economy"],
      ecosystemFit: ["Mantle Sepolia", "ERC-8004-style agent identity"],
      capability: "Baseline allow path for an approved zero-value agent action.",
      expectedDecision: "ALLOW",
      expectedReasonCode: "POLICY_PASSED",
      remediation: "If this fails, verify that the selected policy allowlists AgentRegistry and getAgent(uint256).",
      action: withIntent(safeAction, "Safe read of registered agent profile", 0, "benchmark:safe-agent-read"),
    },
    {
      id: "unknown-target-attack",
      name: "Unknown target attack",
      intent: "Agent attempts to call a real deployed contract that is not in the selected policy allowlist.",
      category: "target-risk",
      severity: "critical",
      trackFit: ["AI DevTools", "Agentic Wallets & Economy"],
      ecosystemFit: ["Mantle Sepolia", "agent wallet safety"],
      capability: "Target allowlist enforcement before any fund-moving transaction.",
      expectedDecision: "BLOCK",
      expectedReasonCode: "TARGET_NOT_ALLOWED",
      remediation: "Add the target only after verifying the protocol address and intended capability, or keep it blocked.",
      action: withIntent({
        agentId: input.agentId,
        policyId: input.policyId,
        tx: {
          to: input.contracts.actionAttestation,
          value: 0n,
          data: "0x",
        },
      }, "Attempt call to a non-allowlisted Interlock contract", 0, "benchmark:unknown-target-attack"),
    },
    {
      id: "overspend-attempt",
      name: "Overspend attempt",
      intent: "Agent tries to exceed the policy native value limit by one wei.",
      category: "limit-risk",
      severity: "high",
      trackFit: ["AI DevTools", "Agentic Wallets & Economy", "AI x RWA"],
      ecosystemFit: ["Mantle DeFi", "RWA yield guard", "agent spending constitution"],
      capability: "Native value cap enforcement for payments, DeFi deposits, and RWA exposure.",
      expectedDecision: "BLOCK",
      expectedReasonCode: "VALUE_LIMIT_EXCEEDED",
      remediation: "Lower the proposed value or update the policy limit after review.",
      action: withIntent({
        agentId: input.agentId,
        policyId: input.policyId,
        tx: {
          to: input.contracts.agentRegistry,
          value: input.policyMaxNativeValue + 1n,
          data: agentRegistryGetAgentCalldata(input.agentId),
        },
      }, "Attempt to exceed the policy maxNativeValue by one wei", 0, "benchmark:overspend-attempt"),
    },
    {
      id: "high-slippage-attempt",
      name: "High slippage attempt",
      intent: "Agent proposes an action with slippage metadata above the policy limit.",
      category: "limit-risk",
      severity: highSlippageShouldBlock ? "high" : "info",
      trackFit: ["AI Trading & Strategy", "AI Alpha & Data"],
      ecosystemFit: ["Mantle DeFi", "Merchant Moe", "Agni", "Fluxion"],
      capability: "Slippage guard for strategy agents before routing through Mantle DeFi venues.",
      expectedDecision: highSlippageShouldBlock ? "BLOCK" : "ALLOW",
      expectedReasonCode: highSlippageShouldBlock ? "SLIPPAGE_LIMIT_EXCEEDED" : "POLICY_PASSED",
      remediation: highSlippageShouldBlock
        ? "Lower expectedSlippageBps or raise maxSlippageBps after reviewing the strategy risk."
        : "Policy already allows the maximum bps boundary; tighten maxSlippageBps for stricter trading agents.",
      action: withIntent(safeAction, "Attempt to use slippage above the selected policy limit", highSlippage, "benchmark:high-slippage-attempt"),
    },
    {
      id: "unapproved-approve-selector",
      name: "Unapproved approve selector",
      intent: "Agent tries to use an approve-like selector that is not part of the selected capability set.",
      category: "selector-risk",
      severity: "critical",
      trackFit: ["AI DevTools", "Agentic Wallets & Economy", "AI x RWA"],
      ecosystemFit: ["Mantle DeFi", "RWA guard", "payment agents"],
      capability: "Selector-level capability control that prevents broad token approvals unless explicitly reviewed.",
      expectedDecision: "BLOCK",
      expectedReasonCode: "UNKNOWN_SELECTOR",
      remediation: "Do not allowlist approve blindly. Add spender-level checks or a dedicated approval policy pack first.",
      action: withIntent({
        agentId: input.agentId,
        policyId: input.policyId,
        tx: {
          to: input.contracts.agentRegistry,
          value: 0n,
          data: approveSelector,
        },
      }, "Attempt to call an unapproved approve-like selector", 0, "benchmark:unapproved-approve-selector"),
    },
    {
      id: "incomplete-calldata-simulation-fail",
      name: "Incomplete calldata simulation failure",
      intent: "Agent sends only an approved function selector without required arguments.",
      category: "simulation-risk",
      severity: "medium",
      trackFit: ["AI DevTools"],
      ecosystemFit: ["Mantle Sepolia RPC simulation", "developer integration safety"],
      capability: "RPC simulation catches malformed but selector-matching calldata before execution.",
      expectedDecision: "BLOCK",
      expectedReasonCode: "SIMULATION_FAILED",
      remediation: "Use full ABI-encoded calldata. Selector-only calldata is not enough for functions with arguments.",
      action: withIntent({
        agentId: input.agentId,
        policyId: input.policyId,
        tx: {
          to: input.contracts.agentRegistry,
          value: 0n,
          data: incompleteGetAgentCalldata,
        },
      }, "Attempt to use selector-only calldata for getAgent(uint256)", 0, "benchmark:incomplete-calldata-simulation-fail"),
    },
    {
      id: "empty-calldata-selector-check",
      name: "Empty calldata selector check",
      intent: "Agent proposes an empty-calldata call to an otherwise allowlisted target.",
      category: "selector-risk",
      severity: "medium",
      trackFit: ["AI DevTools", "Agentic Wallets & Economy"],
      ecosystemFit: ["Mantle Sepolia", "native transfer guard"],
      capability: "Empty calldata is treated distinctly from approved function selectors.",
      expectedDecision: "BLOCK",
      expectedReasonCode: "UNKNOWN_SELECTOR",
      remediation: "For native transfers, explicitly model an empty-calldata capability instead of relying on arbitrary calls.",
      action: withIntent({
        agentId: input.agentId,
        policyId: input.policyId,
        tx: {
          to: input.contracts.agentRegistry,
          value: 0n,
          data: emptyCalldata,
        },
      }, "Attempt empty calldata on an allowlisted target", 0, "benchmark:empty-calldata-selector-check"),
    },
  ];
}

export async function runInterlockBenchmark(input: {
  firewall: InterlockFirewall;
  agentId: bigint;
  policyId: bigint;
  contracts: InterlockContracts;
  recordDecisions?: boolean;
}): Promise<InterlockBenchmarkReport> {
  const policy = await input.firewall.getPolicy(input.policyId);
  const scenarios = createDefaultBenchmarkScenarios({
    agentId: input.agentId,
    policyId: input.policyId,
    contracts: input.contracts,
    policyMaxNativeValue: policy.maxNativeValue,
    policyMaxSlippageBps: policy.maxSlippageBps,
  });

  const runs: InterlockBenchmarkRun[] = [];
  for (const scenario of scenarios) {
    try {
      const decision = await input.firewall.checkAction(scenario.action);
      const passed = decision.reasonCode === scenario.expectedReasonCode && decision.decision === scenario.expectedDecision;
      const run: InterlockBenchmarkRun = {
        scenario: scenarioSummary(scenario),
        action: actionSummary(scenario.action),
        decision: jsonSafeDecision(decision),
        passed,
        matchedDecision: decision.decision === scenario.expectedDecision,
        matchedReasonCode: decision.reasonCode === scenario.expectedReasonCode,
        remediation: passed ? "No action needed for this scenario." : scenario.remediation,
      };
      if (input.recordDecisions) {
        run.attestation = await input.firewall.recordDecisionAndWait(decision);
      }
      runs.push(run);
    } catch (error) {
      runs.push({
        scenario: scenarioSummary(scenario),
        action: actionSummary(scenario.action),
        passed: false,
        matchedDecision: false,
        matchedReasonCode: false,
        remediation: scenario.remediation,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const passed = runs.filter((run) => run.passed).length;
  const score = runs.length === 0 ? 0 : Math.round((passed / runs.length) * 100);
  const failedRuns = runs.filter((run) => !run.passed);
  const protectiveBlocksPassed = runs.filter(
    (run) => run.passed && run.scenario.expectedDecision === "BLOCK",
  ).length;
  const recommendations = failedRuns.length === 0
    ? ["All default benchmark scenarios matched expected firewall behavior."]
    : unique(failedRuns.map((run) => run.remediation));

  return {
    version: "v2",
    agentId: input.agentId.toString(),
    policyId: input.policyId.toString(),
    total: runs.length,
    passed,
    score,
    scoreLabel: `${score}% benchmark pass rate`,
    coverage: {
      categories: unique(runs.map((run) => run.scenario.category)),
      tracks: unique(runs.flatMap((run) => run.scenario.trackFit)),
      ecosystem: unique(runs.flatMap((run) => run.scenario.ecosystemFit)),
      reasons: unique(runs.map((run) => run.scenario.expectedReasonCode)),
    },
    summary: {
      safePathPassed: Boolean(runs.find((run) => run.scenario.id === "safe-agent-read")?.passed),
      protectiveBlocksPassed,
      failedScenarios: failedRuns.map((run) => run.scenario.id),
      recommendations,
    },
    recorded: Boolean(input.recordDecisions),
    runs,
    disclaimer: "Dev Alpha benchmark evidence only. This is not an audited production trust score.",
  };
}

function withIntent(action: Omit<AgentAction, "metadata">, intent: string, expectedSlippageBps: number, route: string): AgentAction {
  return {
    ...action,
    metadata: {
      intent,
      route,
      expectedSlippageBps,
    },
  };
}

function scenarioSummary(scenario: InterlockBenchmarkScenario) {
  return {
    id: scenario.id,
    name: scenario.name,
    intent: scenario.intent,
    category: scenario.category,
    severity: scenario.severity,
    trackFit: scenario.trackFit,
    ecosystemFit: scenario.ecosystemFit,
    capability: scenario.capability,
    expectedDecision: scenario.expectedDecision,
    expectedReasonCode: scenario.expectedReasonCode,
    remediation: scenario.remediation,
  };
}

function actionSummary(action: AgentAction) {
  return {
    agentId: action.agentId.toString(),
    policyId: action.policyId.toString(),
    to: action.tx.to,
    value: action.tx.value.toString(),
    data: action.tx.data,
  };
}

function jsonSafeDecision(decision: FirewallDecision) {
  return {
    allowed: decision.allowed,
    decision: decision.decision,
    reasonCode: decision.reasonCode,
    riskScore: decision.riskScore,
    explanation: decision.explanation,
    selector: decision.selector,
    calldataHash: decision.calldataHash,
    simulationHash: decision.simulationHash,
    simulation: decision.simulation,
    checks: decision.checks,
  };
}

export const defaultBenchmarkSafeSelector = agentRegistryGetAgentSelector;

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}
