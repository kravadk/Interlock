import { keccak256, stringToHex, type Address, type Hex } from "viem";
import type { DecisionLabel, ReasonCodeLabel } from "./types.js";

// A visible, portable evidence object for a single pre-flight decision. On-chain we still
// store only hashes (simulationHash + evidenceHash); the full object lives off-chain (local
// JSON now, content-addressed storage later) so a decision can be independently audited.
// NEVER put private keys or secrets in evidence.

export type EvidenceSimulation = {
  success: boolean;
  error?: string;
};

export type EvidenceObject = {
  /** Schema marker for forward-compatible parsing. */
  version: "interlock.evidence.v1";
  intent?: string;
  proposedTx: {
    to: Address;
    value: string; // wei, decimal string
    data: Hex;
    selector?: Hex;
  };
  simulation: EvidenceSimulation;
  /** Named pre-flight checks and their pass/fail result. */
  checks: Record<string, boolean>;
  decision: DecisionLabel;
  reason: ReasonCodeLabel;
  riskScore?: number;
  /** Optional advisory AI explanation / trace. Must not contain secrets. */
  modelTrace?: string;
  /** ISO-8601; pass in from the caller (shared code must stay deterministic/clock-free). */
  timestamp?: string;
};

/**
 * Deterministic JSON: object keys sorted recursively so the same logical evidence always
 * serializes identically (a stable preimage for {@link evidenceHash}). Arrays keep order.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortKeys((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

/** keccak256 of the canonical-JSON encoding of an evidence object — the on-chain `evidenceHash`. */
export function evidenceHash(evidence: EvidenceObject): Hex {
  return keccak256(stringToHex(canonicalJson(evidence)));
}
