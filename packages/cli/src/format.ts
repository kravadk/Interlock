import type { ActionHistoryEntry, AgentAction, AgentPolicy, AgentStats, FirewallDecision, PolicyPermissionCheckResult } from "@interlock/firewall-sdk";
import { decisionToToolResult } from "@interlock/firewall-sdk";

export function json(value: unknown) {
  return JSON.stringify(value, bigintReplacer, 2);
}

export function formatDecision(decision: FirewallDecision, action: AgentAction) {
  return decisionToToolResult(decision, action);
}

export function formatHistory(history: ActionHistoryEntry[]) {
  return history.map((entry) => ({
    actionCheckId: entry.actionCheckId.toString(),
    agentId: entry.agentId.toString(),
    policyId: entry.policyId.toString(),
    target: entry.target,
    value: entry.value.toString(),
    calldataHash: entry.calldataHash,
    selector: entry.selector,
    simulationHash: entry.simulationHash,
    decision: entry.decision,
    reasonCode: entry.reasonCode,
    timestamp: entry.timestamp.toString(),
    transactionHash: entry.transactionHash,
    blockNumber: entry.blockNumber.toString(),
  }));
}

export function formatAgent(agentId: bigint, stats: AgentStats) {
  return {
    agentId: agentId.toString(),
    owner: stats.owner,
    metadataURI: stats.metadataURI,
    allowedActions: stats.allowedActions.toString(),
    blockedActions: stats.blockedActions.toString(),
    failedSimulations: stats.failedSimulations.toString(),
    exists: stats.exists,
  };
}

export function formatPolicy(policyId: bigint, policy: AgentPolicy) {
  return {
    policyId: policyId.toString(),
    owner: policy.owner,
    agentId: policy.agentId.toString(),
    maxNativeValue: policy.maxNativeValue.toString(),
    maxSlippageBps: policy.maxSlippageBps,
    active: policy.active,
  };
}

export function formatPolicyPermissionCheck(result: PolicyPermissionCheckResult) {
  return {
    policyId: result.policyId.toString(),
    target: result.target,
    selector: result.selector,
    targetAllowed: result.targetAllowed,
    selectorAllowed: result.selectorAllowed,
  };
}

function bigintReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}
