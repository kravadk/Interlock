import { describe, expect, it } from "vitest";
import {
  buildPolicyVersionSnapshot,
  diffPolicyVersionSnapshots,
  policyVersionFormat,
  verifyPolicyVersionSnapshot,
} from "./policy-version.js";

const policy = {
  owner: "0xaa00000000000000000000000000000000000001" as const,
  agentId: 7n,
  maxNativeValue: 100n,
  maxSlippageBps: 100,
  active: true,
};

describe("policy version snapshots", () => {
  it("builds stable snapshots independent of target and selector order", () => {
    const first = buildPolicyVersionSnapshot({
      policyId: 3n,
      policy,
      chainId: 5003,
      createdAt: "2026-06-03T00:00:00.000Z",
      targets: [
        "0xbb00000000000000000000000000000000000002",
        "0xaa00000000000000000000000000000000000001",
      ],
      selectors: ["0x095ea7b3", "0x2de5aaf7"],
    });
    const second = buildPolicyVersionSnapshot({
      policyId: 3n,
      policy,
      chainId: 5003,
      createdAt: "2026-06-03T01:00:00.000Z",
      targets: [
        "0xaa00000000000000000000000000000000000001",
        "0xbb00000000000000000000000000000000000002",
      ],
      selectors: ["0x2de5aaf7", "0x095ea7b3"],
    });

    expect(first.version).toBe(policyVersionFormat);
    expect(first.targets).toEqual(second.targets);
    expect(first.selectors).toEqual(second.selectors);
    expect(first.contentHash).toBe(second.contentHash);
    expect(first.versionId).toBe(second.versionId);
  });

  it("diffs policy-as-code snapshots", () => {
    const from = buildPolicyVersionSnapshot({
      policyId: 3n,
      policy,
      chainId: 5003,
      targets: ["0xaa00000000000000000000000000000000000001"],
      selectors: ["0x2de5aaf7"],
    });
    const to = buildPolicyVersionSnapshot({
      policyId: 3n,
      policy: { ...policy, maxNativeValue: 200n, active: false },
      chainId: 5003,
      targets: ["0xbb00000000000000000000000000000000000002"],
      selectors: ["0x095ea7b3"],
    });

    const diff = diffPolicyVersionSnapshots(from, to);

    expect(diff.ok).toBe(false);
    expect(diff.changes.maxNativeValue).toEqual({ from: "100", to: "200" });
    expect(diff.changes.active).toEqual({ from: true, to: false });
    expect(diff.changes.targetsAdded).toEqual(["0xbb00000000000000000000000000000000000002"]);
    expect(diff.changes.targetsRemoved).toEqual(["0xaa00000000000000000000000000000000000001"]);
    expect(diff.changes.selectorsAdded).toEqual(["0x095ea7b3"]);
    expect(diff.changes.selectorsRemoved).toEqual(["0x2de5aaf7"]);
  });

  it("verifies snapshot hash and current drift", () => {
    const snapshot = buildPolicyVersionSnapshot({
      policyId: 3n,
      policy,
      chainId: 5003,
      targets: ["0xaa00000000000000000000000000000000000001"],
      selectors: ["0x2de5aaf7"],
    });
    const current = buildPolicyVersionSnapshot({
      policyId: 3n,
      policy,
      chainId: 5003,
      targets: ["0xaa00000000000000000000000000000000000001"],
      selectors: ["0x2de5aaf7"],
    });

    const result = verifyPolicyVersionSnapshot({ snapshot, current });

    expect(result.ok).toBe(true);
    expect(result.snapshotContentHashValid).toBe(true);
    expect(result.currentContentHash).toBe(snapshot.contentHash);
  });
});
