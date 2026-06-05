import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createLogger, deployedAddresses, mantleSepolia } from "@interlock/shared";
import { InterlockFirewall } from "@interlock/firewall-sdk";
import {
  buildAgentDetail,
  buildAgentSummaries,
  buildAnalyticsSummary,
  buildBenchmarkSummary,
  buildPolicyDetail,
  buildPolicySummaries,
  buildRecorderStatus,
  findAction,
} from "./api-model.js";
import { ActionStore } from "./store.js";
import { SqliteActionStore } from "./sqlite-store.js";
import { syncIndexerRecords } from "./sync.js";
import type { ActionFilters, ActionPage, ActionStoreLike, IndexerConfig, SyncResult } from "./types.js";
import type { ActionProposal, ActionProposalStatus, YieldDataPoint } from "./types.js";
import { createWebhookDispatcher, loadWebhookConfig } from "./webhooks.js";
import { getAddress, isAddress, isHex, type Address, type Hex } from "viem";

const log = createLogger("indexer");

export function loadConfig(): IndexerConfig {
  const agentRegistry =
    (process.env.AGENT_REGISTRY as `0x${string}` | undefined) ??
    deployedAddresses.mantleSepolia.agentRegistry;
  const policyRegistry =
    (process.env.POLICY_REGISTRY as `0x${string}` | undefined) ??
    deployedAddresses.mantleSepolia.policyRegistry;
  const actionAttestation =
    (process.env.ACTION_ATTESTATION as `0x${string}` | undefined) ??
    deployedAddresses.mantleSepolia.actionAttestation;

  return {
    rpcUrl: process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0],
    agentRegistry,
    policyRegistry,
    actionAttestation,
    fromBlock: BigInt(process.env.FROM_BLOCK ?? "0"),
    port: Number(process.env.PORT ?? "8787"),
    dbPath: process.env.INDEXER_DB_PATH ?? defaultDeploymentDbPath(actionAttestation),
    autoSync: process.env.AUTO_SYNC !== "false",
    syncIntervalMs: Number(process.env.SYNC_INTERVAL_MS ?? "60000"),
    blockChunkSize: BigInt(process.env.INDEXER_BLOCK_CHUNK_SIZE ?? "9000"),
    webhookUrl: process.env.WEBHOOK_URL,
    webhookSecret: process.env.WEBHOOK_SECRET,
    webhookEvents: (process.env.WEBHOOK_EVENTS ?? "block,simulation_failed").split(",").map((event) => event.trim()).filter(Boolean),
  };
}

function defaultDeploymentDbPath(actionAttestation: string) {
  return `.interlock-indexer-${actionAttestation.toLowerCase().slice(2, 10)}.sqlite`;
}

export function createIndexerServer(config: IndexerConfig, store: ActionStoreLike = new ActionStore()) {
  let nextFromBlock = config.fromBlock;
  let lastSyncError: string | undefined;
  let lastSyncStartedAt: string | undefined;
  let lastSyncCompletedAt: string | undefined;
  let lastSyncedCount = 0;
  let syncErrorsTotal = 0;
  let lastSyncDurationMs = 0;
  let inFlightSync: Promise<SyncResult> | undefined;
  let syncTimer: ReturnType<typeof setInterval> | undefined;
  const webhookDispatcher = createWebhookDispatcher({
    ...loadWebhookConfig(),
    url: config.webhookUrl,
    secret: config.webhookSecret,
    events: config.webhookEvents.filter((event): event is "allow" | "block" | "simulation_failed" =>
      ["allow", "block", "simulation_failed"].includes(event),
    ),
  });

  async function sync() {
    if (inFlightSync) return inFlightSync;

    const startedMs = Date.now();
    inFlightSync = (async () => {
      lastSyncStartedAt = new Date().toISOString();
      log.info("sync start", { fromBlock: nextFromBlock.toString() });
      const records = await syncIndexerRecords({
        rpcUrl: config.rpcUrl,
        agentRegistry: config.agentRegistry,
        policyRegistry: config.policyRegistry,
        actionAttestation: config.actionAttestation,
        fromBlock: nextFromBlock,
        blockChunkSize: config.blockChunkSize,
      });
      store.upsertAgents(records.agents);
      store.upsertPolicies(records.policies);
      store.upsertMany(records.actions);
      await webhookDispatcher.deliverActions(records.actions).catch(() => undefined);
      const latest = store.latestBlock();
      if (latest >= nextFromBlock) {
        nextFromBlock = latest + 1n;
      }
      lastSyncedCount = records.agents.length + records.policies.length + records.actions.length;
      lastSyncCompletedAt = new Date().toISOString();
      lastSyncDurationMs = Date.now() - startedMs;
      lastSyncError = undefined;
      log.info("sync complete", {
        synced: lastSyncedCount,
        actions: records.actions.length,
        nextFromBlock: nextFromBlock.toString(),
        durationMs: lastSyncDurationMs,
      });
      return records;
    })();

    try {
      return await inFlightSync;
    } catch (error) {
      lastSyncError = error instanceof Error ? error.message : "Unknown sync error";
      syncErrorsTotal += 1;
      lastSyncDurationMs = Date.now() - startedMs;
      log.error("sync failed", { error: lastSyncError });
      throw error;
    } finally {
      inFlightSync = undefined;
    }
  }

  function startAutoSync() {
    if (syncTimer || !config.autoSync || config.syncIntervalMs <= 0) return;

    void sync().catch(() => undefined);
    syncTimer = setInterval(() => {
      void sync().catch(() => undefined);
    }, config.syncIntervalMs);
    syncTimer.unref?.();
  }

  function stopAutoSync() {
    if (!syncTimer) return;
    clearInterval(syncTimer);
    syncTimer = undefined;
  }

  const server = createServer(async (req, res) => {
    try {
      await route(req, res, store, sync, () => ({
        rpcUrl: config.rpcUrl,
        agentRegistry: config.agentRegistry,
        policyRegistry: config.policyRegistry,
        actionAttestation: config.actionAttestation,
        nextFromBlock,
        lastSyncError,
        lastSyncStartedAt,
        lastSyncCompletedAt,
        lastSyncedCount,
        syncErrorsTotal,
        lastSyncDurationMs,
        autoSync: config.autoSync,
        syncIntervalMs: config.syncIntervalMs,
        syncing: Boolean(inFlightSync),
        storage: store instanceof SqliteActionStore ? config.dbPath : "memory",
        blockChunkSize: config.blockChunkSize,
        webhook: webhookDispatcher.state,
      }));
    } catch (error) {
      lastSyncError = error instanceof Error ? error.message : "Unknown server error";
      json(res, 500, { error: lastSyncError });
    }
  });

  return { server, store, sync, startAutoSync, stopAutoSync };
}

async function route(
  req: IncomingMessage,
  res: ServerResponse,
  store: ActionStoreLike,
  sync: () => Promise<SyncResult>,
  state: () => {
    rpcUrl: string;
    agentRegistry: string;
    policyRegistry: string;
    actionAttestation: string;
    nextFromBlock: bigint;
    lastSyncError?: string;
    lastSyncStartedAt?: string;
    lastSyncCompletedAt?: string;
    lastSyncedCount?: number;
    syncErrorsTotal?: number;
    lastSyncDurationMs?: number;
    autoSync?: boolean;
    syncIntervalMs?: number;
    syncing?: boolean;
    storage?: string;
    blockChunkSize?: bigint;
    webhook?: ReturnType<typeof createWebhookDispatcher>["state"];
  },
) {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "OPTIONS") {
    empty(res, 204);
    return;
  }

  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, {
      ok: true,
      nextFromBlock: state().nextFromBlock.toString(),
      lastSyncError: state().lastSyncError,
      lastSyncStartedAt: state().lastSyncStartedAt,
      lastSyncCompletedAt: state().lastSyncCompletedAt,
      lastSyncedCount: state().lastSyncedCount,
      autoSync: state().autoSync,
      syncIntervalMs: state().syncIntervalMs,
      syncing: state().syncing,
      storage: state().storage,
      blockChunkSize: state().blockChunkSize?.toString(),
      webhook: state().webhook,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/metrics") {
    const s = state();
    const actionsTotal = store.count();
    const nextBlock = s.nextFromBlock;
    const lastSyncedBlock = nextBlock > 0n ? nextBlock - 1n : 0n;
    const metrics = [
      "# HELP interlock_up Indexer process up.",
      "# TYPE interlock_up gauge",
      "interlock_up 1",
      "# HELP interlock_last_synced_block Highest block synced.",
      "# TYPE interlock_last_synced_block gauge",
      `interlock_last_synced_block ${lastSyncedBlock.toString()}`,
      "# HELP interlock_actions_indexed_total Total ActionChecked records stored.",
      "# TYPE interlock_actions_indexed_total gauge",
      `interlock_actions_indexed_total ${actionsTotal}`,
      "# HELP interlock_sync_errors_total Total sync failures since start.",
      "# TYPE interlock_sync_errors_total counter",
      `interlock_sync_errors_total ${s.syncErrorsTotal ?? 0}`,
      "# HELP interlock_sync_duration_ms Duration of the last sync in milliseconds.",
      "# TYPE interlock_sync_duration_ms gauge",
      `interlock_sync_duration_ms ${s.lastSyncDurationMs ?? 0}`,
      "# HELP interlock_syncing Whether a sync is currently in flight.",
      "# TYPE interlock_syncing gauge",
      `interlock_syncing ${s.syncing ? 1 : 0}`,
      "",
    ].join("\n");
    res.writeHead(200, { "content-type": "text/plain; version=0.0.4", "access-control-allow-origin": "*" });
    res.end(metrics);
    return;
  }

  if (req.method === "POST" && url.pathname === "/sync") {
    const records = await sync();
    json(res, 200, {
      synced: records.agents.length + records.policies.length + records.actions.length,
      agents: records.agents.length,
      policies: records.policies.length,
      actions: records.actions.length,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/proposals") {
    json(res, 200, {
      proposals: store.listProposals({
        agentId: url.searchParams.get("agentId") ?? undefined,
        policyId: url.searchParams.get("policyId") ?? undefined,
        status: parseProposalStatus(url.searchParams.get("status")),
        limit: parsePositiveInt(url.searchParams.get("limit"), 100, 500),
        offset: parsePositiveInt(url.searchParams.get("offset"), 0, 100000),
      }),
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/proposals") {
    const body = await readJson(req);
    const proposal = createProposalFromBody(body);
    store.upsertProposal(proposal);
    json(res, 201, { proposal });
    return;
  }

  const proposalMatch = url.pathname.match(/^\/proposals\/([^/]+)$/);
  if (req.method === "GET" && proposalMatch) {
    const proposal = store.getProposal(proposalMatch[1]);
    if (!proposal) {
      json(res, 404, { error: "Proposal not found" });
      return;
    }
    json(res, 200, { proposal });
    return;
  }

  const proposalPreflightMatch = url.pathname.match(/^\/proposals\/([^/]+)\/preflight$/);
  if (req.method === "POST" && proposalPreflightMatch) {
    const proposal = store.getProposal(proposalPreflightMatch[1]);
    if (!proposal) {
      json(res, 404, { error: "Proposal not found" });
      return;
    }
    const transitionError = validateProposalTransition(proposal.status, "preflighted");
    if (transitionError) {
      json(res, 409, { error: transitionError });
      return;
    }
    const firewall = new InterlockFirewall({
      chain: mantleSepolia,
      rpcUrl: state().rpcUrl,
      contracts: {
        agentRegistry: state().agentRegistry as Address,
        policyRegistry: state().policyRegistry as Address,
        actionAttestation: state().actionAttestation as Address,
      },
    });
    const decision = await firewall.checkAction({
      agentId: BigInt(proposal.agentId),
      policyId: BigInt(proposal.policyId),
      tx: { to: proposal.target, value: BigInt(proposal.value), data: proposal.calldata },
      metadata: { intent: proposal.intent },
    });
    const nextStatus = decision.allowed ? "preflighted" : "blocked";
    const decisionTransitionError = validateProposalTransition(proposal.status, nextStatus);
    if (decisionTransitionError) {
      json(res, 409, { error: decisionTransitionError });
      return;
    }
    const updated = updateProposal(proposal, {
      status: nextStatus,
      decision: decision.decision,
      reasonCode: decision.reasonCode,
    });
    store.upsertProposal(updated);
    json(res, 200, { proposal: updated, decision: jsonSafeDecision(decision) });
    return;
  }

  const proposalMarkExecutedMatch = url.pathname.match(/^\/proposals\/([^/]+)\/mark-executed$/);
  if (req.method === "POST" && proposalMarkExecutedMatch) {
    const proposal = store.getProposal(proposalMarkExecutedMatch[1]);
    if (!proposal) {
      json(res, 404, { error: "Proposal not found" });
      return;
    }
    const body = await readJson(req);
    const txHash = typeof body.txHash === "string" && isHex(body.txHash) ? body.txHash as Hex : undefined;
    const transitionError = validateProposalTransition(proposal.status, "executed");
    if (transitionError) {
      json(res, 409, { error: transitionError });
      return;
    }
    const updated = updateProposal(proposal, { status: "executed", txHash });
    store.upsertProposal(updated);
    json(res, 200, { proposal: updated });
    return;
  }

  const proposalRecordMatch = url.pathname.match(/^\/proposals\/([^/]+)\/record$/);
  if (req.method === "POST" && proposalRecordMatch) {
    const proposal = store.getProposal(proposalRecordMatch[1]);
    if (!proposal) {
      json(res, 404, { error: "Proposal not found" });
      return;
    }
    const body = await readJson(req);
    const actionCheckId = typeof body.actionCheckId === "string" ? body.actionCheckId : undefined;
    const txHash = typeof body.txHash === "string" && isHex(body.txHash) ? body.txHash as Hex : proposal.txHash;
    const transitionError = validateProposalTransition(proposal.status, "recorded");
    if (transitionError) {
      json(res, 409, { error: transitionError });
      return;
    }
    const updated = updateProposal(proposal, { status: "recorded", actionCheckId, txHash });
    store.upsertProposal(updated);
    json(res, 200, {
      proposal: updated,
      note: "Recorder marked this proposal as recorded from supplied real attestation metadata. It did not fabricate an on-chain transaction.",
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/ecosystem/yields") {
    json(res, 200, { source: "defillama", yields: store.listYields() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/ecosystem/yields/sync") {
    const points = await fetchDefiLlamaMantleYields();
    store.upsertYields(points);
    json(res, 200, { source: "defillama", synced: points.length, yields: points });
    return;
  }

  if (req.method === "GET" && url.pathname === "/actions") {
    json(res, 200, listActionResponse(store, filtersFrom(url)));
    return;
  }

  const actionDetailMatch = url.pathname.match(/^\/actions\/([^/]+)$/);
  if (req.method === "GET" && actionDetailMatch) {
    const action = findAction(store.list(), actionDetailMatch[1]);
    if (!action) {
      json(res, 404, { error: "Action not found" });
      return;
    }
    json(res, 200, action);
    return;
  }

  if (req.method === "GET" && url.pathname === "/agents") {
    json(res, 200, { agents: buildAgentSummaries(store.list(), store.listAgents()) });
    return;
  }

  const agentDetailMatch = url.pathname.match(/^\/agents\/([^/]+)$/);
  if (req.method === "GET" && agentDetailMatch) {
    const agent = buildAgentDetail(store.list(), agentDetailMatch[1], store.getAgent(agentDetailMatch[1]));
    if (!agent) {
      json(res, 404, { error: "Agent not found" });
      return;
    }
    json(res, 200, agent);
    return;
  }

  const agentActionsMatch = url.pathname.match(/^\/agents\/([^/]+)\/actions$/);
  if (req.method === "GET" && agentActionsMatch) {
    json(res, 200, listActionResponse(store, { ...filtersFrom(url), agentId: agentActionsMatch[1] }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/policies") {
    json(res, 200, { policies: buildPolicySummaries(store.list(), store.listPolicies()) });
    return;
  }

  const policyDetailMatch = url.pathname.match(/^\/policies\/([^/]+)$/);
  if (req.method === "GET" && policyDetailMatch) {
    const policy = buildPolicyDetail(store.list(), policyDetailMatch[1], store.getPolicy(policyDetailMatch[1]));
    if (!policy) {
      json(res, 404, { error: "Policy not found" });
      return;
    }
    json(res, 200, policy);
    return;
  }

  const policyActionsMatch = url.pathname.match(/^\/policies\/([^/]+)\/actions$/);
  if (req.method === "GET" && policyActionsMatch) {
    json(res, 200, listActionResponse(store, { ...filtersFrom(url), policyId: policyActionsMatch[1] }));
    return;
  }

  const statsMatch = url.pathname.match(/^\/stats\/agents\/([^/]+)$/);
  if (req.method === "GET" && statsMatch) {
    json(res, 200, store.stats(statsMatch[1]));
    return;
  }

  // One-shot dashboard payload: mirrors the web app's RpcHistorySnapshot shape so the
  // dashboard can read everything in a single request instead of ~70 RPC round-trips.
  if (req.method === "GET" && url.pathname === "/snapshot") {
    const agentId = url.searchParams.get("agentId") ?? undefined;
    const all = store.list();
    const snapshot = state();
    json(res, 200, {
      health: {
        ok: true,
        nextFromBlock: snapshot.nextFromBlock.toString(),
        lastSyncError: snapshot.lastSyncError,
        lastSyncStartedAt: snapshot.lastSyncStartedAt,
        lastSyncCompletedAt: snapshot.lastSyncCompletedAt,
        lastSyncedCount: snapshot.lastSyncedCount,
        autoSync: snapshot.autoSync,
        syncIntervalMs: snapshot.syncIntervalMs,
        syncing: snapshot.syncing,
        storage: snapshot.storage,
        blockChunkSize: snapshot.blockChunkSize?.toString(),
        webhook: snapshot.webhook,
      },
      agents: buildAgentSummaries(all, store.listAgents()),
      policies: buildPolicySummaries(all, store.listPolicies()),
      actions: agentId ? store.list({ agentId, limit: 50 }) : store.list({ limit: 50 }),
      stats: agentId ? store.stats(agentId) : undefined,
      proposals: agentId ? store.listProposals({ agentId, limit: 20 }) : store.listProposals({ limit: 20 }),
      ecosystemYields: store.listYields().slice(0, 20),
    });
    return;
  }

  if (req.method === "GET" && (url.pathname === "/status" || url.pathname === "/network")) {
    const snapshot = state();
    const status = buildRecorderStatus({
      version: "0.1.0",
      network: {
        name: mantleSepolia.name,
        chainId: mantleSepolia.id,
        rpcUrl: snapshot.rpcUrl,
      },
      contracts: {
        agentRegistry: snapshot.agentRegistry,
        policyRegistry: snapshot.policyRegistry,
        actionAttestation: snapshot.actionAttestation,
      },
      sync: {
        nextFromBlock: snapshot.nextFromBlock.toString(),
        lastSyncError: snapshot.lastSyncError,
        lastSyncStartedAt: snapshot.lastSyncStartedAt,
        lastSyncCompletedAt: snapshot.lastSyncCompletedAt,
        lastSyncedCount: snapshot.lastSyncedCount,
        autoSync: snapshot.autoSync,
        syncIntervalMs: snapshot.syncIntervalMs,
        syncing: snapshot.syncing,
        blockChunkSize: snapshot.blockChunkSize,
      },
      storage: snapshot.storage,
      actions: store.list(),
      agents: store.listAgents(),
      policies: store.listPolicies(),
      latestIndexedBlock: store.latestBlock(),
      webhook: snapshot.webhook,
    });
    json(res, 200, url.pathname === "/network" ? { network: status.network, contracts: status.contracts, records: status.records } : status);
    return;
  }

  const benchmarkMatch = url.pathname.match(/^\/benchmark\/([^/]+)$/);
  if (req.method === "GET" && benchmarkMatch) {
    json(res, 200, buildBenchmarkSummary(store.list(), benchmarkMatch[1]));
    return;
  }

  if (req.method === "GET" && url.pathname === "/analytics") {
    json(res, 200, buildAnalyticsSummary(store.list()));
    return;
  }

  const agentAnalyticsMatch = url.pathname.match(/^\/analytics\/agents\/([^/]+)$/);
  if (req.method === "GET" && agentAnalyticsMatch) {
    json(res, 200, buildAnalyticsSummary(store.list(), { scope: "agent", agentId: agentAnalyticsMatch[1] }));
    return;
  }

  const policyAnalyticsMatch = url.pathname.match(/^\/analytics\/policies\/([^/]+)$/);
  if (req.method === "GET" && policyAnalyticsMatch) {
    json(res, 200, buildAnalyticsSummary(store.list(), { scope: "policy", policyId: policyAnalyticsMatch[1] }));
    return;
  }

  json(res, 404, { error: "Not found" });
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // handled below
  }
  throw new Error("Request body must be a JSON object.");
}

function createProposalFromBody(body: Record<string, unknown>): ActionProposal {
  const agentId = positiveString(body.agentId, "agentId");
  const policyId = positiveString(body.policyId, "policyId");
  const target = addressField(body.target, "target");
  const value = nonNegativeString(body.value ?? "0", "value");
  const calldata = calldataField(body.calldata ?? body.data ?? "0x", "calldata");
  const intent = typeof body.intent === "string" && body.intent.trim() ? body.intent.trim() : "Agent proposed action";
  const now = new Date().toISOString();
  return {
    proposalId: typeof body.proposalId === "string" && body.proposalId.trim() ? body.proposalId.trim() : randomUUID(),
    agentId,
    policyId,
    status: "proposed",
    target,
    value,
    calldata,
    intent,
    createdAt: now,
    updatedAt: now,
  };
}

function updateProposal(proposal: ActionProposal, update: Partial<ActionProposal>): ActionProposal {
  return { ...proposal, ...update, updatedAt: new Date().toISOString() };
}

function validateProposalTransition(from: ActionProposalStatus, to: ActionProposalStatus): string | undefined {
  const allowed: Record<ActionProposalStatus, ActionProposalStatus[]> = {
    proposed: ["preflighted", "blocked", "rejected"],
    preflighted: ["approved", "executed", "recorded", "blocked", "rejected"],
    approved: ["executed", "recorded", "rejected"],
    executed: ["recorded"],
    blocked: ["recorded"],
    recorded: [],
    rejected: [],
  };
  if (from === to) return undefined;
  if (allowed[from]?.includes(to)) return undefined;
  return `Invalid proposal transition: ${from} -> ${to}.`;
}

function parseProposalStatus(value: string | null): ActionProposalStatus | undefined {
  if (!value) return undefined;
  const valid = ["proposed", "preflighted", "approved", "executed", "recorded", "blocked", "rejected"];
  return valid.includes(value) ? value as ActionProposalStatus : undefined;
}

function positiveString(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) throw new Error(`${name} must be a positive integer string.`);
  return value;
}

function nonNegativeString(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^\d+$/.test(value)) throw new Error(`${name} must be a non-negative integer string.`);
  return value;
}

function addressField(value: unknown, name: string): Address {
  if (typeof value !== "string" || !isAddress(value)) throw new Error(`${name} must be an EVM address.`);
  return getAddress(value);
}

function calldataField(value: unknown, name: string): Hex {
  if (typeof value !== "string" || !/^0x([0-9a-fA-F]{2})*$/.test(value)) throw new Error(`${name} must be 0x or even-length hex calldata.`);
  return value as Hex;
}

function jsonSafeDecision(decision: Awaited<ReturnType<InterlockFirewall["checkAction"]>>) {
  return JSON.parse(JSON.stringify(decision, (_key, value) => typeof value === "bigint" ? value.toString() : value));
}

async function fetchDefiLlamaMantleYields(): Promise<YieldDataPoint[]> {
  const response = await fetch("https://yields.llama.fi/pools");
  if (!response.ok) throw new Error(`DefiLlama yields request failed: ${response.status}`);
  const body = await response.json() as { data?: Array<Record<string, unknown>> };
  const fetchedAt = new Date().toISOString();
  return (body.data ?? [])
    .filter((pool) => String(pool.chain ?? "").toLowerCase().includes("mantle") || String(pool.project ?? "").toLowerCase().includes("mantle"))
    .slice(0, 50)
    .map((pool) => ({
      source: "defillama" as const,
      poolId: String(pool.pool ?? `${pool.chain}:${pool.project}:${pool.symbol}`),
      chain: typeof pool.chain === "string" ? pool.chain : undefined,
      project: String(pool.project ?? "unknown"),
      symbol: typeof pool.symbol === "string" ? pool.symbol : undefined,
      tvlUsd: typeof pool.tvlUsd === "number" ? pool.tvlUsd : undefined,
      apy: typeof pool.apy === "number" ? pool.apy : undefined,
      apyBase: typeof pool.apyBase === "number" ? pool.apyBase : undefined,
      apyReward: typeof pool.apyReward === "number" ? pool.apyReward : undefined,
      riskNotes: buildYieldRiskNotes(pool),
      fetchedAt,
    }));
}

function buildYieldRiskNotes(pool: Record<string, unknown>): string[] {
  const notes: string[] = [];
  if (typeof pool.tvlUsd === "number" && pool.tvlUsd < 100_000) notes.push("Low TVL; require stricter limits or manual approval.");
  if (typeof pool.apy === "number" && pool.apy > 50) notes.push("High APY; treat as advisory risk before execution.");
  return notes;
}

function filtersFrom(url: URL): ActionFilters {
  return {
    agentId: url.searchParams.get("agentId") ?? undefined,
    policyId: url.searchParams.get("policyId") ?? undefined,
    decision: (url.searchParams.get("decision") as ActionFilters["decision"]) ?? undefined,
    reasonCode: (url.searchParams.get("reasonCode") as ActionFilters["reasonCode"]) ?? undefined,
    target: url.searchParams.get("target") ?? undefined,
    selector: url.searchParams.get("selector") ?? undefined,
    limit: parsePositiveInt(url.searchParams.get("limit"), 100, 500),
    offset: parsePositiveInt(url.searchParams.get("offset"), 0, 100000),
  };
}

function listActionResponse(store: ActionStoreLike, filters: ActionFilters) {
  const actions = store.list(filters);
  const total = store.count(filters);
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;
  const page: ActionPage = {
    total,
    limit,
    offset,
    nextOffset: offset + actions.length < total ? offset + actions.length : undefined,
  };
  return { actions, page };
}

function parsePositiveInt(value: string | null, defaultValue: number, max: number) {
  if (value === null || value === "") return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return defaultValue;
  return Math.min(parsed, max);
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-origin": "*",
    "content-type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(body, null, 2));
}

function empty(res: ServerResponse, status: number) {
  res.writeHead(status, {
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-origin": "*",
  });
  res.end();
}

function isDirectRun() {
  const modulePath = fileURLToPath(import.meta.url).replaceAll("\\", "/");
  return process.argv.some((arg) => {
    const normalized = arg.replaceAll("\\", "/");
    return normalized === modulePath || normalized.endsWith("/src/server.ts") || normalized.endsWith("/dist/server.js");
  });
}

if (isDirectRun()) {
  // Process-level safety net: log, don't die silently. An unhandled rejection is logged and the
  // server keeps running; a truly fatal uncaught exception is logged and we exit non-zero so a
  // supervisor (Docker/systemd/Railway) restarts the process.
  process.on("unhandledRejection", (reason) => {
    log.error("unhandled rejection", { reason: reason instanceof Error ? reason.message : String(reason) });
  });
  process.on("uncaughtException", (error) => {
    log.error("uncaught exception — exiting for restart", { error: error.message });
    process.exit(1);
  });

  const config = loadConfig();
  const store = new SqliteActionStore(config.dbPath);
  const { server, startAutoSync, stopAutoSync } = createIndexerServer(config, store);
  server.listen(config.port, () => {
    log.info("indexer listening", { port: config.port, store: config.dbPath });
    if (config.autoSync) {
      log.info("auto sync enabled", { intervalMs: config.syncIntervalMs });
      startAutoSync();
    } else {
      log.info("auto sync disabled");
    }
  });
  server.on("close", stopAutoSync);
}
