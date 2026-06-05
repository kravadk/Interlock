import { keccak256, stringToHex, type Hex } from "viem";
import type { AgentPolicy, FirewallDecision } from "./types.js";
import { assertNonNegativeWei, assertValidCalldata, assertValidSlippageBps } from "./validation.js";

export type PolicyEvaluationInput = {
  targetAllowed: boolean;
  selectorAllowed: boolean;
  simulationSuccess: boolean;
  expectedSlippageBps?: number;
  tx: {
    value: bigint;
    data: Hex;
  };
  policy: AgentPolicy;
};

export function getSelector(data: Hex): Hex {
  return data.length >= 10 ? (data.slice(0, 10) as Hex) : "0x00000000";
}

export function hashJson(value: unknown): Hex {
  return keccak256(stringToHex(JSON.stringify(value, bigintJsonReplacer)));
}

export function calldataHash(data: Hex): Hex {
  assertValidCalldata(data);
  return keccak256(data);
}

export function evaluatePolicy(input: PolicyEvaluationInput): Pick<
  FirewallDecision,
  "allowed" | "decision" | "reasonCode" | "riskScore" | "explanation" | "checks"
> {
  assertNonNegativeWei(input.tx.value, "tx.value");
  assertValidCalldata(input.tx.data, "tx.data");
  assertValidSlippageBps(input.expectedSlippageBps, "expectedSlippageBps");
  assertValidSlippageBps(input.policy.maxSlippageBps, "policy.maxSlippageBps");

  const slippageWithinLimit = input.expectedSlippageBps === undefined || input.expectedSlippageBps <= input.policy.maxSlippageBps;
  const valueWithinLimit = input.tx.value <= input.policy.maxNativeValue;
  const checks = {
    targetAllowed: input.targetAllowed,
    selectorAllowed: input.selectorAllowed,
    valueWithinLimit,
    slippageWithinLimit,
    policyActive: input.policy.active,
  };

  if (!input.policy.active) {
    return blocked("UNKNOWN_SELECTOR", 95, "Policy is inactive, so the agent action cannot execute.", checks);
  }
  if (!input.targetAllowed) {
    return blocked("TARGET_NOT_ALLOWED", 90, "Target contract is not allowlisted for this agent policy.", checks);
  }
  if (!valueWithinLimit) {
    return blocked("VALUE_LIMIT_EXCEEDED", 85, "Native value exceeds the policy max spend limit.", checks);
  }
  if (!input.selectorAllowed) {
    return blocked("UNKNOWN_SELECTOR", 80, "Function selector is not allowlisted for this policy.", checks);
  }
  if (!slippageWithinLimit) {
    return blocked("SLIPPAGE_LIMIT_EXCEEDED", 75, "Expected slippage exceeds the policy limit.", checks);
  }
  if (!input.simulationSuccess) {
    return blocked("SIMULATION_FAILED", 70, "Pre-flight transaction simulation failed.", checks);
  }

  return {
    allowed: true,
    decision: "ALLOW",
    reasonCode: "POLICY_PASSED",
    riskScore: 8,
    explanation: "Simulation succeeded and all policy checks passed.",
    checks,
  };
}

function blocked(
  reasonCode: FirewallDecision["reasonCode"],
  riskScore: number,
  explanation: string,
  checks: FirewallDecision["checks"],
) {
  return {
    allowed: false,
    decision: "BLOCK" as const,
    reasonCode,
    riskScore,
    explanation,
    checks,
  };
}

function bigintJsonReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}
