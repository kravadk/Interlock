import { createPublicClient, type Address } from "viem";
import {
  actionAttestationAbi,
  agentRegistryAbi,
  mantleSepolia,
  parseActionCheckedArgs,
  policyRegistryAbi,
  stringifyActionChecked,
} from "@interlock/shared";
import { actionAttestationFromBlock, mantleRpcUrl, webContracts } from "./contracts";
import type { ActionProposal, IndexerAction, IndexerAgent, IndexerHealth, IndexerPolicy, IndexerStats, YieldDataPoint } from "./indexer";
import { browserRpcTransport } from "./rpc-transport";

export type RpcHistorySnapshot = {
  health: IndexerHealth;
  agents: IndexerAgent[];
  policies: IndexerPolicy[];
  actions: IndexerAction[];
  proposals: ActionProposal[];
  ecosystemYields: YieldDataPoint[];
  stats?: IndexerStats;
};

export async function fetchRpcHistorySnapshot(agentId?: string): Promise<RpcHistorySnapshot> {
  const publicClient = createPublicClient({
    chain: mantleSepolia,
    transport: browserRpcTransport(mantleRpcUrl()),
  });
  const parsedAgentId = parsePositiveBigInt(agentId);
  let latestBlock = 0n;
  let lastSyncError: string | undefined;
  try {
    latestBlock = await withRetry(() => publicClient.getBlockNumber());
  } catch (error) {
    lastSyncError = error instanceof Error ? error.message : String(error);
  }
  let logs: Awaited<ReturnType<typeof getActionCheckedLogs>> = [];
  if (latestBlock > 0n) {
    try {
      logs = await getActionCheckedLogs({
        publicClient,
        fromBlock: actionAttestationFromBlock(),
        toBlock: latestBlock,
        agentId: parsedAgentId,
      });
    } catch (error) {
      lastSyncError = error instanceof Error ? error.message : String(error);
    }
  }
  const actions = logs
    .map((log): IndexerAction | undefined => {
      const parsed = parseActionCheckedArgs(log.args);
      if (!parsed || !log.transactionHash || !log.blockNumber) {
        return undefined;
      }

      return {
        ...stringifyActionChecked(parsed),
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber.toString(),
      };
    })
    .filter((action): action is IndexerAction => Boolean(action))
    .sort((a, b) => Number(BigInt(b.blockNumber) - BigInt(a.blockNumber)))
    .slice(0, 50);

  const policies = await buildPolicies(publicClient, actions);
  const agents = await buildAgents(publicClient, actions, policies);
  const selectedAgentId = parsedAgentId?.toString() ?? agents[0]?.agentId;

  return {
    health: {
      ok: true,
      nextFromBlock: actionAttestationFromBlock().toString(),
      lastSyncedCount: actions.length,
      autoSync: false,
      syncing: false,
      storage: "rpc-fallback",
      blockChunkSize: "rpc-recent-events",
      ...(lastSyncError ? { lastSyncError } : {}),
      lastSyncCompletedAt: new Date().toISOString(),
    },
    agents,
    policies,
    actions: selectedAgentId ? actions.filter((action) => action.agentId === selectedAgentId) : actions,
    proposals: [],
    ecosystemYields: [],
    stats: selectedAgentId ? statsFor(selectedAgentId, actions.filter((action) => action.agentId === selectedAgentId)) : undefined,
  };
}

async function getActionCheckedLogs({
  publicClient,
  fromBlock,
  toBlock,
  agentId,
}: {
  publicClient: ReturnType<typeof createPublicClient>;
  fromBlock: bigint;
  toBlock: bigint;
  agentId?: bigint;
}) {
  const chunkSize = 9_000n;
  const recentWindow = 20_000n;
  const recentFromBlock = toBlock > recentWindow ? toBlock - recentWindow : 0n;
  const safeFromBlock = fromBlock > toBlock ? toBlock : fromBlock > recentFromBlock ? fromBlock : recentFromBlock;
  const logs = [];

  for (let start = safeFromBlock; start <= toBlock; start += chunkSize + 1n) {
    const end = start + chunkSize > toBlock ? toBlock : start + chunkSize;
    const chunk = await withRetry(() => publicClient.getContractEvents({
      address: webContracts.actionAttestation,
      abi: actionAttestationAbi,
      eventName: "ActionChecked",
      args: agentId ? { agentId } : undefined,
      fromBlock: start,
      toBlock: end,
    }));
    logs.push(...chunk);
  }

  return logs;
}

async function buildAgents(
  publicClient: ReturnType<typeof createPublicClient>,
  actions: IndexerAction[],
  policies: IndexerPolicy[],
): Promise<IndexerAgent[]> {
  const registeredAgents = await readRegisteredAgents(publicClient, actions, policies);
  const actionOnlyAgents = unique(actions.map((action) => action.agentId))
    .filter((agentId) => !registeredAgents.some((agent) => agent.agentId === agentId))
    .map((agentId) => {
    const agentActions = actions.filter((action) => action.agentId === agentId);
    return {
      ...statsFor(agentId, agentActions),
      ...(agentActions[0] ? { latestAction: agentActions[0] } : {}),
      policyIds: unique([
        ...agentActions.map((action) => action.policyId),
        ...policies.filter((policy) => policy.agentIds.includes(agentId)).map((policy) => policy.policyId),
      ]),
    };
  });

  return [...registeredAgents, ...actionOnlyAgents].sort((a, b) => Number(BigInt(a.agentId) - BigInt(b.agentId)));
}

async function buildPolicies(
  publicClient: ReturnType<typeof createPublicClient>,
  actions: IndexerAction[],
): Promise<IndexerPolicy[]> {
  const registeredPolicies = await readRegisteredPolicies(publicClient, actions);
  const actionOnlyPolicies = unique(actions.map((action) => action.policyId))
    .filter((policyId) => !registeredPolicies.some((policy) => policy.policyId === policyId))
    .map((policyId) => {
    const policyActions = actions.filter((action) => action.policyId === policyId);
    const stats = statsFor(policyId, policyActions);
    return {
      policyId,
      agentIds: unique(policyActions.map((action) => action.agentId)),
      totalActions: stats.totalActions,
      allowedActions: stats.allowedActions,
      blockedActions: stats.blockedActions,
      reviewActions: stats.reviewActions,
      failedSimulations: stats.failedSimulations,
      ...(policyActions[0] ? { latestAction: policyActions[0] } : {}),
      allowedTargets: uniqueAddresses(policyActions.map((action) => action.target)),
      allowedSelectors: uniqueSelectors(policyActions.map((action) => action.selector)),
    };
  });

  return [...registeredPolicies, ...actionOnlyPolicies].sort((a, b) => Number(BigInt(a.policyId) - BigInt(b.policyId)));
}

async function readRegisteredAgents(
  publicClient: ReturnType<typeof createPublicClient>,
  actions: IndexerAction[],
  policies: IndexerPolicy[],
): Promise<IndexerAgent[]> {
  const nextAgentId = await safeRead<bigint>(() =>
    publicClient.readContract({
      address: webContracts.agentRegistry,
      abi: agentRegistryAbi,
      functionName: "nextAgentId",
    }),
  );
  if (!nextAgentId || nextAgentId <= 1n) return [];

  const maxAgentId = Math.min(Number(nextAgentId - 1n), 100);
  const agents = await Promise.all(
    Array.from({ length: maxAgentId }, async (_, index) => {
      const id = BigInt(index + 1);
      const agent = await safeRead<unknown>(() =>
        publicClient.readContract({
          address: webContracts.agentRegistry,
          abi: agentRegistryAbi,
          functionName: "getAgent",
          args: [id],
        }),
      );
      if (!agent || !tupleField<boolean>(agent, "exists", 5)) return undefined;

      const agentId = id.toString();
      const agentActions = actions.filter((action) => action.agentId === agentId);
      const eventStats = statsFor(agentId, agentActions);
      const allowedActions = toSafeNumber(tupleField<bigint>(agent, "allowedActions", 2) ?? 0n);
      const blockedActions = toSafeNumber(tupleField<bigint>(agent, "blockedActions", 3) ?? 0n);
      const failedSimulations = toSafeNumber(tupleField<bigint>(agent, "failedSimulations", 4) ?? 0n);

      const owner = tupleField<Address>(agent, "owner", 0);
      const metadataURI = tupleField<string>(agent, "metadataURI", 1);
      return {
        agentId,
        ...(owner ? { owner } : {}),
        ...(metadataURI ? { metadataURI } : {}),
        totalActions: Math.max(eventStats.totalActions, allowedActions + blockedActions),
        allowedActions,
        blockedActions,
        reviewActions: eventStats.reviewActions,
        failedSimulations,
        ...(agentActions[0] ? { latestAction: agentActions[0] } : {}),
        policyIds: unique([
          ...agentActions.map((action) => action.policyId),
          ...policies.filter((policy) => policy.agentIds.includes(agentId)).map((policy) => policy.policyId),
        ]),
      } satisfies IndexerAgent;
    }),
  );

  return agents.filter(Boolean) as IndexerAgent[];
}

async function readRegisteredPolicies(
  publicClient: ReturnType<typeof createPublicClient>,
  actions: IndexerAction[],
): Promise<IndexerPolicy[]> {
  const nextPolicyId = await safeRead<bigint>(() =>
    publicClient.readContract({
      address: webContracts.policyRegistry,
      abi: policyRegistryAbi,
      functionName: "nextPolicyId",
    }),
  );
  if (!nextPolicyId || nextPolicyId <= 1n) return [];

  const maxPolicyId = Math.min(Number(nextPolicyId - 1n), 100);
  const policies = await Promise.all(
    Array.from({ length: maxPolicyId }, async (_, index) => {
      const id = BigInt(index + 1);
      const [policy, allowedTargets, allowedSelectors] = await Promise.all([
        safeRead<unknown>(() =>
          publicClient.readContract({
            address: webContracts.policyRegistry,
            abi: policyRegistryAbi,
            functionName: "getPolicy",
            args: [id],
          }),
        ),
        safeRead<readonly Address[]>(() =>
          publicClient.readContract({
            address: webContracts.policyRegistry,
            abi: policyRegistryAbi,
            functionName: "getAllowedTargets",
            args: [id],
          }),
        ),
        safeRead<readonly `0x${string}`[]>(() =>
          publicClient.readContract({
            address: webContracts.policyRegistry,
            abi: policyRegistryAbi,
            functionName: "getAllowedSelectors",
            args: [id],
          }),
        ),
      ]);
      if (!policy) return undefined;

      const policyId = id.toString();
      const policyActions = actions.filter((action) => action.policyId === policyId);
      const stats = statsFor(policyId, policyActions);
      const agentId = tupleField<bigint>(policy, "agentId", 1)?.toString();
      if (!agentId) return undefined;

      const owner = tupleField<Address>(policy, "owner", 0);
      const maxNativeValue = tupleField<bigint>(policy, "maxNativeValue", 2)?.toString();
      return {
        policyId,
        ...(owner ? { owner } : {}),
        agentIds: [agentId],
        ...(maxNativeValue ? { maxNativeValue } : {}),
        maxSlippageBps: Number(tupleField<number | bigint>(policy, "maxSlippageBps", 3) ?? 0),
        active: Boolean(tupleField<boolean>(policy, "active", 4)),
        totalActions: stats.totalActions,
        allowedActions: stats.allowedActions,
        blockedActions: stats.blockedActions,
        reviewActions: stats.reviewActions,
        failedSimulations: stats.failedSimulations,
        ...(policyActions[0] ? { latestAction: policyActions[0] } : {}),
        allowedTargets: uniqueAddresses(allowedTargets ?? []),
        allowedSelectors: uniqueSelectors(allowedSelectors ?? []),
      } satisfies IndexerPolicy;
    }),
  );

  return policies.filter(Boolean) as IndexerPolicy[];
}

function statsFor(agentId: string, actions: IndexerAction[]): IndexerStats {
  return {
    agentId,
    totalActions: actions.length,
    allowedActions: actions.filter((action) => action.decision === "ALLOW").length,
    blockedActions: actions.filter((action) => action.decision === "BLOCK").length,
    reviewActions: actions.filter((action) => action.decision === "REVIEW").length,
    failedSimulations: actions.filter((action) => action.reasonCode === "SIMULATION_FAILED").length,
  };
}

function parsePositiveBigInt(value?: string) {
  try {
    if (!value) return undefined;
    const parsed = BigInt(value);
    return parsed > 0n ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function unique(values: string[]) {
  return [...new Set(values)].sort((a, b) => Number(BigInt(a) - BigInt(b)));
}

function uniqueAddresses(values: readonly Address[]) {
  return [...new Set(values)] as Address[];
}

function uniqueSelectors(values: readonly `0x${string}`[]) {
  return [...new Set(values)];
}

async function safeRead<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await withRetry(fn);
  } catch {
    return undefined;
  }
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("429") && !message.toLowerCase().includes("rate")) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastError;
}

function tupleField<T>(tuple: unknown, key: string, index: number): T | undefined {
  if (!tuple || typeof tuple !== "object") return undefined;
  const record = tuple as Record<string | number, unknown>;
  return (record[key] ?? record[index]) as T | undefined;
}

function toSafeNumber(value: bigint): number {
  return value > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(value);
}
