import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
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

type ActionRow = {
  action_check_id: string;
  agent_id: string;
  policy_id: string;
  target: string;
  value: string;
  calldata_hash: string;
  selector: string;
  simulation_hash: string;
  decision: IndexedActionRecord["decision"];
  reason_code: IndexedActionRecord["reasonCode"];
  timestamp: string;
  transaction_hash: string;
  block_number: string;
};

type AgentRow = {
  agent_id: string;
  owner: string;
  metadata_uri: string;
  transaction_hash: string;
  block_number: string;
};

type PolicyRow = {
  policy_id: string;
  agent_id: string;
  owner: string;
  max_native_value: string;
  max_slippage_bps: number;
  active: number;
  allowed_targets: string;
  allowed_selectors: string;
  transaction_hash: string;
  block_number: string;
};

type ProposalRow = {
  proposal_id: string;
  agent_id: string;
  policy_id: string;
  status: ActionProposal["status"];
  target: string;
  value: string;
  calldata: string;
  intent: string;
  decision: ActionProposal["decision"] | null;
  reason_code: string | null;
  action_check_id: string | null;
  tx_hash: string | null;
  created_at: string;
  updated_at: string;
};

type YieldRow = {
  pool_id: string;
  source: "defillama";
  chain: string | null;
  project: string;
  symbol: string | null;
  tvl_usd: number | null;
  apy: number | null;
  apy_base: number | null;
  apy_reward: number | null;
  risk_notes: string;
  fetched_at: string;
};

export class SqliteActionStore implements ActionStoreLike {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    const dbPath = path === ":memory:" ? path : resolve(path);
    if (dbPath !== ":memory:") {
      mkdirSync(dirname(dbPath), { recursive: true });
    }

    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS action_records (
        action_check_id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        policy_id TEXT NOT NULL,
        target TEXT NOT NULL,
        value TEXT NOT NULL,
        calldata_hash TEXT NOT NULL,
        selector TEXT NOT NULL DEFAULT '0x00000000',
        simulation_hash TEXT NOT NULL,
        decision TEXT NOT NULL,
        reason_code TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        transaction_hash TEXT NOT NULL,
        block_number TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_action_records_agent_id ON action_records(agent_id);
      CREATE INDEX IF NOT EXISTS idx_action_records_policy_id ON action_records(policy_id);
      CREATE INDEX IF NOT EXISTS idx_action_records_decision ON action_records(decision);
      CREATE INDEX IF NOT EXISTS idx_action_records_reason_code ON action_records(reason_code);
      CREATE INDEX IF NOT EXISTS idx_action_records_target ON action_records(target);
      CREATE INDEX IF NOT EXISTS idx_action_records_selector ON action_records(selector);

      CREATE TABLE IF NOT EXISTS agent_records (
        agent_id TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        metadata_uri TEXT NOT NULL,
        transaction_hash TEXT NOT NULL,
        block_number TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_agent_records_owner ON agent_records(owner);

      CREATE TABLE IF NOT EXISTS policy_records (
        policy_id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        owner TEXT NOT NULL,
        max_native_value TEXT NOT NULL,
        max_slippage_bps INTEGER NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        allowed_targets TEXT NOT NULL DEFAULT '[]',
        allowed_selectors TEXT NOT NULL DEFAULT '[]',
        transaction_hash TEXT NOT NULL,
        block_number TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_policy_records_agent_id ON policy_records(agent_id);
      CREATE INDEX IF NOT EXISTS idx_policy_records_owner ON policy_records(owner);

      CREATE TABLE IF NOT EXISTS action_proposals (
        proposal_id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        policy_id TEXT NOT NULL,
        status TEXT NOT NULL,
        target TEXT NOT NULL,
        value TEXT NOT NULL,
        calldata TEXT NOT NULL,
        intent TEXT NOT NULL,
        decision TEXT,
        reason_code TEXT,
        action_check_id TEXT,
        tx_hash TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_action_proposals_agent_id ON action_proposals(agent_id);
      CREATE INDEX IF NOT EXISTS idx_action_proposals_policy_id ON action_proposals(policy_id);
      CREATE INDEX IF NOT EXISTS idx_action_proposals_status ON action_proposals(status);

      CREATE TABLE IF NOT EXISTS ecosystem_yields (
        pool_id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        chain TEXT,
        project TEXT NOT NULL,
        symbol TEXT,
        tvl_usd REAL,
        apy REAL,
        apy_base REAL,
        apy_reward REAL,
        risk_notes TEXT NOT NULL DEFAULT '[]',
        fetched_at TEXT NOT NULL
      );
    `);

    try {
      this.db.exec("ALTER TABLE action_records ADD COLUMN selector TEXT NOT NULL DEFAULT '0x00000000'");
    } catch {
      // Column already exists in databases created by the selector-aware schema.
    }
    try {
      this.db.exec("ALTER TABLE policy_records ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
    } catch {
      // Column already exists in databases created by the policy-lifecycle schema.
    }
    try {
      this.db.exec("ALTER TABLE policy_records ADD COLUMN allowed_targets TEXT NOT NULL DEFAULT '[]'");
    } catch {
      // Column already exists in databases created by the policy-lifecycle schema.
    }
    try {
      this.db.exec("ALTER TABLE policy_records ADD COLUMN allowed_selectors TEXT NOT NULL DEFAULT '[]'");
    } catch {
      // Column already exists in databases created by the policy-lifecycle schema.
    }
    this.db.exec("CREATE INDEX IF NOT EXISTS idx_action_records_selector ON action_records(selector)");
  }

  upsertMany(actions: IndexedActionRecord[]) {
    const insert = this.db.prepare(`
      INSERT INTO action_records (
        action_check_id,
        agent_id,
        policy_id,
        target,
        value,
        calldata_hash,
        selector,
        simulation_hash,
        decision,
        reason_code,
        timestamp,
        transaction_hash,
        block_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(action_check_id) DO UPDATE SET
        agent_id = excluded.agent_id,
        policy_id = excluded.policy_id,
        target = excluded.target,
        value = excluded.value,
        calldata_hash = excluded.calldata_hash,
        selector = excluded.selector,
        simulation_hash = excluded.simulation_hash,
        decision = excluded.decision,
        reason_code = excluded.reason_code,
        timestamp = excluded.timestamp,
        transaction_hash = excluded.transaction_hash,
        block_number = excluded.block_number
    `);

    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const action of actions) {
        insert.run(
          action.actionCheckId,
          action.agentId,
          action.policyId,
          action.target,
          action.value,
          action.calldataHash,
          action.selector,
          action.simulationHash,
          action.decision,
          action.reasonCode,
          action.timestamp,
          action.transactionHash,
          action.blockNumber,
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  upsertAgents(agents: IndexedAgentRecord[]) {
    const insert = this.db.prepare(`
      INSERT INTO agent_records (
        agent_id,
        owner,
        metadata_uri,
        transaction_hash,
        block_number
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(agent_id) DO UPDATE SET
        owner = excluded.owner,
        metadata_uri = excluded.metadata_uri,
        transaction_hash = excluded.transaction_hash,
        block_number = excluded.block_number
    `);

    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const agent of agents) {
        insert.run(agent.agentId, agent.owner, agent.metadataURI, agent.transactionHash, agent.blockNumber);
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  upsertPolicies(policies: IndexedPolicyRecord[]) {
    const insert = this.db.prepare(`
      INSERT INTO policy_records (
        policy_id,
        agent_id,
        owner,
        max_native_value,
        max_slippage_bps,
        active,
        allowed_targets,
        allowed_selectors,
        transaction_hash,
        block_number
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(policy_id) DO UPDATE SET
        agent_id = excluded.agent_id,
        owner = excluded.owner,
        max_native_value = excluded.max_native_value,
        max_slippage_bps = excluded.max_slippage_bps,
        active = excluded.active,
        allowed_targets = excluded.allowed_targets,
        allowed_selectors = excluded.allowed_selectors,
        transaction_hash = excluded.transaction_hash,
        block_number = excluded.block_number
    `);

    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const policy of policies) {
        const merged = mergePolicy(this.getPolicy(policy.policyId), policy);
        insert.run(
          merged.policyId,
          merged.agentId ?? "",
          merged.owner ?? "",
          merged.maxNativeValue ?? "0",
          merged.maxSlippageBps ?? 0,
          merged.active === false ? 0 : 1,
          JSON.stringify(merged.allowedTargets ?? []),
          JSON.stringify(merged.allowedSelectors ?? []),
          merged.transactionHash,
          merged.blockNumber,
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  list(filters: ActionFilters = {}) {
    const { where, params } = actionWhere(filters);
    const limit = filters.limit;
    const offset = filters.offset ?? 0;
    const pagination = limit === undefined ? "" : " LIMIT ? OFFSET ?";
    if (limit !== undefined) {
      params.push(limit, offset);
    }
    const rows = this.db
      .prepare(`SELECT * FROM action_records ${where} ORDER BY CAST(block_number AS INTEGER) DESC${pagination}`)
      .all(...params) as ActionRow[];

    return rows.map(rowToAction);
  }

  count(filters: ActionFilters = {}) {
    const { where, params } = actionWhere(filters);
    const row = this.db.prepare(`SELECT COUNT(*) AS count FROM action_records ${where}`).get(...params) as
      | { count?: number }
      | undefined;
    return Number(row?.count ?? 0);
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
    const rows = this.db
      .prepare("SELECT * FROM agent_records ORDER BY CAST(block_number AS INTEGER) DESC")
      .all() as AgentRow[];
    return rows.map(rowToAgent);
  }

  getAgent(agentId: string) {
    const row = this.db.prepare("SELECT * FROM agent_records WHERE agent_id = ?").get(agentId) as AgentRow | undefined;
    return row ? rowToAgent(row) : undefined;
  }

  listPolicies() {
    const rows = this.db
      .prepare("SELECT * FROM policy_records ORDER BY CAST(block_number AS INTEGER) DESC")
      .all() as PolicyRow[];
    return rows.map(rowToPolicy);
  }

  getPolicy(policyId: string) {
    const row = this.db.prepare("SELECT * FROM policy_records WHERE policy_id = ?").get(policyId) as PolicyRow | undefined;
    return row ? rowToPolicy(row) : undefined;
  }

  latestBlock() {
    const row = this.db.prepare(`
      SELECT block_number FROM (
        SELECT block_number FROM action_records
        UNION ALL
        SELECT block_number FROM agent_records
        UNION ALL
        SELECT block_number FROM policy_records
      )
      ORDER BY CAST(block_number AS INTEGER) DESC
      LIMIT 1
    `).get() as { block_number?: string } | undefined;
    return BigInt(row?.block_number ?? "0");
  }

  upsertProposal(proposal: ActionProposal) {
    this.db.prepare(`
      INSERT INTO action_proposals (
        proposal_id, agent_id, policy_id, status, target, value, calldata, intent,
        decision, reason_code, action_check_id, tx_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(proposal_id) DO UPDATE SET
        agent_id = excluded.agent_id,
        policy_id = excluded.policy_id,
        status = excluded.status,
        target = excluded.target,
        value = excluded.value,
        calldata = excluded.calldata,
        intent = excluded.intent,
        decision = excluded.decision,
        reason_code = excluded.reason_code,
        action_check_id = excluded.action_check_id,
        tx_hash = excluded.tx_hash,
        updated_at = excluded.updated_at
    `).run(
      proposal.proposalId,
      proposal.agentId,
      proposal.policyId,
      proposal.status,
      proposal.target,
      proposal.value,
      proposal.calldata,
      proposal.intent,
      proposal.decision ?? null,
      proposal.reasonCode ?? null,
      proposal.actionCheckId ?? null,
      proposal.txHash ?? null,
      proposal.createdAt,
      proposal.updatedAt,
    );
  }

  listProposals(filters: ProposalFilters = {}) {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filters.agentId) {
      clauses.push("agent_id = ?");
      params.push(filters.agentId);
    }
    if (filters.policyId) {
      clauses.push("policy_id = ?");
      params.push(filters.policyId);
    }
    if (filters.status) {
      clauses.push("status = ?");
      params.push(filters.status);
    }
    const limit = filters.limit;
    const offset = filters.offset ?? 0;
    const pagination = limit === undefined ? "" : " LIMIT ? OFFSET ?";
    if (limit !== undefined) params.push(limit, offset);
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db.prepare(`SELECT * FROM action_proposals ${where} ORDER BY updated_at DESC${pagination}`).all(...params) as ProposalRow[];
    return rows.map(rowToProposal);
  }

  getProposal(proposalId: string) {
    const row = this.db.prepare("SELECT * FROM action_proposals WHERE proposal_id = ?").get(proposalId) as ProposalRow | undefined;
    return row ? rowToProposal(row) : undefined;
  }

  upsertYields(points: YieldDataPoint[]) {
    const insert = this.db.prepare(`
      INSERT INTO ecosystem_yields (
        pool_id, source, chain, project, symbol, tvl_usd, apy, apy_base, apy_reward, risk_notes, fetched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(pool_id) DO UPDATE SET
        source = excluded.source,
        chain = excluded.chain,
        project = excluded.project,
        symbol = excluded.symbol,
        tvl_usd = excluded.tvl_usd,
        apy = excluded.apy,
        apy_base = excluded.apy_base,
        apy_reward = excluded.apy_reward,
        risk_notes = excluded.risk_notes,
        fetched_at = excluded.fetched_at
    `);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      for (const point of points) {
        insert.run(
          point.poolId,
          point.source,
          point.chain ?? null,
          point.project,
          point.symbol ?? null,
          point.tvlUsd ?? null,
          point.apy ?? null,
          point.apyBase ?? null,
          point.apyReward ?? null,
          JSON.stringify(point.riskNotes),
          point.fetchedAt,
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  listYields() {
    const rows = this.db.prepare("SELECT * FROM ecosystem_yields ORDER BY COALESCE(tvl_usd, 0) DESC").all() as YieldRow[];
    return rows.map(rowToYield);
  }

  close() {
    this.db.close();
  }
}

function actionWhere(filters: ActionFilters) {
  const clauses: string[] = [];
  const params: Array<string | number> = [];

  if (filters.agentId) {
    clauses.push("agent_id = ?");
    params.push(filters.agentId);
  }
  if (filters.policyId) {
    clauses.push("policy_id = ?");
    params.push(filters.policyId);
  }
  if (filters.decision) {
    clauses.push("decision = ?");
    params.push(filters.decision);
  }
  if (filters.reasonCode) {
    clauses.push("reason_code = ?");
    params.push(filters.reasonCode);
  }
  if (filters.target) {
    clauses.push("lower(target) = lower(?)");
    params.push(filters.target);
  }
  if (filters.selector) {
    clauses.push("lower(selector) = lower(?)");
    params.push(filters.selector);
  }

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
  };
}

function rowToAgent(row: AgentRow): IndexedAgentRecord {
  return {
    agentId: row.agent_id,
    owner: row.owner as IndexedAgentRecord["owner"],
    metadataURI: row.metadata_uri,
    transactionHash: row.transaction_hash as IndexedAgentRecord["transactionHash"],
    blockNumber: row.block_number,
  };
}

function rowToPolicy(row: PolicyRow): IndexedPolicyRecord {
  return {
    policyId: row.policy_id,
    agentId: row.agent_id || undefined,
    owner: (row.owner || undefined) as IndexedPolicyRecord["owner"],
    maxNativeValue: row.max_native_value,
    maxSlippageBps: row.max_slippage_bps,
    active: Boolean(row.active),
    allowedTargets: parseJsonArray(row.allowed_targets) as IndexedPolicyRecord["allowedTargets"],
    allowedSelectors: parseJsonArray(row.allowed_selectors) as IndexedPolicyRecord["allowedSelectors"],
    transactionHash: row.transaction_hash as IndexedPolicyRecord["transactionHash"],
    blockNumber: row.block_number,
  };
}

function rowToAction(row: ActionRow): IndexedActionRecord {
  return {
    actionCheckId: row.action_check_id,
    agentId: row.agent_id,
    policyId: row.policy_id,
    target: row.target as IndexedActionRecord["target"],
    value: row.value,
    calldataHash: row.calldata_hash as IndexedActionRecord["calldataHash"],
    selector: row.selector as IndexedActionRecord["selector"],
    simulationHash: row.simulation_hash as IndexedActionRecord["simulationHash"],
    decision: row.decision,
    reasonCode: row.reason_code,
    timestamp: row.timestamp,
    transactionHash: row.transaction_hash as IndexedActionRecord["transactionHash"],
    blockNumber: row.block_number,
  };
}

function rowToProposal(row: ProposalRow): ActionProposal {
  return {
    proposalId: row.proposal_id,
    agentId: row.agent_id,
    policyId: row.policy_id,
    status: row.status,
    target: row.target as ActionProposal["target"],
    value: row.value,
    calldata: row.calldata as ActionProposal["calldata"],
    intent: row.intent,
    decision: row.decision ?? undefined,
    reasonCode: row.reason_code ?? undefined,
    actionCheckId: row.action_check_id ?? undefined,
    txHash: (row.tx_hash ?? undefined) as ActionProposal["txHash"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToYield(row: YieldRow): YieldDataPoint {
  return {
    source: "defillama",
    poolId: row.pool_id,
    chain: row.chain ?? undefined,
    project: row.project,
    symbol: row.symbol ?? undefined,
    tvlUsd: row.tvl_usd ?? undefined,
    apy: row.apy ?? undefined,
    apyBase: row.apy_base ?? undefined,
    apyReward: row.apy_reward ?? undefined,
    riskNotes: parseJsonArray(row.risk_notes),
    fetchedAt: row.fetched_at,
  };
}

function mergePolicy(existing: IndexedPolicyRecord | undefined, update: IndexedPolicyRecord): IndexedPolicyRecord {
  return {
    policyId: update.policyId,
    agentId: update.agentId ?? existing?.agentId,
    owner: update.owner ?? existing?.owner,
    maxNativeValue: update.maxNativeValue ?? existing?.maxNativeValue,
    maxSlippageBps: update.maxSlippageBps ?? existing?.maxSlippageBps,
    active: update.active ?? existing?.active ?? true,
    allowedTargets: applyPermissionDeltas(
      existing?.allowedTargets ?? [],
      (update.targetPermissions ?? []).map((permission) => ({
        value: permission.target,
        allowed: permission.allowed,
      })),
    ) as IndexedPolicyRecord["allowedTargets"],
    allowedSelectors: applyPermissionDeltas(
      existing?.allowedSelectors ?? [],
      (update.selectorPermissions ?? []).map((permission) => ({
        value: permission.selector,
        allowed: permission.allowed,
      })),
    ) as IndexedPolicyRecord["allowedSelectors"],
    transactionHash: update.transactionHash,
    blockNumber: update.blockNumber,
  };
}

function applyPermissionDeltas<T extends string>(
  current: T[],
  deltas: Array<{ value: T; allowed: boolean }>,
) {
  const values = new Set(current.map((value) => value.toLowerCase()));
  const canonical = new Map(current.map((value) => [value.toLowerCase(), value]));

  for (const delta of deltas) {
    const value = delta.value;
    const normalized = value.toLowerCase();
    if (delta.allowed) {
      values.add(normalized);
      canonical.set(normalized, value);
    } else {
      values.delete(normalized);
      canonical.delete(normalized);
    }
  }

  return [...values].map((value) => canonical.get(value)!).sort() as T[];
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
