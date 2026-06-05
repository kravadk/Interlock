import { describe, expect, it } from "vitest";
import { lintPolicyPack, lintPolicyPackJson } from "./policy-lint.js";
import type { PolicyPack } from "./policy-pack.js";

const basePack: PolicyPack = {
  version: "interlock.policy.v1",
  name: "Test",
  chainId: 5003,
  maxNativeValue: "1000",
  maxSlippageBps: 100,
  targets: [{ address: "0x1111111111111111111111111111111111111111", label: "router" }],
  selectors: [{ selector: "0x2de5aaf7", label: "getAgent" }],
};

describe("lintPolicyPack", () => {
  it("passes a clean pack with no errors", () => {
    const result = lintPolicyPack(basePack);
    expect(result.ok).toBe(true);
    expect(result.errors).toBe(0);
  });

  it("errors when there are no targets or selectors", () => {
    const result = lintPolicyPack({ ...basePack, targets: [], selectors: [] });
    expect(result.ok).toBe(false);
    expect(result.findings.map((f) => f.code)).toEqual(expect.arrayContaining(["NO_TARGETS", "NO_SELECTORS"]));
  });

  it("warns on an approve selector", () => {
    const result = lintPolicyPack({
      ...basePack,
      selectors: [{ selector: "0x095ea7b3", label: "approve" }],
    });
    expect(result.ok).toBe(true); // warning, not error
    expect(result.findings.some((f) => f.code === "APPROVE_SELECTOR")).toBe(true);
  });

  it("warns on a missing chainId and high slippage", () => {
    const result = lintPolicyPack({ ...basePack, chainId: undefined, maxSlippageBps: 2000 });
    expect(result.findings.map((f) => f.code)).toEqual(expect.arrayContaining(["NO_CHAIN_ID", "HIGH_SLIPPAGE"]));
  });

  it("surfaces invalid JSON as a single error finding", () => {
    const result = lintPolicyPackJson("{ not valid");
    expect(result.ok).toBe(false);
    expect(result.findings[0]?.code).toBe("INVALID_PACK");
  });
});
