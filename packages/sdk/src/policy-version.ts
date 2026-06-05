import type { Address, Hex } from "viem";
import type { AgentPolicy } from "./types.js";
import { hashJson } from "./policy.js";
import { assertPositiveId, assertValidAddress, assertValidSelector } from "./validation.js";

export const policyVersionFormat = "interlock.policy-version.v1" as const;

export type PolicyVersionSource = "dashboard" | "cli" | "sdk" | "api" | "import";

export type PolicyVersionSnapshot = {
  version: typeof policyVersionFormat;
  versionId: string;
  policyId: string;
  agentId: string;
  createdAt: string;
  source: PolicyVersionSource | string;
  chainId: number;
  contentHash: Hex;
  owner: Address;
  targets: Address[];
  selectors: Hex[];
  maxNativeValue: string;
  maxSlippageBps: number;
  active: boolean;
};

export type PolicyVersionDiff = {
  ok: boolean;
  from: string;
  to: string;
  changes: {
    owner?: { from: Address; to: Address };
    agentId?: { from: string; to: string };
    maxNativeValue?: { from: string; to: string };
    maxSlippageBps?: { from: number; to: number };
    active?: { from: boolean; to: boolean };
    targetsAdded: Address[];
    targetsRemoved: Address[];
    selectorsAdded: Hex[];
    selectorsRemoved: Hex[];
  };
};

export type PolicyVersionVerifyResult = PolicyVersionDiff & {
  snapshotContentHashValid: boolean;
  currentContentHash: Hex;
};

export function buildPolicyVersionSnapshot(input: {
  policyId: bigint;
  policy: AgentPolicy;
  targets: Address[];
  selectors: Hex[];
  source?: PolicyVersionSource | string;
  chainId: number;
  createdAt?: string;
}): PolicyVersionSnapshot {
  assertPositiveId(input.policyId, "policyId");
  assertPositiveId(input.policy.agentId, "policy.agentId");

  const base = {
    version: policyVersionFormat,
    policyId: input.policyId.toString(),
    agentId: input.policy.agentId.toString(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    source: input.source ?? "sdk",
    chainId: input.chainId,
    owner: normalizeAddress(input.policy.owner, "policy.owner"),
    targets: input.targets.map((target) => normalizeAddress(target, "target")).sort(compareLower),
    selectors: input.selectors.map((selector) => normalizeSelector(selector)).sort(compareLower),
    maxNativeValue: input.policy.maxNativeValue.toString(),
    maxSlippageBps: input.policy.maxSlippageBps,
    active: input.policy.active,
  };
  const contentHash = policyVersionContentHash(base);

  return {
    ...base,
    versionId: `policy-${base.policyId}-${contentHash.slice(2, 10)}`,
    contentHash,
  };
}

export function policyVersionContentHash(input: Omit<PolicyVersionSnapshot, "versionId" | "contentHash">): Hex {
  return hashJson(policyVersionComparable(input));
}

export function diffPolicyVersionSnapshots(from: PolicyVersionSnapshot, to: PolicyVersionSnapshot): PolicyVersionDiff {
  assertPolicyVersionSnapshot(from);
  assertPolicyVersionSnapshot(to);

  const changes: PolicyVersionDiff["changes"] = {
    owner: from.owner.toLowerCase() === to.owner.toLowerCase() ? undefined : { from: from.owner, to: to.owner },
    agentId: from.agentId === to.agentId ? undefined : { from: from.agentId, to: to.agentId },
    maxNativeValue: from.maxNativeValue === to.maxNativeValue ? undefined : { from: from.maxNativeValue, to: to.maxNativeValue },
    maxSlippageBps: from.maxSlippageBps === to.maxSlippageBps ? undefined : { from: from.maxSlippageBps, to: to.maxSlippageBps },
    active: from.active === to.active ? undefined : { from: from.active, to: to.active },
    targetsAdded: to.targets.filter((target) => !includesAddress(from.targets, target)),
    targetsRemoved: from.targets.filter((target) => !includesAddress(to.targets, target)),
    selectorsAdded: to.selectors.filter((selector) => !includesSelector(from.selectors, selector)),
    selectorsRemoved: from.selectors.filter((selector) => !includesSelector(to.selectors, selector)),
  };

  return {
    ok:
      !changes.owner &&
      !changes.agentId &&
      !changes.maxNativeValue &&
      !changes.maxSlippageBps &&
      !changes.active &&
      changes.targetsAdded.length === 0 &&
      changes.targetsRemoved.length === 0 &&
      changes.selectorsAdded.length === 0 &&
      changes.selectorsRemoved.length === 0,
    from: from.versionId,
    to: to.versionId,
    changes,
  };
}

export function verifyPolicyVersionSnapshot(input: {
  snapshot: PolicyVersionSnapshot;
  current: PolicyVersionSnapshot;
}): PolicyVersionVerifyResult {
  const expectedSnapshotHash = policyVersionContentHash(input.snapshot);
  const currentContentHash = policyVersionContentHash(input.current);
  const diff = diffPolicyVersionSnapshots(input.snapshot, input.current);

  return {
    ...diff,
    snapshotContentHashValid: expectedSnapshotHash.toLowerCase() === input.snapshot.contentHash.toLowerCase(),
    currentContentHash,
  };
}

export function assertPolicyVersionSnapshot(value: PolicyVersionSnapshot): void {
  if (value.version !== policyVersionFormat) {
    throw new Error(`Unsupported policy version format: ${value.version}`);
  }
  if (!/^[1-9]\d*$/.test(value.policyId)) {
    throw new Error("Policy snapshot policyId must be a positive integer string.");
  }
  if (!/^[1-9]\d*$/.test(value.agentId)) {
    throw new Error("Policy snapshot agentId must be a positive integer string.");
  }
  normalizeAddress(value.owner, "snapshot.owner");
  for (const target of value.targets) normalizeAddress(target, "snapshot.target");
  for (const selector of value.selectors) normalizeSelector(selector);
  if (!/^0x[0-9a-fA-F]{64}$/.test(value.contentHash)) {
    throw new Error("Policy snapshot contentHash must be bytes32 hex.");
  }
}

function policyVersionComparable(input: Omit<PolicyVersionSnapshot, "versionId" | "contentHash">) {
  return {
    version: input.version,
    policyId: input.policyId,
    agentId: input.agentId,
    chainId: input.chainId,
    owner: input.owner.toLowerCase(),
    targets: input.targets.map((target) => target.toLowerCase()).sort(),
    selectors: input.selectors.map((selector) => selector.toLowerCase()).sort(),
    maxNativeValue: input.maxNativeValue,
    maxSlippageBps: input.maxSlippageBps,
    active: input.active,
  };
}

function normalizeAddress(value: Address, field: string): Address {
  assertValidAddress(value, field);
  return value.toLowerCase() as Address;
}

function normalizeSelector(value: Hex): Hex {
  assertValidSelector(value, "selector");
  return value.toLowerCase() as Hex;
}

function includesAddress(values: Address[], value: Address) {
  return values.some((item) => item.toLowerCase() === value.toLowerCase());
}

function includesSelector(values: Hex[], value: Hex) {
  return values.some((item) => item.toLowerCase() === value.toLowerCase());
}

function compareLower(a: string, b: string) {
  return a.toLowerCase().localeCompare(b.toLowerCase());
}
