import type { Address, Hex } from "viem";
import {
  AttestationStatusName,
  type AttestationStatusLabel,
  DecisionName,
  type DecisionLabel,
  ReasonCodeName,
  type ReasonCodeLabel,
} from "./types.js";

// Single source of truth for turning a decoded `ActionChecked` event into a normalized
// record. Four call sites used to inline this same field selection + enum mapping and
// had to be kept in lockstep (web RPC fallback, indexer sync, SDK history, SDK receipt
// parse). They now all funnel through `parseActionCheckedArgs`.

/** Raw decoded `ActionChecked` args we read (all optional — older V1 logs omit the V2 fields). */
export type ActionCheckedArgs = {
  actionCheckId?: bigint;
  agentId?: bigint;
  policyId?: bigint;
  target?: Address;
  value?: bigint;
  calldataHash?: Hex;
  selector?: Hex;
  simulationHash?: Hex;
  evidenceHash?: Hex;
  decision?: number;
  reasonCode?: number;
  timestamp?: bigint;
  status?: number;
  finalizableAt?: bigint;
};

/**
 * Normalized core fields: bigints preserved, enums mapped to labels. Transaction hash
 * and block number are intentionally excluded — callers add them from the log or receipt.
 */
export type ParsedActionChecked = {
  actionCheckId: bigint;
  agentId: bigint;
  policyId: bigint;
  target: Address;
  value: bigint;
  calldataHash: Hex;
  selector: Hex;
  simulationHash: Hex;
  decision: DecisionLabel;
  reasonCode: ReasonCodeLabel;
  timestamp: bigint;
  /** ActionAttestationV2 dispute-window fields (undefined for legacy V1 events). */
  status?: AttestationStatusLabel;
  finalizableAt?: bigint;
  /** ActionAttestationV3 evidence commitment (undefined for V1/V2 events). */
  evidenceHash?: Hex;
};

/** Same shape as {@link ParsedActionChecked} but with bigints serialized to decimal strings. */
export type StringifiedActionChecked = {
  actionCheckId: string;
  agentId: string;
  policyId: string;
  target: Address;
  value: string;
  calldataHash: Hex;
  selector: Hex;
  simulationHash: Hex;
  decision: DecisionLabel;
  reasonCode: ReasonCodeLabel;
  timestamp: string;
  status?: AttestationStatusLabel;
  finalizableAt?: string;
  evidenceHash?: Hex;
};

/**
 * Parse decoded `ActionChecked` args into normalized core fields. Returns `null` when a
 * required field is missing (malformed/partial log) so callers can skip it.
 */
export function parseActionCheckedArgs(args: ActionCheckedArgs): ParsedActionChecked | null {
  if (
    args.actionCheckId === undefined ||
    args.agentId === undefined ||
    args.policyId === undefined ||
    args.target === undefined ||
    args.value === undefined ||
    args.calldataHash === undefined ||
    args.selector === undefined ||
    args.simulationHash === undefined ||
    args.decision === undefined ||
    args.reasonCode === undefined ||
    args.timestamp === undefined
  ) {
    return null;
  }

  return {
    actionCheckId: args.actionCheckId,
    agentId: args.agentId,
    policyId: args.policyId,
    target: args.target,
    value: args.value,
    calldataHash: args.calldataHash,
    selector: args.selector,
    simulationHash: args.simulationHash,
    decision: DecisionName[args.decision as keyof typeof DecisionName],
    reasonCode: ReasonCodeName[args.reasonCode as keyof typeof ReasonCodeName],
    timestamp: args.timestamp,
    status:
      args.status !== undefined
        ? AttestationStatusName[args.status as keyof typeof AttestationStatusName]
        : undefined,
    finalizableAt: args.finalizableAt,
    evidenceHash: args.evidenceHash,
  };
}

/** Serialize a {@link ParsedActionChecked} to the string-typed shape used by JSON records. */
export function stringifyActionChecked(parsed: ParsedActionChecked): StringifiedActionChecked {
  return {
    actionCheckId: parsed.actionCheckId.toString(),
    agentId: parsed.agentId.toString(),
    policyId: parsed.policyId.toString(),
    target: parsed.target,
    value: parsed.value.toString(),
    calldataHash: parsed.calldataHash,
    selector: parsed.selector,
    simulationHash: parsed.simulationHash,
    decision: parsed.decision,
    reasonCode: parsed.reasonCode,
    timestamp: parsed.timestamp.toString(),
    status: parsed.status,
    finalizableAt: parsed.finalizableAt !== undefined ? parsed.finalizableAt.toString() : undefined,
    evidenceHash: parsed.evidenceHash,
  };
}
