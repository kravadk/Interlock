import type { AgentStats, IndexedActionRecord, IndexedAgentRecord, IndexedPolicyRecord } from "./types.js";

export type AgentSummary = AgentStats & {
  owner?: IndexedAgentRecord["owner"];
  metadataURI?: string;
  registrationTxHash?: IndexedAgentRecord["transactionHash"];
  registrationBlockNumber?: string;
  latestAction?: IndexedActionRecord;
  policyIds: string[];
};

export type PolicySummary = {
  policyId: string;
  owner?: IndexedPolicyRecord["owner"];
  maxNativeValue?: string;
  maxSlippageBps?: number;
  active?: boolean;
  allowedTargets?: IndexedPolicyRecord["allowedTargets"];
  allowedSelectors?: IndexedPolicyRecord["allowedSelectors"];
  registrationTxHash?: IndexedPolicyRecord["transactionHash"];
  registrationBlockNumber?: string;
  agentIds: string[];
  totalActions: number;
  allowedActions: number;
  blockedActions: number;
  reviewActions: number;
  failedSimulations: number;
  latestAction?: IndexedActionRecord;
};

export type BenchmarkSummary = {
  agentId: string;
  score: number;
  scoreLabel: string;
  totalActions: number;
  allowedActions: number;
  blockedActions: number;
  failedSimulations: number;
  reasonBreakdown: Record<string, number>;
  latestActions: IndexedActionRecord[];
  disclaimer: string;
};

export type AnalyticsSummary = {
  scope: "global" | "agent" | "policy";
  agentId?: string;
  policyId?: string;
  totalActions: number;
  allowed: number;
  blocked: number;
  review: number;
  failedSimulations: number;
  blockRate: number;
  topReasons: Array<{ reasonCode: string; count: number }>;
  topTargets: Array<{ target: string; count: number }>;
  topSelectors: Array<{ selector: string; count: number }>;
  latestActions: IndexedActionRecord[];
};

export type RecorderStatus = {
  name: "interlock-recorder-service";
  version: string;
  network: {
    name: string;
    chainId: number;
    rpcUrl: string;
  };
  contracts: {
    agentRegistry: string;
    policyRegistry: string;
    actionAttestation: string;
  };
  sync: {
    nextFromBlock: string;
    lastSyncError?: string;
    lastSyncStartedAt?: string;
    lastSyncCompletedAt?: string;
    lastSyncedCount?: number;
    autoSync?: boolean;
    syncIntervalMs?: number;
    syncing?: boolean;
    blockChunkSize?: string;
  };
  storage?: string;
  records: {
    agents: number;
    policies: number;
    actions: number;
    latestIndexedBlock: string;
    latestAction?: IndexedActionRecord;
  };
  webhook?: {
    configured: boolean;
    events: string[];
    lastDeliveryAt?: string;
    lastDeliveryOk?: boolean;
    lastDeliveryError?: string;
  };
};

export function findAction(actions: IndexedActionRecord[], actionCheckId: string) {
  return actions.find((action) => action.actionCheckId === actionCheckId);
}

export function buildAgentSummaries(actions: IndexedActionRecord[], registeredAgents: IndexedAgentRecord[] = []): AgentSummary[] {
  const agentsById = new Map(registeredAgents.map((agent) => [agent.agentId, agent]));
  const agentIds = unique([...actions.map((action) => action.agentId), ...registeredAgents.map((agent) => agent.agentId)]);
  return agentIds
    .map((agentId) => {
      const agentActions = sorted(actions.filter((action) => action.agentId === agentId));
      const registeredAgent = agentsById.get(agentId);
      return {
        ...statsFor(agentId, agentActions),
        owner: registeredAgent?.owner,
        metadataURI: registeredAgent?.metadataURI,
        registrationTxHash: registeredAgent?.transactionHash,
        registrationBlockNumber: registeredAgent?.blockNumber,
        latestAction: agentActions[0],
        policyIds: unique(agentActions.map((action) => action.policyId)),
      };
    })
    .sort((a, b) => Number(BigInt(sortBlock(b)) - BigInt(sortBlock(a))));
}

export function buildAgentDetail(actions: IndexedActionRecord[], agentId: string, registeredAgent?: IndexedAgentRecord): AgentSummary | undefined {
  return buildAgentSummaries(actions, registeredAgent ? [registeredAgent] : []).find((agent) => agent.agentId === agentId);
}

export function buildPolicySummaries(actions: IndexedActionRecord[], registeredPolicies: IndexedPolicyRecord[] = []): PolicySummary[] {
  const policiesById = new Map(registeredPolicies.map((policy) => [policy.policyId, policy]));
  const policyIds = unique([...actions.map((action) => action.policyId), ...registeredPolicies.map((policy) => policy.policyId)]);
  return policyIds
    .map((policyId) => {
      const policyActions = sorted(actions.filter((action) => action.policyId === policyId));
      const stats = statsFor(policyId, policyActions);
      const registeredPolicy = policiesById.get(policyId);
      return {
        policyId,
        owner: registeredPolicy?.owner,
        maxNativeValue: registeredPolicy?.maxNativeValue,
        maxSlippageBps: registeredPolicy?.maxSlippageBps,
        active: registeredPolicy?.active,
        allowedTargets: registeredPolicy?.allowedTargets,
        allowedSelectors: registeredPolicy?.allowedSelectors,
        registrationTxHash: registeredPolicy?.transactionHash,
        registrationBlockNumber: registeredPolicy?.blockNumber,
        agentIds: unique([...policyActions.map((action) => action.agentId), ...(registeredPolicy?.agentId ? [registeredPolicy.agentId] : [])]),
        totalActions: stats.totalActions,
        allowedActions: stats.allowedActions,
        blockedActions: stats.blockedActions,
        reviewActions: stats.reviewActions,
        failedSimulations: stats.failedSimulations,
        latestAction: policyActions[0],
      };
    })
    .sort((a, b) => Number(BigInt(sortBlock(b)) - BigInt(sortBlock(a))));
}

export function buildPolicyDetail(actions: IndexedActionRecord[], policyId: string, registeredPolicy?: IndexedPolicyRecord): PolicySummary | undefined {
  return buildPolicySummaries(actions, registeredPolicy ? [registeredPolicy] : []).find((policy) => policy.policyId === policyId);
}

export function buildBenchmarkSummary(actions: IndexedActionRecord[], agentId: string): BenchmarkSummary {
  const agentActions = sorted(actions.filter((action) => action.agentId === agentId));
  const stats = statsFor(agentId, agentActions);
  const reasonBreakdown = agentActions.reduce<Record<string, number>>((accumulator, action) => {
    accumulator[action.reasonCode] = (accumulator[action.reasonCode] ?? 0) + 1;
    return accumulator;
  }, {});
  const protectiveBlocks = stats.blockedActions + stats.failedSimulations;
  const score = stats.totalActions === 0 ? 0 : Math.round(((stats.allowedActions + protectiveBlocks) / stats.totalActions) * 100);

  return {
    agentId,
    score,
    scoreLabel: stats.totalActions === 0 ? "No benchmark evidence yet" : `${score}% evidence score`,
    totalActions: stats.totalActions,
    allowedActions: stats.allowedActions,
    blockedActions: stats.blockedActions,
    failedSimulations: stats.failedSimulations,
    reasonBreakdown,
    latestActions: agentActions.slice(0, 10),
    disclaimer: "Dev Alpha evidence summary only. This is not an audited production trust score.",
  };
}

export function buildAnalyticsSummary(
  actions: IndexedActionRecord[],
  input: { scope?: "global" | "agent" | "policy"; agentId?: string; policyId?: string } = {},
): AnalyticsSummary {
  const scope = input.scope ?? (input.agentId ? "agent" : input.policyId ? "policy" : "global");
  const scopedActions = sorted(
    actions.filter((action) => {
      if (input.agentId && action.agentId !== input.agentId) return false;
      if (input.policyId && action.policyId !== input.policyId) return false;
      return true;
    }),
  );
  const totalActions = scopedActions.length;
  const blocked = scopedActions.filter((action) => action.decision === "BLOCK").length;

  return {
    scope,
    agentId: input.agentId,
    policyId: input.policyId,
    totalActions,
    allowed: scopedActions.filter((action) => action.decision === "ALLOW").length,
    blocked,
    review: scopedActions.filter((action) => action.decision === "REVIEW").length,
    failedSimulations: scopedActions.filter((action) => action.reasonCode === "SIMULATION_FAILED").length,
    blockRate: totalActions === 0 ? 0 : Math.round((blocked / totalActions) * 10000) / 100,
    topReasons: topCounts(scopedActions.map((action) => action.reasonCode), "reasonCode"),
    topTargets: topCounts(scopedActions.map((action) => action.target.toLowerCase()), "target"),
    topSelectors: topCounts(scopedActions.map((action) => action.selector.toLowerCase()), "selector"),
    latestActions: scopedActions.slice(0, 10),
  };
}

export function buildRecorderStatus(input: {
  version: string;
  network: RecorderStatus["network"];
  contracts: RecorderStatus["contracts"];
  sync: Omit<RecorderStatus["sync"], "blockChunkSize"> & { blockChunkSize?: bigint | string };
  storage?: string;
  actions: IndexedActionRecord[];
  agents: IndexedAgentRecord[];
  policies: IndexedPolicyRecord[];
  latestIndexedBlock: bigint;
  webhook?: RecorderStatus["webhook"];
}): RecorderStatus {
  const sortedActions = sorted(input.actions);
  return {
    name: "interlock-recorder-service",
    version: input.version,
    network: input.network,
    contracts: input.contracts,
    sync: {
      ...input.sync,
      nextFromBlock: input.sync.nextFromBlock,
      blockChunkSize: input.sync.blockChunkSize?.toString(),
    },
    storage: input.storage,
    records: {
      agents: input.agents.length,
      policies: input.policies.length,
      actions: input.actions.length,
      latestIndexedBlock: input.latestIndexedBlock.toString(),
      latestAction: sortedActions[0],
    },
    webhook: input.webhook,
  };
}

function topCounts<TName extends "reasonCode" | "target" | "selector">(values: string[], name: TName): Array<Record<TName, string> & { count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([value, count]) => ({ [name]: value, count }) as Record<TName, string> & { count: number });
}

function statsFor(agentId: string, actions: IndexedActionRecord[]): AgentStats {
  return {
    agentId,
    totalActions: actions.length,
    allowedActions: actions.filter((action) => action.decision === "ALLOW").length,
    blockedActions: actions.filter((action) => action.decision === "BLOCK").length,
    reviewActions: actions.filter((action) => action.decision === "REVIEW").length,
    failedSimulations: actions.filter((action) => action.reasonCode === "SIMULATION_FAILED").length,
  };
}

function sorted(actions: IndexedActionRecord[]) {
  return [...actions].sort((a, b) => Number(BigInt(b.blockNumber) - BigInt(a.blockNumber)));
}

function unique(values: string[]) {
  return [...new Set(values)].sort((a, b) => Number(BigInt(a) - BigInt(b)));
}

function sortBlock(record: { latestAction?: IndexedActionRecord; registrationBlockNumber?: string }) {
  return record.latestAction?.blockNumber ?? record.registrationBlockNumber ?? "0";
}
