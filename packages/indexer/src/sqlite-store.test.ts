import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteActionStore } from "./sqlite-store.js";
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

let testDir: string | undefined;

afterEach(() => {
  if (testDir) {
    rmSync(testDir, { recursive: true, force: true });
    testDir = undefined;
  }
});

describe("SqliteActionStore", () => {
  it("persists action records across store instances", () => {
    const dbPath = tempDbPath();
    const store = new SqliteActionStore(dbPath);
    store.upsertMany([baseAction, { ...baseAction, actionCheckId: "2", decision: "BLOCK", reasonCode: "SIMULATION_FAILED", blockNumber: "11" }]);
    store.close();

    const reopened = new SqliteActionStore(dbPath);
    expect(reopened.list()).toHaveLength(2);
    expect(reopened.latestBlock()).toBe(11n);
    expect(reopened.stats("1")).toMatchObject({ totalActions: 2, allowedActions: 1, blockedActions: 1, failedSimulations: 1 });
    reopened.close();
  });

  it("upserts by action id", () => {
    const store = new SqliteActionStore(":memory:");
    store.upsertMany([baseAction, { ...baseAction, decision: "BLOCK", reasonCode: "TARGET_NOT_ALLOWED" }]);
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0]?.decision).toBe("BLOCK");
    store.close();
  });

  it("paginates records after sorting", () => {
    const store = new SqliteActionStore(":memory:");
    store.upsertMany([
      baseAction,
      { ...baseAction, actionCheckId: "2", blockNumber: "11" },
      { ...baseAction, actionCheckId: "3", blockNumber: "12" },
    ]);
    expect(store.list({ limit: 1 })[0]?.actionCheckId).toBe("3");
    expect(store.list({ limit: 1, offset: 1 })[0]?.actionCheckId).toBe("2");
    store.close();
  });

  it("filters and counts records by selector", () => {
    const store = new SqliteActionStore(":memory:");
    store.upsertMany([
      baseAction,
      { ...baseAction, actionCheckId: "2", selector: "0x87654321", blockNumber: "11" },
    ]);
    expect(store.list({ selector: "0x12345678" })[0]?.actionCheckId).toBe("1");
    expect(store.list({ selector: "0x87654321" })[0]?.actionCheckId).toBe("2");
    expect(store.count({ selector: "0x12345678" })).toBe(1);
    store.close();
  });

  it("persists registry records", () => {
    const dbPath = tempDbPath();
    const store = new SqliteActionStore(dbPath);
    store.upsertAgents([baseAgent]);
    store.upsertPolicies([basePolicy]);
    store.close();

    const reopened = new SqliteActionStore(dbPath);
    expect(reopened.getAgent("1")?.metadataURI).toBe("ipfs://agent-1");
    expect(reopened.getPolicy("1")?.maxNativeValue).toBe("100");
    expect(reopened.latestBlock()).toBe(9n);
    reopened.close();
  });

  it("persists policy lifecycle updates and permission deltas", () => {
    const dbPath = tempDbPath();
    const store = new SqliteActionStore(dbPath);
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
    store.close();

    const reopened = new SqliteActionStore(dbPath);
    expect(reopened.getPolicy("1")).toMatchObject({ maxNativeValue: "250", maxSlippageBps: 50, active: false, allowedTargets: [], allowedSelectors: ["0x12345678"] });
    reopened.close();
  });
});

function tempDbPath() {
  testDir = mkdtempSync(join(tmpdir(), "interlock-indexer-"));
  return join(testDir, "actions.sqlite");
}
