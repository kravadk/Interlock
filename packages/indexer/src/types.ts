import type { Address, Hex } from "viem";
import type { AttestationStatusLabel, DecisionLabel, ReasonCodeLabel } from "@interlock/shared";

export type IndexedActionRecord = {
  actionCheckId: string;
  agentId: string;
  policyId: string;
  target: Address;
  value: string;
  calldataHash: Hex;
  selector: Hex;
  simulationHash: Hex;
  decision: DecisionLabel;
  reasonCode: ReasonCodeLabel;
  timestamp: string;
  transactionHash: Hex;
  blockNumber: string;
  status?: AttestationStatusLabel;
  finalizableAt?: string;
  evidenceHash?: Hex;
};

export type IndexedAgentRecord = {
  agentId: string;
  owner: Address;
  metadataURI: string;
  transactionHash: Hex;
  blockNumber: string;
};

export type IndexedPolicyRecord = {
  policyId: string;
  agentId?: string;
  owner?: Address;
  maxNativeValue?: string;
  maxSlippageBps?: number;
  active?: boolean;
  allowedTargets?: Address[];
  allowedSelectors?: Hex[];
  targetPermissions?: Array<{ target: Address; allowed: boolean }>;
  selectorPermissions?: Array<{ selector: Hex; allowed: boolean }>;
  transactionHash: Hex;
  blockNumber: string;
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
  target: Address;
  value: string;
  calldata: Hex;
  intent: string;
  decision?: DecisionLabel;
  reasonCode?: string;
  actionCheckId?: string;
  txHash?: Hex;
  createdAt: string;
  updatedAt: string;
};

export type ProposalFilters = {
  agentId?: string;
  policyId?: string;
  status?: ActionProposalStatus;
  limit?: number;
  offset?: number;
};

export type YieldDataPoint = {
  source: "defillama";
  poolId: string;
  chain?: string;
  project: string;
  symbol?: string;
  tvlUsd?: number;
  apy?: number;
  apyBase?: number;
  apyReward?: number;
  riskNotes: string[];
  fetchedAt: string;
};

export type ActionFilters = {
  agentId?: string;
  policyId?: string;
  decision?: DecisionLabel;
  reasonCode?: ReasonCodeLabel;
  target?: string;
  selector?: string;
  limit?: number;
  offset?: number;
};

export type ActionPage = {
  total: number;
  limit: number;
  offset: number;
  nextOffset?: number;
};

export type AgentStats = {
  agentId: string;
  totalActions: number;
  allowedActions: number;
  blockedActions: number;
  reviewActions: number;
  failedSimulations: number;
};

export type IndexerConfig = {
  rpcUrl: string;
  agentRegistry: Address;
  policyRegistry: Address;
  actionAttestation: Address;
  fromBlock: bigint;
  port: number;
  dbPath: string;
  autoSync: boolean;
  syncIntervalMs: number;
  blockChunkSize: bigint;
  webhookUrl?: string;
  webhookSecret?: string;
  webhookEvents: string[];
};

export type ActionStoreLike = {
  upsertMany(actions: IndexedActionRecord[]): void;
  upsertAgents(agents: IndexedAgentRecord[]): void;
  upsertPolicies(policies: IndexedPolicyRecord[]): void;
  list(filters?: ActionFilters): IndexedActionRecord[];
  count(filters?: ActionFilters): number;
  listAgents(): IndexedAgentRecord[];
  getAgent(agentId: string): IndexedAgentRecord | undefined;
  listPolicies(): IndexedPolicyRecord[];
  getPolicy(policyId: string): IndexedPolicyRecord | undefined;
  stats(agentId: string): AgentStats;
  latestBlock(): bigint;
  upsertProposal(proposal: ActionProposal): void;
  listProposals(filters?: ProposalFilters): ActionProposal[];
  getProposal(proposalId: string): ActionProposal | undefined;
  upsertYields(points: YieldDataPoint[]): void;
  listYields(): YieldDataPoint[];
};

export type SyncResult = {
  actions: IndexedActionRecord[];
  agents: IndexedAgentRecord[];
  policies: IndexedPolicyRecord[];
};
