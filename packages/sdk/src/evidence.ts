import { evidenceHash, type EvidenceObject } from "@interlock/shared";
import type { Hex } from "viem";
import type { FirewallDecision } from "./types.js";

export type BuildEvidenceOptions = {
  /** Human intent for the action (falls back to none). */
  intent?: string;
  /** Optional advisory AI explanation/trace. Must not contain secrets. */
  modelTrace?: string;
  /** ISO-8601 timestamp; pass `new Date().toISOString()` from the caller. */
  timestamp?: string;
};

/** Map a completed pre-flight {@link FirewallDecision} into a portable evidence object. */
export function buildEvidence(decision: FirewallDecision, options: BuildEvidenceOptions = {}): EvidenceObject {
  return {
    version: "interlock.evidence.v1",
    intent: options.intent,
    proposedTx: {
      to: decision.tx.to,
      value: decision.tx.value.toString(),
      data: decision.tx.data,
      selector: decision.selector,
    },
    simulation: {
      success: decision.simulation.success,
      ...(decision.simulation.error ? { error: decision.simulation.error } : {}),
    },
    checks: {
      targetAllowed: decision.checks.targetAllowed,
      selectorAllowed: decision.checks.selectorAllowed,
      valueWithinLimit: decision.checks.valueWithinLimit,
      slippageWithinLimit: decision.checks.slippageWithinLimit,
      policyActive: decision.checks.policyActive,
    },
    decision: decision.decision,
    reason: decision.reasonCode,
    riskScore: decision.riskScore,
    ...(options.modelTrace ? { modelTrace: options.modelTrace } : {}),
    ...(options.timestamp ? { timestamp: options.timestamp } : {}),
  };
}

/** Build the evidence object plus its on-chain `evidenceHash` in one call. */
export function buildEvidenceReport(
  decision: FirewallDecision,
  options: BuildEvidenceOptions = {},
): { evidence: EvidenceObject; evidenceHash: Hex } {
  const evidence = buildEvidence(decision, options);
  return { evidence, evidenceHash: evidenceHash(evidence) };
}

export { evidenceHash } from "@interlock/shared";
