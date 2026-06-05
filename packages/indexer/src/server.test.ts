import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { zeroAddress } from "viem";
import { createIndexerServer } from "./server.js";
import { ActionStore } from "./store.js";
import type { IndexedActionRecord, IndexedAgentRecord, IndexedPolicyRecord, IndexerConfig } from "./types.js";

const config: IndexerConfig = {
  rpcUrl: "http://127.0.0.1:8545",
  agentRegistry: zeroAddress,
  policyRegistry: zeroAddress,
  actionAttestation: zeroAddress,
  fromBlock: 1n,
  port: 0,
  dbPath: ":memory:",
  autoSync: false,
  syncIntervalMs: 0,
  blockChunkSize: 250_000n,
  webhookEvents: ["block", "simulation_failed"],
};

const agent: IndexedAgentRecord = {
  agentId: "1",
  owner: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  metadataURI: "ipfs://agent-1",
  transactionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  blockNumber: "10",
};

const policy: IndexedPolicyRecord = {
  policyId: "1",
  agentId: "1",
  owner: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  maxNativeValue: "10000000000000000",
  maxSlippageBps: 100,
  active: true,
  allowedTargets: ["0xe4dfef03e107225f2239cfff955a378a9a8158be"],
  allowedSelectors: ["0xd0e30db0"],
  targetPermissions: [{ target: "0xe4dfef03e107225f2239cfff955a378a9a8158be", allowed: true }],
  selectorPermissions: [{ selector: "0xd0e30db0", allowed: true }],
  transactionHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  blockNumber: "11",
};

const action: IndexedActionRecord = {
  actionCheckId: "1",
  agentId: "1",
  policyId: "1",
  target: "0xe4dfef03e107225f2239cfff955a378a9a8158be",
  value: "0",
  calldataHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  selector: "0xd0e30db0",
  simulationHash: "0xe4dfef03e107225f2239cfff955a378a9a8158be111111111111111111111111",
  decision: "ALLOW",
  reasonCode: "POLICY_PASSED",
  timestamp: "1710000000",
  transactionHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  blockNumber: "12",
};

let openServer: Server | undefined;

afterEach(async () => {
  if (!openServer) return;
  await new Promise<void>((resolve, reject) => {
    openServer?.close((error) => (error ? reject(error) : resolve()));
  });
  openServer = undefined;
});

describe("indexer HTTP server", () => {
  it("serves dashboard read endpoints from the action store", async () => {
    const store = new ActionStore();
    store.upsertAgents([agent]);
    store.upsertPolicies([policy]);
    store.upsertMany([action]);

    const { server } = createIndexerServer(config, store);
    openServer = server;
    const baseUrl = await listen(server);

    await expectJson(`${baseUrl}/health`, { ok: true, nextFromBlock: "1", storage: "memory" });
    await expectJson(`${baseUrl}/status`, {
      name: "interlock-recorder-service",
      network: { name: "Mantle Sepolia", chainId: 5003 },
      records: { agents: 1, policies: 1, actions: 1, latestIndexedBlock: "12" },
    });
    await expectJson(`${baseUrl}/network`, {
      network: { name: "Mantle Sepolia", chainId: 5003 },
      contracts: {
        agentRegistry: zeroAddress,
        policyRegistry: zeroAddress,
        actionAttestation: zeroAddress,
      },
    });

    const actions = await getJson<{ actions: IndexedActionRecord[]; page: { total: number; nextOffset?: number } }>(
      `${baseUrl}/actions?limit=1&selector=0xd0e30db0`,
    );
    expect(actions.actions).toHaveLength(1);
    expect(actions.actions[0]?.selector).toBe("0xd0e30db0");
    expect(actions.page).toMatchObject({ total: 1 });

    const agents = await getJson<{ agents: Array<{ agentId: string; totalActions: number }> }>(`${baseUrl}/agents`);
    expect(agents.agents[0]).toMatchObject({ agentId: "1", totalActions: 1 });

    const policies = await getJson<{ policies: Array<{ policyId: string; allowedSelectors: string[] }> }>(`${baseUrl}/policies`);
    expect(policies.policies[0]).toMatchObject({ policyId: "1", allowedSelectors: ["0xd0e30db0"] });

    await expectJson(`${baseUrl}/stats/agents/1`, {
      agentId: "1",
      totalActions: 1,
      allowedActions: 1,
      blockedActions: 0,
    });

    await expectJson(`${baseUrl}/benchmark/1`, {
      agentId: "1",
      score: 100,
      scoreLabel: "100% evidence score",
      totalActions: 1,
      reasonBreakdown: { POLICY_PASSED: 1 },
    });

    await expectJson(`${baseUrl}/analytics`, {
      scope: "global",
      totalActions: 1,
      allowed: 1,
      blocked: 0,
      blockRate: 0,
      topReasons: [{ reasonCode: "POLICY_PASSED", count: 1 }],
    });

    await expectJson(`${baseUrl}/analytics/agents/1`, {
      scope: "agent",
      agentId: "1",
      totalActions: 1,
      topSelectors: [{ selector: "0xd0e30db0", count: 1 }],
    });

    await expectJson(`${baseUrl}/analytics/policies/1`, {
      scope: "policy",
      policyId: "1",
      totalActions: 1,
      topTargets: [{ target: "0xe4dfef03e107225f2239cfff955a378a9a8158be", count: 1 }],
    });
  });

  it("serves zero-state analytics when no records exist", async () => {
    const { server } = createIndexerServer(config, new ActionStore());
    openServer = server;
    const baseUrl = await listen(server);

    await expectJson(`${baseUrl}/analytics`, {
      scope: "global",
      totalActions: 0,
      allowed: 0,
      blocked: 0,
      review: 0,
      failedSimulations: 0,
      blockRate: 0,
      topReasons: [],
      latestActions: [],
    });
  });

  it("rejects invalid proposal lifecycle transitions", async () => {
    const store = new ActionStore();
    store.upsertProposal({
      proposalId: "blocked-proposal",
      agentId: "1",
      policyId: "1",
      status: "blocked",
      target: action.target,
      value: "0",
      calldata: "0x",
      intent: "Blocked proposal must not be executable",
      decision: "BLOCK",
      reasonCode: "TARGET_NOT_ALLOWED",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    store.upsertProposal({
      proposalId: "rejected-proposal",
      agentId: "1",
      policyId: "1",
      status: "rejected",
      target: action.target,
      value: "0",
      calldata: "0x",
      intent: "Rejected proposal is terminal",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    const { server } = createIndexerServer(config, store);
    openServer = server;
    const baseUrl = await listen(server);

    await expectPost(`${baseUrl}/proposals/blocked-proposal/mark-executed`, { txHash: action.transactionHash }, 409, {
      error: "Invalid proposal transition: blocked -> executed.",
    });
    await expectPost(`${baseUrl}/proposals/rejected-proposal/record`, { actionCheckId: "1" }, 409, {
      error: "Invalid proposal transition: rejected -> recorded.",
    });
  });
});

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Server did not expose a TCP address.");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  expect(response.status).toBe(200);
  return (await response.json()) as T;
}

async function expectJson(url: string, expected: Record<string, unknown>) {
  const body = await getJson<Record<string, unknown>>(url);
  expect(body).toMatchObject(expected);
}

async function expectPost(url: string, body: Record<string, unknown>, status: number, expected: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(status);
  expect(await response.json()).toMatchObject(expected);
}
