import { describe, expect, it } from "vitest";
import { buildAgentDetail, buildAgentSummaries, buildPolicyDetail, buildPolicySummaries, findAction } from "./api-model.js";
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

const actions: IndexedActionRecord[] = [
  baseAction,
  { ...baseAction, actionCheckId: "2", agentId: "1", policyId: "2", decision: "BLOCK", reasonCode: "SIMULATION_FAILED", blockNumber: "12" },
  { ...baseAction, actionCheckId: "3", agentId: "2", policyId: "3", decision: "REVIEW", reasonCode: "UNKNOWN_SELECTOR", blockNumber: "11" },
];

const registeredAgents: IndexedAgentRecord[] = [
  {
    agentId: "4",
    owner: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    metadataURI: "ipfs://agent-4",
    transactionHash: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    blockNumber: "13",
  },
];

const registeredPolicies: IndexedPolicyRecord[] = [
  {
    policyId: "4",
    agentId: "4",
    owner: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    maxNativeValue: "100",
    maxSlippageBps: 100,
    active: true,
    allowedTargets: ["0xe4dfef03e107225f2239cfff955a378a9a8158be"],
    allowedSelectors: ["0x12345678"],
    transactionHash: "0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    blockNumber: "14",
  },
];

describe("api model builders", () => {
  it("finds action records by id", () => {
    expect(findAction(actions, "2")?.reasonCode).toBe("SIMULATION_FAILED");
    expect(findAction(actions, "99")).toBeUndefined();
  });

  it("builds agent summaries and detail", () => {
    const agents = buildAgentSummaries(actions);
    expect(agents.map((agent) => agent.agentId)).toEqual(["1", "2"]);
    expect(agents[0]).toMatchObject({ agentId: "1", totalActions: 2, allowedActions: 1, blockedActions: 1, policyIds: ["1", "2"] });
    expect(buildAgentDetail(actions, "2")?.latestAction?.actionCheckId).toBe("3");
  });

  it("includes registered agents without actions", () => {
    const agents = buildAgentSummaries(actions, registeredAgents);
    expect(agents[0]).toMatchObject({ agentId: "4", owner: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", metadataURI: "ipfs://agent-4", totalActions: 0, policyIds: [] });
  });

  it("builds policy summaries and detail", () => {
    const policies = buildPolicySummaries(actions);
    expect(policies.map((policy) => policy.policyId)).toEqual(["2", "3", "1"]);
    expect(buildPolicyDetail(actions, "1")?.latestAction?.decision).toBe("ALLOW");
  });

  it("includes registered policies without actions", () => {
    const policies = buildPolicySummaries(actions, registeredPolicies);
    expect(policies[0]).toMatchObject({ policyId: "4", agentIds: ["4"], maxNativeValue: "100", active: true, allowedSelectors: ["0x12345678"], totalActions: 0 });
  });
});
