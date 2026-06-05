import { describe, expect, it } from "vitest";
import { getPolicyPackRegistryEntry, listPolicyPackRegistryEntries, validatePolicyPackRegistry } from "./policy-pack-registry.js";

describe("policy pack registry", () => {
  it("publishes trusted Mantle policy pack metadata with stable content hashes", () => {
    const entries = listPolicyPackRegistryEntries();
    const validation = validatePolicyPackRegistry(entries);

    expect(validation.ok).toBe(true);
    expect(entries.map((entry) => entry.id)).toContain("interlock-test-strategy-guard");
    expect(entries.map((entry) => entry.id)).toContain("mantle-defi-trading-guard");
    expect(entries.map((entry) => entry.id)).toContain("merchant-moe-swap-guard");
    expect(entries.map((entry) => entry.id)).toContain("agni-clmm-guard");
    expect(entries.map((entry) => entry.id)).toContain("fluxion-rwa-spot-guard");
    expect(entries.map((entry) => entry.id)).toContain("agent-wallet-spending-constitution");
    expect(entries.every((entry) => /^0x[a-fA-F0-9]{64}$/.test(entry.contentHash))).toBe(true);
    expect(entries.every((entry) => entry.trust === "official")).toBe(true);
  });

  it("keeps compatibility aliases for older ecosystem pack ids", () => {
    const entry = getPolicyPackRegistryEntry("mantle-rwa-yield-guard");

    expect(entry?.aliases).toContain("mantle-rwa-guard");
  });
});
