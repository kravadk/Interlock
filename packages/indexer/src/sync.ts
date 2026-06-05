import { createPublicClient, http, zeroAddress, type Address, type Hex } from "viem";
import {
  actionAttestationAbi,
  agentRegistryAbi,
  mantleSepolia,
  parseActionCheckedArgs,
  policyRegistryAbi,
  stringifyActionChecked,
} from "@interlock/shared";
import type { IndexedActionRecord, IndexedAgentRecord, IndexedPolicyRecord, SyncResult } from "./types.js";

export type SyncOptions = {
  rpcUrl: string;
  agentRegistry?: Address;
  policyRegistry?: Address;
  actionAttestation: Address;
  fromBlock: bigint;
  toBlock?: bigint | "latest";
  blockChunkSize?: bigint;
};

const maxRpcBlockRange = 10_000n;
const defaultBlockChunkSize = 9_000n;

type PublicClient = ReturnType<typeof createPublicClient>;
type ContractEventsRequest = Parameters<PublicClient["getContractEvents"]>[0];

type IndexedEventLog<TArgs> = {
  args: TArgs;
  transactionHash?: Hex;
  blockNumber?: bigint;
  logIndex?: number;
};

type AgentRegisteredLog = IndexedEventLog<{
  agentId?: bigint;
  owner?: Address;
  metadataURI?: string;
}>;

type PolicyCreatedLog = IndexedEventLog<{
  policyId?: bigint;
  agentId?: bigint;
  owner?: Address;
  maxNativeValue?: bigint;
  maxSlippageBps?: number;
}>;

type PolicyUpdatedLog = IndexedEventLog<{
  policyId?: bigint;
  maxNativeValue?: bigint;
  maxSlippageBps?: number;
  active?: boolean;
}>;

type TargetPermissionLog = IndexedEventLog<{
  policyId?: bigint;
  target?: Address;
  allowed?: boolean;
}>;

type SelectorPermissionLog = IndexedEventLog<{
  policyId?: bigint;
  selector?: Hex;
  allowed?: boolean;
}>;

type ActionCheckedLog = IndexedEventLog<{
  actionCheckId?: bigint;
  agentId?: bigint;
  policyId?: bigint;
  target?: Address;
  value?: bigint;
  calldataHash?: Hex;
  selector?: Hex;
  simulationHash?: Hex;
  decision?: number;
  reasonCode?: number;
  timestamp?: bigint;
  status?: number;
  finalizableAt?: bigint;
}>;

export async function syncIndexerRecords(options: SyncOptions): Promise<SyncResult> {
  const publicClient = createPublicClient({
    chain: mantleSepolia,
    transport: http(options.rpcUrl),
  });

  const [agents, policies, actions] = await Promise.all([
    options.agentRegistry && options.agentRegistry !== zeroAddress
      ? syncAgentRecordsWithClient(publicClient, options.agentRegistry, options.fromBlock, options.toBlock, options.blockChunkSize)
      : Promise.resolve([]),
    options.policyRegistry && options.policyRegistry !== zeroAddress
      ? syncPolicyRecordsWithClient(publicClient, options.policyRegistry, options.fromBlock, options.toBlock, options.blockChunkSize)
      : Promise.resolve([]),
    options.actionAttestation !== zeroAddress
      ? syncActionRecordsWithClient(publicClient, options.actionAttestation, options.fromBlock, options.toBlock, options.blockChunkSize)
      : Promise.resolve([]),
  ]);

  return { agents, policies, actions };
}

export async function syncActionRecords(options: SyncOptions): Promise<IndexedActionRecord[]> {
  const publicClient = createPublicClient({
    chain: mantleSepolia,
    transport: http(options.rpcUrl),
  });

  return syncActionRecordsWithClient(publicClient, options.actionAttestation, options.fromBlock, options.toBlock, options.blockChunkSize);
}

async function syncAgentRecordsWithClient(
  publicClient: PublicClient,
  agentRegistry: Address,
  fromBlock: bigint,
  toBlock?: bigint | "latest",
  blockChunkSize = defaultBlockChunkSize,
): Promise<IndexedAgentRecord[]> {
  const logs = await getContractEventsChunked<AgentRegisteredLog>(publicClient, {
    address: agentRegistry,
    abi: agentRegistryAbi,
    eventName: "AgentRegistered",
    fromBlock,
    toBlock: toBlock ?? "latest",
  }, blockChunkSize);

  return logs.map((log) => {
    const args = log.args;
    return {
      agentId: args.agentId!.toString(),
      owner: args.owner!,
      metadataURI: args.metadataURI!,
      transactionHash: log.transactionHash!,
      blockNumber: log.blockNumber!.toString(),
    };
  });
}

async function syncPolicyRecordsWithClient(
  publicClient: PublicClient,
  policyRegistry: Address,
  fromBlock: bigint,
  toBlock?: bigint | "latest",
  blockChunkSize = defaultBlockChunkSize,
): Promise<IndexedPolicyRecord[]> {
  const [createdLogs, updatedLogs, targetLogs, selectorLogs] = await Promise.all([
    getContractEventsChunked<PolicyCreatedLog>(publicClient, {
      address: policyRegistry,
      abi: policyRegistryAbi,
      eventName: "PolicyCreated",
      fromBlock,
      toBlock: toBlock ?? "latest",
    }, blockChunkSize),
    getContractEventsChunked<PolicyUpdatedLog>(publicClient, {
      address: policyRegistry,
      abi: policyRegistryAbi,
      eventName: "PolicyUpdated",
      fromBlock,
      toBlock: toBlock ?? "latest",
    }, blockChunkSize),
    getContractEventsChunked<TargetPermissionLog>(publicClient, {
      address: policyRegistry,
      abi: policyRegistryAbi,
      eventName: "TargetPermissionUpdated",
      fromBlock,
      toBlock: toBlock ?? "latest",
    }, blockChunkSize),
    getContractEventsChunked<SelectorPermissionLog>(publicClient, {
      address: policyRegistry,
      abi: policyRegistryAbi,
      eventName: "SelectorPermissionUpdated",
      fromBlock,
      toBlock: toBlock ?? "latest",
    }, blockChunkSize),
  ]);

  const records: Array<IndexedPolicyRecord & { logIndex: number }> = [
    ...createdLogs.map((log) => {
      const args = log.args;
      return {
        policyId: args.policyId!.toString(),
        agentId: args.agentId!.toString(),
        owner: args.owner!,
        maxNativeValue: args.maxNativeValue!.toString(),
        maxSlippageBps: Number(args.maxSlippageBps!),
        active: true,
        transactionHash: log.transactionHash!,
        blockNumber: log.blockNumber!.toString(),
        logIndex: Number(log.logIndex ?? 0),
      };
    }),
    ...updatedLogs.map((log) => {
      const args = log.args;
      return {
        policyId: args.policyId!.toString(),
        maxNativeValue: args.maxNativeValue!.toString(),
        maxSlippageBps: Number(args.maxSlippageBps!),
        active: args.active!,
        transactionHash: log.transactionHash!,
        blockNumber: log.blockNumber!.toString(),
        logIndex: Number(log.logIndex ?? 0),
      };
    }),
    ...targetLogs.map((log) => {
      const args = log.args;
      return {
        policyId: args.policyId!.toString(),
        targetPermissions: [{ target: args.target!, allowed: args.allowed! }],
        transactionHash: log.transactionHash!,
        blockNumber: log.blockNumber!.toString(),
        logIndex: Number(log.logIndex ?? 0),
      };
    }),
    ...selectorLogs.map((log) => {
      const args = log.args;
      return {
        policyId: args.policyId!.toString(),
        selectorPermissions: [{ selector: args.selector! as Hex, allowed: args.allowed! }],
        transactionHash: log.transactionHash!,
        blockNumber: log.blockNumber!.toString(),
        logIndex: Number(log.logIndex ?? 0),
      };
    }),
  ];

  return records
    .sort((a, b) => Number(BigInt(a.blockNumber) - BigInt(b.blockNumber)) || a.logIndex - b.logIndex)
    .map(({ logIndex: _logIndex, ...record }) => record);
}

async function syncActionRecordsWithClient(
  publicClient: PublicClient,
  actionAttestation: Address,
  fromBlock: bigint,
  toBlock?: bigint | "latest",
  blockChunkSize = defaultBlockChunkSize,
): Promise<IndexedActionRecord[]> {
  const logs = await getContractEventsChunked<ActionCheckedLog>(publicClient, {
    address: actionAttestation,
    abi: actionAttestationAbi,
    eventName: "ActionChecked",
    fromBlock,
    toBlock: toBlock ?? "latest",
  }, blockChunkSize);

  return logs
    .map((log): IndexedActionRecord | null => {
      const parsed = parseActionCheckedArgs(log.args);
      if (!parsed) return null;
      return {
        ...stringifyActionChecked(parsed),
        transactionHash: log.transactionHash!,
        blockNumber: log.blockNumber!.toString(),
      };
    })
    .filter((record): record is IndexedActionRecord => record !== null);
}

async function getContractEventsChunked<TLog>(
  publicClient: PublicClient,
  request: ContractEventsRequest,
  blockChunkSize: bigint,
): Promise<TLog[]> {
  const safeBlockChunkSize = normalizeBlockChunkSize(blockChunkSize);
  const fromBlock = request.fromBlock ?? 0n;
  const latestBlock =
    request.toBlock === undefined || request.toBlock === "latest"
      ? await withRetry(() => publicClient.getBlockNumber())
      : request.toBlock;

  if (typeof fromBlock !== "bigint" || typeof latestBlock !== "bigint" || fromBlock > latestBlock) {
    return [];
  }

  const logs: TLog[] = [];
  for (let start = fromBlock; start <= latestBlock; start += safeBlockChunkSize) {
    const end = start + safeBlockChunkSize - 1n > latestBlock ? latestBlock : start + safeBlockChunkSize - 1n;
    const chunk = await withRetry(() =>
      publicClient.getContractEvents({
        ...request,
        fromBlock: start,
        toBlock: end,
      } as ContractEventsRequest),
    );
    logs.push(...(chunk as TLog[]));
  }

  return logs;
}

function normalizeBlockChunkSize(value: bigint): bigint {
  if (value <= 0n) return defaultBlockChunkSize;
  return value > maxRpcBlockRange ? maxRpcBlockRange : value;
}

async function withRetry<T>(operation: () => Promise<T>, retries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isRetryable(error)) throw error;
      await sleep(300 * 2 ** attempt);
    }
  }
  throw lastError;
}

function isRetryable(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("rate limit") || message.includes("too many requests") || message.includes("timeout") || message.includes("429") || message.includes("503");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
