import { getAddress, type Address, type Hex } from "viem";
import { mantleSepolia } from "@interlock/shared";
import type { AgentAction, GatewayActionOptions, GatewayActionResult } from "./types.js";
import {
  assertNonNegativeWei,
  assertPositiveId,
  assertValidAddress,
  assertValidCalldata,
  assertValidSlippageBps,
  InterlockInputError,
} from "./validation.js";

export type ByrealActionSource = "realclaw" | "byreal-agent-skill" | "openclaw" | "byreal-compatible";

export type ByrealSkillActionInput = {
  source?: ByrealActionSource | string;
  skillId?: string;
  strategy?: string;
  chainId?: number;
  agentId: bigint | string;
  policyId: bigint | string;
  to: Address | string;
  valueWei?: bigint | string;
  data?: Hex | string;
  intent?: string;
  route?: string;
  expectedSlippageBps?: number;
};

export type ByrealGatewayFirewall = {
  runGatewayAction(action: AgentAction, options?: GatewayActionOptions): Promise<GatewayActionResult>;
};

export type ByrealGatewayAdapter = {
  normalize(input: ByrealSkillActionInput): AgentAction;
  run(input: ByrealSkillActionInput, options?: GatewayActionOptions): Promise<GatewayActionResult>;
};

export function normalizeByrealSkillAction(input: ByrealSkillActionInput): AgentAction {
  if (input.chainId !== undefined && input.chainId !== mantleSepolia.id) {
    throw new InterlockInputError(`Byreal/OpenClaw action chainId must be Mantle Sepolia ${mantleSepolia.id}.`);
  }

  const agentId = parsePositiveId(input.agentId, "agentId");
  const policyId = parsePositiveId(input.policyId, "policyId");
  const target = String(input.to);
  assertValidAddress(target, "to");

  const value = parseWei(input.valueWei ?? 0n);
  assertNonNegativeWei(value, "valueWei");

  const data = String(input.data ?? "0x");
  assertValidCalldata(data, "data");
  assertValidSlippageBps(input.expectedSlippageBps, "expectedSlippageBps");

  const source = input.source ?? "byreal-compatible";
  const route = input.route ?? `byreal:${input.skillId ?? input.strategy ?? source}`;
  const intent =
    input.intent ??
    `Byreal/RealClaw-compatible skill proposed an on-chain action${input.strategy ? ` for ${input.strategy}` : ""}.`;

  return {
    agentId,
    policyId,
    tx: {
      to: getAddress(target),
      value,
      data: data as Hex,
    },
    metadata: {
      intent,
      route,
      expectedSlippageBps: input.expectedSlippageBps,
    },
  };
}

export function createByrealGatewayAdapter(firewall: ByrealGatewayFirewall): ByrealGatewayAdapter {
  return {
    normalize: normalizeByrealSkillAction,
    run(input, options) {
      return firewall.runGatewayAction(normalizeByrealSkillAction(input), options);
    },
  };
}

function parsePositiveId(value: bigint | string, field: string) {
  const parsed = typeof value === "bigint" ? value : parsePositiveBigIntString(value, field);
  assertPositiveId(parsed, field);
  return parsed;
}

function parsePositiveBigIntString(value: string, field: string) {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new InterlockInputError(`${field} must be a positive integer string.`);
  }
  return BigInt(value);
}

function parseWei(value: bigint | string) {
  if (typeof value === "bigint") return value;
  if (!/^\d+$/.test(value)) {
    throw new InterlockInputError("valueWei must be a non-negative integer string in wei.");
  }
  return BigInt(value);
}
