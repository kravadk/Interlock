import { getAddress, isAddress, toFunctionSelector, type Abi, type Address, type Hex } from "viem";
import { policyPackVersion, validatePolicyPack, type PolicyPack } from "./policy-pack.js";

export type GeneratedPolicySelector = {
  selector: Hex;
  name: string;
  label: string;
  stateMutability?: string;
};

export type PolicyPackFromAbiInput = {
  address: Address;
  abi: Abi | string;
  name?: string;
  description?: string;
  chainId?: number;
  maxNativeValue?: string;
  maxSlippageBps?: number;
  includeViewFunctions?: boolean;
};

export function generatePolicyPackFromAbi(input: PolicyPackFromAbiInput): PolicyPack & {
  generatedSelectors: GeneratedPolicySelector[];
  mode: "template";
  source: "abi";
} {
  if (!isAddress(input.address)) {
    throw new Error("ABI policy builder requires a real EVM contract address.");
  }
  const abi = parseAbiInput(input.abi);
  const generatedSelectors = abi
    .filter((item) => item.type === "function")
    .filter((item) => input.includeViewFunctions || (item.stateMutability !== "view" && item.stateMutability !== "pure"))
    .map((item) => {
      const signature = `${item.name}(${item.inputs.map((arg) => arg.type).join(",")})`;
      return {
        selector: toFunctionSelector(signature) as Hex,
        name: item.name,
        label: signature,
        stateMutability: item.stateMutability,
      };
    })
    .filter((item, index, items) => items.findIndex((candidate) => candidate.selector === item.selector) === index)
    .sort((a, b) => a.label.localeCompare(b.label));

  if (generatedSelectors.length === 0) {
    throw new Error("ABI policy builder found no function selectors. Provide a contract ABI with callable functions.");
  }

  const pack = validatePolicyPack({
    version: policyPackVersion,
    name: input.name ?? `Generated policy for ${getAddress(input.address)}`,
    description: input.description ?? "Template generated from a developer-supplied ABI. Review every selector before applying on-chain.",
    chainId: input.chainId,
    maxNativeValue: input.maxNativeValue ?? "0",
    maxSlippageBps: input.maxSlippageBps ?? 0,
    targets: [{ address: getAddress(input.address), label: "Developer supplied contract" }],
    selectors: generatedSelectors.map(({ selector, label }) => ({ selector, label })),
    notes: [
      "Generated from ABI. This is a template, not an audit.",
      "Only apply selectors that match the exact capability the agent needs.",
      "Do not use placeholder addresses or unverified ABIs.",
    ],
  });

  return {
    ...pack,
    generatedSelectors,
    mode: "template",
    source: "abi",
  };
}

function parseAbiInput(value: Abi | string): Abi {
  if (typeof value !== "string") return value;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("ABI JSON must be an array.");
    }
    return parsed as Abi;
  } catch (error) {
    throw new Error(`Invalid ABI JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}
