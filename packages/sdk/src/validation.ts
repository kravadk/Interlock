import { isAddress, type Address, type Hex } from "viem";
import { Decision, ReasonCode, type DecisionLabel, type ReasonCodeLabel } from "@interlock/shared";
import { InterlockError } from "./errors.js";

export const maxSlippageBps = 10_000;

export class InterlockInputError extends InterlockError {
  constructor(message: string) {
    super("AGENTOPS_INPUT_INVALID", message, {
      action:
        "Fix the proposed action input before preflight. Use positive ids, valid EVM addresses, non-negative wei values, full even-byte calldata, bytes4 selectors, and slippage in 0..10000 bps.",
    });
    this.name = "InterlockInputError";
  }
}

export function assertPositiveId(value: bigint, field: string): void {
  if (value <= 0n) {
    throw new InterlockInputError(`${field} must be a positive integer.`);
  }
}

export function assertValidAddress(value: string, field: string): asserts value is Address {
  if (!isAddress(value)) {
    throw new InterlockInputError(`${field} must be an EVM address.`);
  }
}

export function isValidCalldata(value: string): value is Hex {
  return /^0x([0-9a-fA-F]{2})*$/.test(value);
}

export function assertValidCalldata(value: string, field = "data"): asserts value is Hex {
  if (!isValidCalldata(value)) {
    throw new InterlockInputError(`${field} must be full 0x-prefixed calldata with complete bytes. Use 0x for empty calldata.`);
  }
}

export function isValidSelector(value: string): value is Hex {
  return /^0x[0-9a-fA-F]{8}$/.test(value);
}

export function assertValidSelector(value: string, field = "selector"): asserts value is Hex {
  if (!isValidSelector(value)) {
    throw new InterlockInputError(`${field} must be a bytes4 selector like 0xd0e30db0.`);
  }
}

export function assertNonNegativeWei(value: bigint, field = "value"): void {
  if (value < 0n) {
    throw new InterlockInputError(`${field} must be a non-negative wei value.`);
  }
}

export function assertValidSlippageBps(value: number | undefined, field = "expectedSlippageBps"): void {
  if (value === undefined) return;
  if (!Number.isInteger(value) || value < 0 || value > maxSlippageBps) {
    throw new InterlockInputError(`${field} must be an integer between 0 and ${maxSlippageBps}.`);
  }
}

export function assertValidBytes32(value: string, field: string): asserts value is Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new InterlockInputError(`${field} must be a bytes32 hex value.`);
  }
}

export function assertValidDecisionReason(decision: DecisionLabel, reasonCode: ReasonCodeLabel): void {
  if (!(decision in Decision)) {
    throw new InterlockInputError(`Unsupported decision: ${decision}.`);
  }
  if (!(reasonCode in ReasonCode)) {
    throw new InterlockInputError(`Unsupported reasonCode: ${reasonCode}.`);
  }
  if (decision === "ALLOW" && reasonCode !== "POLICY_PASSED") {
    throw new InterlockInputError("ALLOW decisions must use reasonCode POLICY_PASSED.");
  }
  if (decision !== "ALLOW" && reasonCode === "POLICY_PASSED") {
    throw new InterlockInputError("POLICY_PASSED reasonCode is only valid for ALLOW decisions.");
  }
  if (decision === "ALLOW" && reasonCode === "SIMULATION_FAILED") {
    throw new InterlockInputError("SIMULATION_FAILED cannot be recorded as an ALLOW decision.");
  }
}
