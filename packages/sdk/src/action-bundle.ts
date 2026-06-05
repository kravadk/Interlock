import { keccak256, toHex, type Hex } from "viem";
import type { AgentActionBundle, AgentActionBundleReport, FirewallDecision, RecordDecisionResult } from "./types.js";

export type BundleFirewall = {
  checkAction(action: AgentActionBundle["actions"][number]): Promise<FirewallDecision>;
  recordDecisionAndWait(decision: FirewallDecision): Promise<RecordDecisionResult>;
};

export async function checkActionBundle(firewall: BundleFirewall, bundle: AgentActionBundle): Promise<AgentActionBundleReport> {
  if (bundle.actions.length === 0) {
    throw new Error("Action bundle must include at least one action.");
  }
  const decisions: FirewallDecision[] = [];
  for (const [index, action] of bundle.actions.entries()) {
    if (action.agentId !== bundle.agentId) throw new Error(`Action #${index + 1} agentId does not match bundle agentId.`);
    if (action.policyId !== bundle.policyId) throw new Error(`Action #${index + 1} policyId does not match bundle policyId.`);
    decisions.push(await firewall.checkAction(action));
  }
  const blocked = decisions.find((decision) => !decision.allowed);
  const allowed = !blocked;
  const riskScore = Math.max(...decisions.map((decision) => decision.riskScore));
  const reasonCode = blocked?.reasonCode ?? "POLICY_PASSED";
  const report: AgentActionBundleReport = {
    bundleId: bundle.bundleId ?? bundleHash(bundle),
    agentId: bundle.agentId,
    policyId: bundle.policyId,
    intent: bundle.intent,
    allowed,
    decision: allowed ? "ALLOW" : "BLOCK",
    reasonCode,
    riskScore,
    actionCount: decisions.length,
    bundleHash: bundleHash(bundle),
    decisions,
    summary: summarizeBundleRisk({ ...bundle, decisions, allowed, reasonCode, riskScore }),
  };
  return report;
}

export async function recordBundleDecisions(firewall: BundleFirewall, report: AgentActionBundleReport): Promise<RecordDecisionResult[]> {
  const results: RecordDecisionResult[] = [];
  for (const decision of report.decisions) {
    results.push(await firewall.recordDecisionAndWait(decision));
  }
  return results;
}

export function summarizeBundleRisk(input: {
  intent: string;
  decisions: FirewallDecision[];
  allowed: boolean;
  reasonCode: string;
  riskScore: number;
}): string {
  const blockedCount = input.decisions.filter((decision) => !decision.allowed).length;
  if (input.allowed) {
    return `Bundle allowed: ${input.decisions.length} actions passed policy, selector, value, slippage, and simulation checks.`;
  }
  return `Bundle blocked: ${blockedCount}/${input.decisions.length} actions failed. First blocking reason: ${input.reasonCode}.`;
}

export function bundleHash(bundle: AgentActionBundle): Hex {
  const payload = JSON.stringify({
    bundleId: bundle.bundleId,
    agentId: bundle.agentId.toString(),
    policyId: bundle.policyId.toString(),
    intent: bundle.intent,
    metadata: bundle.metadata,
    actions: bundle.actions.map((action) => ({
      to: action.tx.to.toLowerCase(),
      value: action.tx.value.toString(),
      data: action.tx.data.toLowerCase(),
      metadata: action.metadata,
    })),
  });
  return keccak256(toHex(payload));
}
