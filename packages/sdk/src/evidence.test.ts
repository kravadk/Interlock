import { describe, expect, it } from "vitest";
import { evidenceHash } from "@interlock/shared";
import { buildEvidence, buildEvidenceReport } from "./evidence.js";
import type { FirewallDecision } from "./types.js";

const decision: FirewallDecision = {
  allowed: false,
  decision: "BLOCK",
  reasonCode: "TARGET_NOT_ALLOWED",
  riskScore: 90,
  simulationHash: "0xaaaa",
  calldataHash: "0xbbbb",
  selector: "0x2de5aaf7",
  explanation: "Target is not on the policy allowlist.",
  tx: { to: "0x00000000000000000000000000000000000000ff", value: 1000n, data: "0x2de5aaf7" },
  agentId: 1n,
  policyId: 2n,
  simulation: { success: true },
  checks: {
    targetAllowed: false,
    selectorAllowed: true,
    valueWithinLimit: true,
    slippageWithinLimit: true,
    policyActive: true,
  },
};

describe("buildEvidence", () => {
  it("maps a decision into a v1 evidence object with stringified value", () => {
    const evidence = buildEvidence(decision, { intent: "swap", timestamp: "2026-06-03T00:00:00.000Z" });
    expect(evidence.version).toBe("interlock.evidence.v1");
    expect(evidence.proposedTx.value).toBe("1000");
    expect(evidence.proposedTx.selector).toBe("0x2de5aaf7");
    expect(evidence.decision).toBe("BLOCK");
    expect(evidence.reason).toBe("TARGET_NOT_ALLOWED");
    expect(evidence.checks.targetAllowed).toBe(false);
    expect(evidence.intent).toBe("swap");
  });

  it("omits optional fields when not provided", () => {
    const evidence = buildEvidence(decision);
    expect(evidence.intent).toBeUndefined();
    expect(evidence.modelTrace).toBeUndefined();
    expect(evidence.timestamp).toBeUndefined();
  });

  it("produces a deterministic evidenceHash", () => {
    const report = buildEvidenceReport(decision, { timestamp: "2026-06-03T00:00:00.000Z" });
    expect(report.evidenceHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(report.evidenceHash).toBe(evidenceHash(report.evidence));
    // Same input → same hash.
    const again = buildEvidenceReport(decision, { timestamp: "2026-06-03T00:00:00.000Z" });
    expect(again.evidenceHash).toBe(report.evidenceHash);
  });
});
