import type { AttestationStatusLabel, DecisionLabel, ReasonCodeLabel } from "@interlock/shared";

export type IndexerAction = {
  actionCheckId: string;
  agentId: string;
  policyId: string;
  target: `0x${string}`;
  value: string;
  calldataHash: `0x${string}`;
  selector: `0x${string}`;
  simulationHash: `0x${string}`;
  decision: DecisionLabel;
  reasonCode: ReasonCodeLabel;
  timestamp: string;
  transactionHash: `0x${string}`;
  blockNumber: string;
  status?: AttestationStatusLabel;
  finalizableAt?: string;
  evidenceHash?: `0x${string}`;
};

export type IndexerStats = {
  agentId: string;
  totalActions: number;
  allowedActions: number;
  blockedActions: number;
  reviewActions: number;
  failedSimulations: number;
};

export type IndexerAgent = IndexerStats & {
  owner?: `0x${string}`;
  metadataURI?: string;
  registrationTxHash?: `0x${string}`;
  registrationBlockNumber?: string;
  latestAction?: IndexerAction;
  policyIds: string[];
};

export type IndexerPolicy = {
  policyId: string;
  owner?: `0x${string}`;
  maxNativeValue?: string;
  maxSlippageBps?: number;
  active?: boolean;
  allowedTargets?: `0x${string}`[];
  allowedSelectors?: `0x${string}`[];
  registrationTxHash?: `0x${string}`;
  registrationBlockNumber?: string;
  agentIds: string[];
  totalActions: number;
  allowedActions: number;
  blockedActions: number;
  reviewActions: number;
  failedSimulations: number;
  latestAction?: IndexerAction;
};

export type IndexerSyncResult = {
  synced: number;
  agents: number;
  policies: number;
  actions: number;
};

export type IndexerHealth = {
  ok: boolean;
  nextFromBlock: string;
  lastSyncError?: string;
  lastSyncStartedAt?: string;
  lastSyncCompletedAt?: string;
  lastSyncedCount?: number;
  autoSync?: boolean;
  syncIntervalMs?: number;
  blockChunkSize?: string;
  syncing?: boolean;
  storage?: string;
  webhook?: {
    configured: boolean;
    events: string[];
    lastDeliveryAt?: string;
    lastDeliveryOk?: boolean;
    lastDeliveryError?: string;
  };
};

export type AgentBenchmark = {
  agentId: string;
  score: number;
  scoreLabel: string;
  totalActions: number;
  allowedActions: number;
  blockedActions: number;
  failedSimulations: number;
  reasonBreakdown: Record<string, number>;
  latestActions: IndexerAction[];
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
  latestActions: IndexerAction[];
};

export type ActionProposalStatus =
  | "proposed"
  | "preflighted"
  | "approved"
  | "executed"
  | "recorded"
  | "blocked"
  | "rejected";

export type ActionProposal = {
  proposalId: string;
  agentId: string;
  policyId: string;
  status: ActionProposalStatus;
  target: `0x${string}`;
  value: string;
  calldata: `0x${string}`;
  intent: string;
  decision?: DecisionLabel;
  reasonCode?: ReasonCodeLabel;
  actionCheckId?: string;
  txHash?: `0x${string}`;
  createdAt: string;
  updatedAt: string;
};

export type YieldDataPoint = {
  id: string;
  source: string;
  project: string;
  chain: string;
  poolId: string;
  symbol: string;
  tvlUsd?: number;
  apy?: number;
  underlyingTokens: `0x${string}`[];
  riskNotes: string[];
  fetchedAt: string;
};

export function indexerBaseUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_INDEXER_URL?.trim();
  if (configuredUrl && ["disabled", "none", "off"].includes(configuredUrl.toLowerCase())) {
    return undefined;
  }
  return configuredUrl ? configuredUrl.replace(/\/$/, "") : undefined;
}

export async function fetchAgentActions(agentId: string): Promise<IndexerAction[]> {
  const response = await fetchIndexer<{ actions: IndexerAction[] }>(`/agents/${agentId}/actions?limit=25`);
  return response.actions;
}

export async function fetchAgentStats(agentId: string): Promise<IndexerStats> {
  return fetchIndexer<IndexerStats>(`/stats/agents/${agentId}`);
}

export async function fetchAgentBenchmark(agentId: string): Promise<AgentBenchmark> {
  return fetchIndexer<AgentBenchmark>(`/benchmark/${agentId}`);
}

export async function fetchAnalytics(): Promise<AnalyticsSummary> {
  return fetchIndexer<AnalyticsSummary>("/analytics");
}

export async function fetchAgentAnalytics(agentId: string): Promise<AnalyticsSummary> {
  return fetchIndexer<AnalyticsSummary>(`/analytics/agents/${agentId}`);
}

export async function fetchPolicyAnalytics(policyId: string): Promise<AnalyticsSummary> {
  return fetchIndexer<AnalyticsSummary>(`/analytics/policies/${policyId}`);
}

export async function fetchProposals(agentId?: string): Promise<ActionProposal[]> {
  const query = agentId ? `?agentId=${encodeURIComponent(agentId)}` : "";
  const response = await fetchIndexer<{ proposals: ActionProposal[] }>(`/proposals${query}`);
  return response.proposals;
}

export async function fetchYields(): Promise<YieldDataPoint[]> {
  const response = await fetchIndexer<{ yields: YieldDataPoint[] }>("/ecosystem/yields");
  return response.yields;
}

export async function syncYields(): Promise<{ synced: number; yields: YieldDataPoint[] }> {
  return fetchIndexer<{ synced: number; yields: YieldDataPoint[] }>("/ecosystem/yields/sync", { method: "POST" });
}

export async function fetchAgents(): Promise<IndexerAgent[]> {
  const response = await fetchIndexer<{ agents: IndexerAgent[] }>("/agents");
  return response.agents;
}

export async function fetchPolicies(): Promise<IndexerPolicy[]> {
  const response = await fetchIndexer<{ policies: IndexerPolicy[] }>("/policies");
  return response.policies;
}

export async function fetchIndexerHealth(): Promise<IndexerHealth> {
  return fetchIndexer<IndexerHealth>("/health");
}

export async function syncIndexer(): Promise<IndexerSyncResult> {
  return fetchIndexer<IndexerSyncResult>("/sync", { method: "POST" });
}

async function fetchIndexer<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = indexerBaseUrl();
  if (!baseUrl) {
    throw new Error("Indexer is not configured for this dashboard deployment.");
  }

  const response = await fetch(`${baseUrl}${path}`, { cache: "no-store", ...init });

  if (!response.ok) {
    throw new Error(`Indexer request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}
