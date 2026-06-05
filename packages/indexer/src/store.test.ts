import { describe, expect, it } from "vitest";
import { ActionStore } from "./store.js";
import type { IndexedActionRecord, IndexedAgentRecord, IndexedPolicyRecord } from "./types.js";

const baseAction: IndexedActionRecord = {
  actionCheckId: "1",
  agentId: "1",
  policyId: "1",
  target: "0xe4dfef03e107225f2239cfff955a378a9a8158be",
  value: "100",
  calldataHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  selector: "0x12345678",
  simulationHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
  decision: "ALLOW",
  reasonCode: "POLICY_PASSED",
  timestamp: "1000",
  transactionHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  blockNumber: "10",
};

const baseAgent: IndexedAgentRecord = {
  agentId: "1",
  owner: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  metadataURI: "ipfs://agent-1",
  transactionHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  blockNumber: "8",
};

const basePolicy: IndexedPolicyRecord = {
  policyId: "1",
  agentId: "1",
  owner: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  maxNativeValue: "100",
  maxSlippageBps: 100,
  active: true,
  allowedTargets: [],
  allowedSelectors: [],
  transactionHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  blockNumber: "9",
};

describe("ActionStore", () => {
  it("filters action records", () => {
    const store = new ActionStore();
    store.upsertMany([
      baseAction,
      {
        ...baseAction,
        actionCheckId: "2",
        agentId: "2",
        decision: "BLOCK",
        reasonCode: "TARGET_NOT_ALLOWED",
        selector: "0x87654321",
        blockNumber: "11",
      },
    ]);
    expect(store.list({ agentId: "1" })).toHaveLength(1);
    expect(store.list({ decision: "BLOCK" })[0]?.reasonCode).toBe("TARGET_NOT_ALLOWED");
    expect(store.list({ selector: "0x12345678" })[0]?.actionCheckId).toBe("1");
    expect(store.list({ selector: "0x87654321" })[0]?.actionCheckId).toBe("2");
    expect(store.count({ selector: "0x12345678" })).toBe(1);
  });

  it("paginates action records after sorting", () => {
    const store = new ActionStore();
    store.upsertMany([
      baseAction,
      { ...baseAction, actionCheckId: "2", blockNumber: "11" },
      { ...baseAction, actionCheckId: "3", blockNumber: "12" },
    ]);
    expect(store.list({ limit: 1 })[0]?.actionCheckId).toBe("3");
    expect(store.list({ limit: 1, offset: 1 })[0]?.actionCheckId).toBe("2");
  });

  it("computes agent stats", () => {
    const store = new ActionStore();
    store.upsertMany([
      baseAction,
      { ...baseAction, actionCheckId: "2", decision: "BLOCK", reasonCode: "TARGET_NOT_ALLOWED" },
      { ...baseAction, actionCheckId: "3", decision: "BLOCK", reasonCode: "SIMULATION_FAILED" },
    ]);
    expect(store.stats("1")).toEqual({ agentId: "1", totalActions: 3, allowedActions: 1, blockedActions: 2, reviewActions: 0, failedSimulations: 1 });
  });

  it("stores registry records and includes them in latest block", () => {
    const store = new ActionStore();
    store.upsertAgents([baseAgent]);
    store.upsertPolicies([basePolicy]);
    expect(store.getAgent("1")?.metadataURI).toBe("ipfs://agent-1");
    expect(store.getPolicy("1")?.maxSlippageBps).toBe(100);
    expect(store.latestBlock()).toBe(9n);
  });

  it("merges policy lifecycle updates and permission deltas", () => {
    const store = new ActionStore();
    store.upsertPolicies([
      basePolicy,
      {
        policyId: "1",
        targetPermissions: [{ target: "0xe4dfef03e107225f2239cfff955a378a9a8158be", allowed: true }],
        selectorPermissions: [{ selector: "0x12345678", allowed: true }],
        transactionHash: "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        blockNumber: "10",
      },
      {
        policyId: "1",
        maxNativeValue: "250",
        maxSlippageBps: 50,
        active: false,
        targetPermissions: [{ target: "0xe4dfef03e107225f2239cfff955a378a9a8158be", allowed: false }],
        transactionHash: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        blockNumber: "11",
      },
    ]);
    expect(store.getPolicy("1")).toMatchObject({ maxNativeValue: "250", maxSlippageBps: 50, active: false, allowedTargets: [], allowedSelectors: ["0x12345678"] });
  });

  it("persists and filters action proposals", () => {
    const store = new ActionStore();
    store.upsertProposal({
      proposalId: "proposal-1",
      agentId: "1",
      policyId: "1",
      status: "proposed",
      target: baseAction.target,
      value: "0",
      calldata: "0x",
      intent: "Check safe Mantle action",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    store.upsertProposal({
      proposalId: "proposal-2",
      agentId: "2",
      policyId: "1",
      status: "blocked",
      target: baseAction.target,
      value: "0",
      calldata: "0x",
      intent: "Check risky action",
      decision: "BLOCK",
      reasonCode: "TARGET_NOT_ALLOWED",
      createdAt: "2026-01-01T00:00:01.000Z",
      updatedAt: "2026-01-01T00:00:01.000Z",
    });

    expect(store.getProposal("proposal-1")?.status).toBe("proposed");
    expect(store.listProposals({ agentId: "1" })).toHaveLength(1);
    expect(store.listProposals({ status: "blocked" })[0]?.proposalId).toBe("proposal-2");
  });

  it("stores fetched ecosystem yield signals without fallback rows", () => {
    const store = new ActionStore();
    expect(store.listYields()).toEqual([]);
    store.upsertYields([
      {
        id: "defillama:mantle:pool-1",
        source: "defillama",
        project: "mantle-yield",
        chain: "Mantle",
        poolId: "pool-1",
        symbol: "mETH",
        tvlUsd: 1000000,
        apy: 3.5,
        underlyingTokens: [],
        riskNotes: ["Fetched from live source"],
        fetchedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);

    expect(store.listYields()[0]).toMatchObject({ source: "defillama", project: "mantle-yield", poolId: "pool-1" });
  });
});
