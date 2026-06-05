import { describe, expect, it } from "vitest";
import { getMantleEcosystemPolicyPack, listMantleEcosystemPolicyPacks } from "./ecosystem-packs.js";

describe("Mantle ecosystem policy packs", () => {
  it("includes protocol-specific Mantle DeFi guard templates", () => {
    const ids = listMantleEcosystemPolicyPacks().map((pack) => pack.id);

    expect(ids).toContain("merchant-moe-swap-guard");
    expect(ids).toContain("agni-clmm-guard");
    expect(ids).toContain("fluxion-rwa-spot-guard");
  });

  it("does not ship fake protocol addresses in template metadata", () => {
    for (const pack of listMantleEcosystemPolicyPacks()) {
      expect(pack.requiredAddresses.join(" ")).not.toMatch(/fake|placeholder|0x0000000000000000000000000000000000000000/i);
      if (pack.mode === "template") {
        expect(pack.requiredAddresses.length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps protocol packs explicit about team-supplied real targets", () => {
    for (const id of ["merchant-moe-swap-guard", "agni-clmm-guard", "fluxion-rwa-spot-guard"]) {
      const pack = getMantleEcosystemPolicyPack(id);

      expect(pack?.mode).toBe("template");
      expect(pack?.docsUrl).toMatch(/^https:\/\//);
      expect(pack?.requiredAddresses.join(" ")).toMatch(/supplied by the integrating team/);
      expect(pack?.supportedSelectors.length).toBeGreaterThan(2);
    }
  });
});
