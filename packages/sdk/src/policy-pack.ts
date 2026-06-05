import { isAddress, isHex, type Address, type Hex } from "viem";
import type { CreatePolicyInput } from "./types.js";
import type { PolicyPreset } from "./presets.js";
import type { TokenRule } from "./token-guard.js";
import { maxSlippageBps as maxAllowedSlippageBps } from "./validation.js";

export const policyPackVersion = "interlock.policy.v1" as const;

export type PolicyPackTarget = {
  address: Address;
  label?: string;
};

export type PolicyPackSelector = {
  selector: Hex;
  label?: string;
};

export type PolicyPack = {
  version: typeof policyPackVersion;
  name: string;
  description?: string;
  chainId?: number;
  maxNativeValue: string;
  maxSlippageBps: number;
  targets: PolicyPackTarget[];
  selectors: PolicyPackSelector[];
  tokenRules?: TokenRule[];
  notes?: string[];
};

export function policyPackFromPreset(
  preset: PolicyPreset,
  options: { name?: string; description?: string; chainId?: number } = {},
): PolicyPack {
  return validatePolicyPack({
    version: policyPackVersion,
    name: options.name ?? preset.name,
    description: options.description ?? preset.description,
    chainId: options.chainId,
    maxNativeValue: preset.maxNativeValue.toString(),
    maxSlippageBps: preset.maxSlippageBps,
    targets: preset.targets.map((address) => ({ address })),
    selectors: preset.selectors.map((selector) => ({
      selector,
      label: preset.selectorLabels[selector] ?? "custom selector",
    })),
    notes: preset.notes,
  });
}

export function policyPackToCreatePolicyInput(agentId: bigint, pack: PolicyPack): CreatePolicyInput {
  const validated = validatePolicyPack(pack);
  return {
    agentId,
    maxNativeValue: BigInt(validated.maxNativeValue),
    maxSlippageBps: validated.maxSlippageBps,
    targets: validated.targets.map((target) => target.address),
    selectors: validated.selectors.map((selector) => selector.selector),
  };
}

export function parsePolicyPack(jsonText: string): PolicyPack {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new Error(`Invalid policy pack JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validatePolicyPack(parsed);
}

export function validatePolicyPack(input: unknown): PolicyPack {
  if (!isRecord(input)) {
    throw new Error("Policy pack must be a JSON object.");
  }

  if (input.version !== policyPackVersion) {
    throw new Error(`Policy pack version must be ${policyPackVersion}.`);
  }

  if (typeof input.name !== "string" || input.name.trim().length === 0) {
    throw new Error("Policy pack name is required.");
  }

  const maxNativeValue = stringField(input, "maxNativeValue");
  if (!/^\d+$/.test(maxNativeValue)) {
    throw new Error("Policy pack maxNativeValue must be a wei string.");
  }

  const maxSlippageBps = input.maxSlippageBps;
  if (
    typeof maxSlippageBps !== "number" ||
    !Number.isInteger(maxSlippageBps) ||
    maxSlippageBps < 0 ||
    maxSlippageBps > maxAllowedSlippageBps
  ) {
    throw new Error(`Policy pack maxSlippageBps must be an integer between 0 and ${maxAllowedSlippageBps}.`);
  }

  const targets = arrayField(input, "targets").map((value, index) => {
    if (!isRecord(value) || typeof value.address !== "string" || !isAddress(value.address)) {
      throw new Error(`Policy pack target #${index + 1} must contain a valid EVM address.`);
    }
    return optionalLabel({ address: value.address as Address }, value.label);
  });

  const selectors = arrayField(input, "selectors").map((value, index) => {
    if (!isRecord(value) || typeof value.selector !== "string" || !isHex(value.selector) || !/^0x[a-fA-F0-9]{8}$/.test(value.selector)) {
      throw new Error(`Policy pack selector #${index + 1} must contain a bytes4 selector.`);
    }
    return optionalLabel({ selector: value.selector as Hex }, value.label);
  });

  if (targets.length === 0) {
    throw new Error("Policy pack must contain at least one target.");
  }

  if (selectors.length === 0) {
    throw new Error("Policy pack must contain at least one selector.");
  }

  const pack: PolicyPack = {
    version: policyPackVersion,
    name: input.name.trim(),
    maxNativeValue,
    maxSlippageBps,
    targets: dedupeBy(targets, (target) => target.address.toLowerCase()),
    selectors: dedupeBy(selectors, (selector) => selector.selector.toLowerCase()),
  };

  if (typeof input.description === "string" && input.description.trim()) {
    pack.description = input.description.trim();
  }

  if (typeof input.chainId === "number" && Number.isInteger(input.chainId) && input.chainId > 0) {
    pack.chainId = input.chainId;
  }

  if (Array.isArray(input.notes)) {
    pack.notes = input.notes.filter((note): note is string => typeof note === "string" && note.trim().length > 0);
  }

  if (Array.isArray(input.tokenRules)) {
    pack.tokenRules = input.tokenRules.map((value, index) => {
      if (!isRecord(value) || typeof value.token !== "string" || !isAddress(value.token)) {
        throw new Error(`Policy pack tokenRules #${index + 1} must contain a valid token address.`);
      }
      const tokenRule: TokenRule = { token: value.token as Address };
      if (Array.isArray(value.allowedRecipients)) {
        tokenRule.allowedRecipients = value.allowedRecipients.map((recipient, recipientIndex) => {
          if (typeof recipient !== "string" || !isAddress(recipient)) {
            throw new Error(`Policy pack tokenRules #${index + 1} allowedRecipients #${recipientIndex + 1} must be an EVM address.`);
          }
          return recipient as Address;
        });
      }
      if (Array.isArray(value.allowedSpenders)) {
        tokenRule.allowedSpenders = value.allowedSpenders.map((spender, spenderIndex) => {
          if (typeof spender !== "string" || !isAddress(spender)) {
            throw new Error(`Policy pack tokenRules #${index + 1} allowedSpenders #${spenderIndex + 1} must be an EVM address.`);
          }
          return spender as Address;
        });
      }
      if (typeof value.maxAmount === "string") {
        if (!/^\d+$/.test(value.maxAmount)) throw new Error(`Policy pack tokenRules #${index + 1} maxAmount must be a wei-style integer string.`);
        tokenRule.maxAmount = value.maxAmount;
      }
      if (typeof value.allowUnlimitedApprove === "boolean") {
        tokenRule.allowUnlimitedApprove = value.allowUnlimitedApprove;
      }
      return tokenRule;
    });
  }

  return pack;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Policy pack ${key} is required.`);
  }
  return value.trim();
}

function arrayField(input: Record<string, unknown>, key: string): unknown[] {
  const value = input[key];
  if (!Array.isArray(value)) {
    throw new Error(`Policy pack ${key} must be an array.`);
  }
  return value;
}

function optionalLabel<T extends object>(value: T, label: unknown): T & { label?: string } {
  if (typeof label === "string" && label.trim()) {
    return { ...value, label: label.trim() };
  }
  return value;
}

function dedupeBy<T>(values: T[], keyOf: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = keyOf(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
