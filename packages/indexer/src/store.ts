import type {
  ActionFilters,
  ActionProposal,
  ActionStoreLike,
  AgentStats,
  IndexedActionRecord,
  IndexedAgentRecord,
  IndexedPolicyRecord,
  ProposalFilters,
  YieldDataPoint,
} from "./types.js";

export class ActionStore implements ActionStoreLike {
  private readonly actionsById = new Map<string, IndexedActionRecord>();
  private readonly agentsById = new Map<string, IndexedAgentRecord>();
  private readonly policiesById = new Map<string, IndexedPolicyRecord>();
  private readonly proposalsById = new Map<string, ActionProposal>();
  private readonly yieldsByPoolId = new Map<string, YieldDataPoint>();

  upsertMany(actions: IndexedActionRecord[]) {
    for (const action of actions) {
      this.actionsById.set(action.actionCheckId, action);
    }
  }

  upsertAgents(agents: IndexedAgentRecord[]) {
    for (const agent of agents) {
      this.agentsById.set(agent.agentId, agent);
    }
  }

  upsertPolicies(policies: IndexedPolicyRecord[]) {
    for (const policy of policies) {
      const existing = this.policiesById.get(policy.policyId);
      this.policiesById.set(policy.policyId, mergePolicy(existing, policy));
    }
  }

  list(filters: ActionFilters = {}) {
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? Number.POSITIVE_INFINITY;

    return [...this.actionsById.values()]
      .filter((action) => matchesActionFilters(action, filters))
      .sort((a, b) => Number(BigInt(b.blockNumber) - BigInt(a.blockNumber)))
      .slice(offset, Number.isFinite(limit) ? offset + limit : undefined);
  }

  count(filters: ActionFilters = {}) {
    return [...this.actionsById.values()].filter((action) => matchesActionFilters(action, filters)).length;
  }

  stats(agentId: string): AgentStats {
    const actions = this.list({ agentId });
    return {
      agentId,
      totalActions: actions.length,
      allowedActions: actions.filter((action) => action.decision === "ALLOW").length,
      blockedActions: actions.filter((action) => action.decision === "BLOCK").length,
      reviewActions: actions.filter((action) => action.decision === "REVIEW").length,
      failedSimulations: actions.filter((action) => action.reasonCode === "SIMULATION_FAILED").length,
    };
  }

  listAgents() {
    return [...this.agentsById.values()].sort((a, b) => Number(BigInt(b.blockNumber) - BigInt(a.blockNumber)));
  }

  getAgent(agentId: string) {
    return this.agentsById.get(agentId);
  }

  listPolicies() {
    return [...this.policiesById.values()].sort((a, b) => Number(BigInt(b.blockNumber) - BigInt(a.blockNumber)));
  }

  getPolicy(policyId: string) {
    return this.policiesById.get(policyId);
  }

  latestBlock() {
    let latest = 0n;
    for (const agent of this.agentsById.values()) {
      const block = BigInt(agent.blockNumber);
      if (block > latest) latest = block;
    }
    for (const policy of this.policiesById.values()) {
      const block = BigInt(policy.blockNumber);
      if (block > latest) latest = block;
    }
    for (const action of this.actionsById.values()) {
      const block = BigInt(action.blockNumber);
      if (block > latest) latest = block;
    }
    return latest;
  }

  upsertProposal(proposal: ActionProposal) {
    this.proposalsById.set(proposal.proposalId, proposal);
  }

  listProposals(filters: ProposalFilters = {}) {
    const offset = filters.offset ?? 0;
    const limit = filters.limit ?? Number.POSITIVE_INFINITY;
    return [...this.proposalsById.values()]
      .filter((proposal) => matchesProposalFilters(proposal, filters))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(offset, Number.isFinite(limit) ? offset + limit : undefined);
  }

  getProposal(proposalId: string) {
    return this.proposalsById.get(proposalId);
  }

  upsertYields(points: YieldDataPoint[]) {
    for (const point of points) {
      this.yieldsByPoolId.set(point.poolId, point);
    }
  }

  listYields() {
    return [...this.yieldsByPoolId.values()].sort((a, b) => (b.tvlUsd ?? 0) - (a.tvlUsd ?? 0));
  }
}

function matchesActionFilters(action: IndexedActionRecord, filters: ActionFilters) {
  if (filters.agentId && action.agentId !== filters.agentId) return false;
  if (filters.policyId && action.policyId !== filters.policyId) return false;
  if (filters.decision && action.decision !== filters.decision) return false;
  if (filters.reasonCode && action.reasonCode !== filters.reasonCode) return false;
  if (filters.target && action.target.toLowerCase() !== filters.target.toLowerCase()) return false;
  if (filters.selector && action.selector.toLowerCase() !== filters.selector.toLowerCase()) return false;
  return true;
}

function matchesProposalFilters(proposal: ActionProposal, filters: ProposalFilters) {
  if (filters.agentId && proposal.agentId !== filters.agentId) return false;
  if (filters.policyId && proposal.policyId !== filters.policyId) return false;
  if (filters.status && proposal.status !== filters.status) return false;
  return true;
}

function mergePolicy(existing: IndexedPolicyRecord | undefined, update: IndexedPolicyRecord): IndexedPolicyRecord {
  const allowedTargets = applyPermissionDeltas(
    existing?.allowedTargets ?? [],
    (update.targetPermissions ?? []).map((permission) => ({ value: permission.target, allowed: permission.allowed })),
  ) as IndexedPolicyRecord["allowedTargets"];
  const allowedSelectors = applyPermissionDeltas(
    existing?.allowedSelectors ?? [],
    (update.selectorPermissions ?? []).map((permission) => ({ value: permission.selector, allowed: permission.allowed })),
  ) as IndexedPolicyRecord["allowedSelectors"];

  return {
    policyId: update.policyId,
    agentId: update.agentId ?? existing?.agentId,
    owner: update.owner ?? existing?.owner,
    maxNativeValue: update.maxNativeValue ?? existing?.maxNativeValue,
    maxSlippageBps: update.maxSlippageBps ?? existing?.maxSlippageBps,
    active: update.active ?? existing?.active ?? true,
    allowedTargets,
    allowedSelectors,
    transactionHash: update.transactionHash,
    blockNumber: update.blockNumber,
  };
}

function applyPermissionDeltas<T extends string>(current: T[], deltas: Array<{ value: T; allowed: boolean }>) {
  const values = new Set(current.map((value) => value.toLowerCase()));
  const canonical = new Map(current.map((value) => [value.toLowerCase(), value]));

  for (const delta of deltas) {
    const normalized = delta.value.toLowerCase();
    if (delta.allowed) {
      values.add(normalized);
      canonical.set(normalized, delta.value);
    } else {
      values.delete(normalized);
      canonical.delete(normalized);
    }
  }

  return [...values].map((value) => canonical.get(value)!).sort() as T[];
}
