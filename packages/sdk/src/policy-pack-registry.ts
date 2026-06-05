import { keccak256, stringToHex } from "viem";
import { mantleEcosystemPolicyPacks, type MantleEcosystemPolicyPack } from "./ecosystem-packs.js";

export type PolicyPackTrustTier = "official" | "verified" | "community" | "deprecated";

export type PolicyPackRegistryEntry = Omit<MantleEcosystemPolicyPack, "judgeHook"> & {
  registryVersion: "interlock.policy-registry.v1";
  trust: PolicyPackTrustTier;
  source: string;
  contentHash: `0x${string}`;
  judgeHook: string;
};

export type PolicyPackRegistryValidation = {
  ok: boolean;
  entries: PolicyPackRegistryEntry[];
  errors: string[];
};

export function listPolicyPackRegistryEntries(): PolicyPackRegistryEntry[] {
  return mantleEcosystemPolicyPacks.map(toRegistryEntry);
}

export function getPolicyPackRegistryEntry(id: string): PolicyPackRegistryEntry | undefined {
  return listPolicyPackRegistryEntries().find((entry) => entry.id === id || entry.aliases?.includes(id));
}

export function validatePolicyPackRegistry(entries: PolicyPackRegistryEntry[] = listPolicyPackRegistryEntries()): PolicyPackRegistryValidation {
  const seen = new Set<string>();
  const errors: string[] = [];

  for (const entry of entries) {
    if (entry.registryVersion !== "interlock.policy-registry.v1") {
      errors.push(`${entry.id}: invalid registryVersion`);
    }
    if (seen.has(entry.id)) {
      errors.push(`${entry.id}: duplicate id`);
    }
    seen.add(entry.id);
    if (!entry.contentHash || !/^0x[a-fA-F0-9]{64}$/.test(entry.contentHash)) {
      errors.push(`${entry.id}: missing contentHash`);
    }
    if (entry.mode === "template" && entry.requiredAddresses.length === 0) {
      errors.push(`${entry.id}: template packs must describe required real addresses`);
    }
    if (entry.requiredAddresses.some((value) => /fake|placeholder|0x0000000000000000000000000000000000000000/i.test(value))) {
      errors.push(`${entry.id}: requiredAddresses must not contain fake or placeholder addresses`);
    }
    if (entry.supportedSelectors.length === 0) {
      errors.push(`${entry.id}: at least one supported selector is required`);
    }
  }

  return { ok: errors.length === 0, entries, errors };
}

function toRegistryEntry(pack: MantleEcosystemPolicyPack): PolicyPackRegistryEntry {
  const base = {
    registryVersion: "interlock.policy-registry.v1" as const,
    trust: "official" as const,
    source: `interlock://policy-packs/${pack.id}`,
    ...pack,
  };
  return {
    ...base,
    contentHash: keccak256(stringToHex(stableJson(base))),
  };
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => [key, sortKeys(nested)]));
}
