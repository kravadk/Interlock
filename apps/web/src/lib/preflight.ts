import { createPublicClient, keccak256, stringToHex, type Address, type Hex } from "viem";
import {
  assertNonNegativeWei,
  assertPositiveId,
  assertValidCalldata,
  assertValidSlippageBps,
  withRpcRetry,
} from "@interlock/firewall-sdk";
import { policyRegistryAbi, mantleSepolia, type DecisionLabel, type ReasonCodeLabel } from "@interlock/shared";
import { browserRpcTransport } from "./rpc-transport";

export type PreflightAction = {
  agentId: bigint;
  policyId: bigint;
  tx: {
    to: Address;
    value: bigint;
    data: Hex;
  };
  metadata?: {
    expectedSlippageBps?: number;
  };
};

export type PreflightDecision = {
  allowed: boolean;
  decision: DecisionLabel;
  reason: ReasonCodeLabel;
  riskScore: number;
  explanation: string;
  calldataHash: Hex;
  selector: Hex;
  simulationHash: Hex;
  checks: {
    targetAllowed: boolean;
    selectorAllowed: boolean;
    valueWithinLimit: boolean;
    slippageWithinLimit: boolean;
    simulationSuccess: boolean;
    policyActive: boolean;
  };
};

type PolicyResult =
  | {
      owner: Address;
      agentId: bigint;
      maxNativeValue: bigint;
      maxSlippageBps: number;
      active: boolean;
    }
  | readonly [Address, bigint, bigint, number, boolean];

export async function checkActionWithPolicy(options: {
  rpcUrl: string;
  policyRegistry: Address;
  account?: Address;
  action: PreflightAction;
}): Promise<PreflightDecision> {
  assertPositiveId(options.action.agentId, "agentId");
  assertPositiveId(options.action.policyId, "policyId");
  assertNonNegativeWei(options.action.tx.value, "tx.value");
  assertValidCalldata(options.action.tx.data, "tx.data");
  assertValidSlippageBps(options.action.metadata?.expectedSlippageBps, "metadata.expectedSlippageBps");

  const publicClient = createPublicClient({
    chain: mantleSepolia,
    transport: browserRpcTransport(options.rpcUrl),
  });
  const selector = getSelector(options.action.tx.data);

  const [policyResult, targetAllowed, selectorAllowed, simulation] = await Promise.all([
    withRpcRetry(() => publicClient.readContract({
      address: options.policyRegistry,
      abi: policyRegistryAbi,
      functionName: "getPolicy",
      args: [options.action.policyId],
    }) as Promise<PolicyResult>),
    withRpcRetry(() => publicClient.readContract({
      address: options.policyRegistry,
      abi: policyRegistryAbi,
      functionName: "isTargetAllowed",
      args: [options.action.policyId, options.action.tx.to],
    }) as Promise<boolean>),
    withRpcRetry(() => publicClient.readContract({
      address: options.policyRegistry,
      abi: policyRegistryAbi,
      functionName: "isSelectorAllowed",
      args: [options.action.policyId, selector],
    }) as Promise<boolean>),
    simulateTransaction(publicClient, options.action.tx, options.account),
  ]);

  const policy = normalizePolicy(policyResult);
  const valueWithinLimit = options.action.tx.value <= policy.maxNativeValue;
  const slippageWithinLimit =
    options.action.metadata?.expectedSlippageBps === undefined ||
    options.action.metadata.expectedSlippageBps <= policy.maxSlippageBps;
  const checks = {
    targetAllowed,
    selectorAllowed,
    valueWithinLimit,
    slippageWithinLimit,
    simulationSuccess: simulation.success,
    policyActive: policy.active,
  };

  const simulationHash = hashJson({
    success: simulation.success,
    error: simulation.error,
    target: options.action.tx.to,
    value: options.action.tx.value,
    selector,
    checks,
  });

  if (!policy.active) {
    return blocked("UNKNOWN_SELECTOR", 95, "Policy is inactive.", options.action.tx.data, simulationHash, checks);
  }
  if (!targetAllowed) {
    return blocked(
      "TARGET_NOT_ALLOWED",
      90,
      "Target contract is not allowlisted for this policy.",
      options.action.tx.data,
      simulationHash,
      checks,
    );
  }
  if (!valueWithinLimit) {
    return blocked(
      "VALUE_LIMIT_EXCEEDED",
      85,
      "Native value exceeds the policy max spend limit.",
      options.action.tx.data,
      simulationHash,
      checks,
    );
  }
  if (!selectorAllowed) {
    return blocked(
      "UNKNOWN_SELECTOR",
      80,
      "Function selector is not allowlisted for this policy.",
      options.action.tx.data,
      simulationHash,
      checks,
    );
  }
  if (!slippageWithinLimit) {
    return blocked(
      "SLIPPAGE_LIMIT_EXCEEDED",
      75,
      "Expected slippage exceeds the policy limit.",
      options.action.tx.data,
      simulationHash,
      checks,
    );
  }
  if (!simulation.success) {
    return blocked(
      "SIMULATION_FAILED",
      70,
      "Pre-flight transaction simulation failed.",
      options.action.tx.data,
      simulationHash,
      checks,
    );
  }

  return {
    allowed: true,
    decision: "ALLOW",
    reason: "POLICY_PASSED",
    riskScore: 8,
    explanation: "Simulation succeeded and all policy checks passed.",
    calldataHash: calldataHash(options.action.tx.data),
    selector,
    simulationHash,
    checks,
  };
}

function blocked(
  reason: ReasonCodeLabel,
  riskScore: number,
  explanation: string,
  data: Hex,
  simulationHash: Hex,
  checks: PreflightDecision["checks"],
): PreflightDecision {
  return {
    allowed: false,
    decision: "BLOCK",
    reason,
    riskScore,
    explanation,
    calldataHash: calldataHash(data),
    selector: getSelector(data),
    simulationHash,
    checks,
  };
}

async function simulateTransaction(
  publicClient: ReturnType<typeof createPublicClient>,
  tx: PreflightAction["tx"],
  account?: Address,
) {
  try {
    await withRpcRetry(() =>
      publicClient.call({
        account,
        to: tx.to,
        value: tx.value,
        data: tx.data,
      }),
    );
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown simulation error",
    };
  }
}

function normalizePolicy(policy: PolicyResult) {
  if ("owner" in policy) {
    return {
      owner: policy.owner,
      agentId: BigInt(policy.agentId),
      maxNativeValue: BigInt(policy.maxNativeValue),
      maxSlippageBps: Number(policy.maxSlippageBps),
      active: policy.active,
    };
  }

  return {
    owner: policy[0],
    agentId: BigInt(policy[1]),
    maxNativeValue: BigInt(policy[2]),
    maxSlippageBps: Number(policy[3]),
    active: policy[4],
  };
}

function getSelector(data: Hex): Hex {
  return data.length >= 10 ? (data.slice(0, 10) as Hex) : "0x00000000";
}

function calldataHash(data: Hex): Hex {
  assertValidCalldata(data);
  return keccak256(data);
}

function hashJson(value: unknown): Hex {
  return keccak256(stringToHex(JSON.stringify(value, bigintJsonReplacer)));
}

function bigintJsonReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}
