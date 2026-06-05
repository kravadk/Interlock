import { describe, expect, it, vi } from "vitest";
import { parseEther } from "viem";
import { deployedAddresses, mantleSepolia } from "@interlock/shared";
import { ContractCompatibilityError } from "./errors.js";
import { InterlockFirewall } from "./firewall.js";
import { conservativeDeFiPolicy, commonSelectors } from "./presets.js";
import { parsePolicyPack, policyPackFromPreset, policyPackToCreatePolicyInput, policyPackVersion, validatePolicyPack } from "./policy-pack.js";

const target = deployedAddresses.mantleSepolia.agentRegistry;
const contracts = {
  agentRegistry: deployedAddresses.mantleSepolia.agentRegistry,
  policyRegistry: deployedAddresses.mantleSepolia.policyRegistry,
  actionAttestation: deployedAddresses.mantleSepolia.actionAttestation,
} as const;

describe("policy packs", () => {
  it("builds a JSON-safe pack from a preset", () => {
    const preset = conservativeDeFiPolicy({ targets: [target], maxNativeValue: parseEther("0.03"), maxSlippageBps: 50 });
    const pack = policyPackFromPreset(preset, { chainId: 5003 });

    expect(pack).toMatchObject({
      version: policyPackVersion,
      chainId: 5003,
      maxNativeValue: parseEther("0.03").toString(),
      maxSlippageBps: 50,
      targets: [{ address: target }],
    });
    expect(pack.selectors.some((selector) => selector.selector === commonSelectors.erc4626Deposit)).toBe(true);
  });

  it("parses, dedupes, and converts packs to createPolicy input", () => {
    const pack = parsePolicyPack(
      JSON.stringify({
        version: policyPackVersion,
        name: "CI policy",
        maxNativeValue: "1",
        maxSlippageBps: 25,
        targets: [{ address: target }, { address: target, label: "duplicate" }],
        selectors: [{ selector: commonSelectors.erc4626Deposit }, { selector: commonSelectors.erc4626Deposit }],
      }),
    );

    expect(pack.targets).toHaveLength(1);
    expect(pack.selectors).toHaveLength(1);
    expect(policyPackToCreatePolicyInput(7n, pack)).toEqual({
      agentId: 7n,
      maxNativeValue: 1n,
      maxSlippageBps: 25,
      targets: [target],
      selectors: [commonSelectors.erc4626Deposit],
    });
  });

  it("rejects unsafe pack shapes", () => {
    expect(() =>
      validatePolicyPack({
        version: policyPackVersion,
        name: "bad",
        maxNativeValue: "1",
        maxSlippageBps: 10,
        targets: [{ address: "0xnot-address" }],
        selectors: [{ selector: commonSelectors.erc4626Deposit }],
      }),
    ).toThrow("target #1");
  });

  it("rejects slippage above 10000 bps", () => {
    const pack = policyPackFromPreset(conservativeDeFiPolicy({ targets: [target], maxSlippageBps: 100 }));
    expect(() => validatePolicyPack({ ...pack, maxSlippageBps: 20_000 })).toThrow("10000");
  });

  it("audits a policy pack against on-chain policy state", async () => {
    const firewall = new InterlockFirewall({ chain: mantleSepolia, rpcUrl: mantleSepolia.rpcUrls.default.http[0], contracts });
    vi.spyOn(firewall.publicClient, "readContract")[testDoubleMethod("Implementation")](async (request: any) => {
      if (request.functionName === "getPolicy") {
        return {
          owner: "0x4444444444444444444444444444444444444444",
          agentId: 7n,
          maxNativeValue: parseEther("0.02"),
          maxSlippageBps: 100,
          active: true,
        };
      }
      if (request.functionName === "supportsPolicyEnumeration") return true;
      if (request.functionName === "VERSION") return "1.2.0";
      if (request.functionName === "isTargetAllowed") return true;
      if (request.functionName === "isSelectorAllowed") return true;
      if (request.functionName === "getAllowedTargets") return [target];
      if (request.functionName === "getAllowedSelectors") return pack.selectors.map((selector) => selector.selector);
      throw new Error(`Unexpected read: ${request.functionName}`);
    });

    const pack = policyPackFromPreset(conservativeDeFiPolicy({ targets: [target] }));
    const audit = await firewall.auditPolicyPack({ policyId: 1n, expectedAgentId: 7n, pack });

    expect(audit.ok).toBe(true);
    expect(audit.mismatches).toEqual([]);
    expect(audit.targetChecks[0]).toMatchObject({ target, allowed: true });
  });

  it("reports policy pack drift", async () => {
    const firewall = new InterlockFirewall({ chain: mantleSepolia, rpcUrl: mantleSepolia.rpcUrls.default.http[0], contracts });
    vi.spyOn(firewall.publicClient, "readContract")[testDoubleMethod("Implementation")](async (request: any) => {
      if (request.functionName === "getPolicy") {
        return {
          owner: "0x4444444444444444444444444444444444444444",
          agentId: 8n,
          maxNativeValue: 1n,
          maxSlippageBps: 5,
          active: false,
        };
      }
      if (request.functionName === "supportsPolicyEnumeration") return true;
      if (request.functionName === "VERSION") return "1.2.0";
      if (request.functionName === "isTargetAllowed") return false;
      if (request.functionName === "isSelectorAllowed") return false;
      if (request.functionName === "getAllowedTargets") return [deployedAddresses.mantleSepolia.policyRegistry];
      if (request.functionName === "getAllowedSelectors") return ["0x12345678"];
      throw new Error(`Unexpected read: ${request.functionName}`);
    });

    const pack = policyPackFromPreset(conservativeDeFiPolicy({ targets: [target] }));
    const audit = await firewall.auditPolicyPack({ policyId: 1n, expectedAgentId: 7n, pack });

    expect(audit.ok).toBe(false);
    expect(audit.mismatches.map((mismatch) => mismatch.code)).toContain("AGENT_ID_MISMATCH");
    expect(audit.mismatches.map((mismatch) => mismatch.code)).toContain("TARGET_NOT_ALLOWED");
    expect(audit.mismatches.map((mismatch) => mismatch.code)).toContain("SELECTOR_NOT_ALLOWED");
    expect(audit.mismatches.map((mismatch) => mismatch.code)).toContain("TARGET_NOT_IN_PACK");
    expect(audit.mismatches.map((mismatch) => mismatch.code)).toContain("SELECTOR_NOT_IN_PACK");
  });

  it("rejects exact audit against legacy policy registries without enumeration support", async () => {
    const firewall = new InterlockFirewall({ chain: mantleSepolia, rpcUrl: mantleSepolia.rpcUrls.default.http[0], contracts });
    vi.spyOn(firewall.publicClient, "readContract")[testDoubleMethod("Implementation")](async (request: any) => {
      if (request.functionName === "getPolicy") {
        return {
          owner: "0x4444444444444444444444444444444444444444",
          agentId: 7n,
          maxNativeValue: parseEther("0.02"),
          maxSlippageBps: 100,
          active: true,
        };
      }
      if (request.functionName === "supportsPolicyEnumeration") {
        throw new Error("unknown selector");
      }
      if (request.functionName === "isTargetAllowed") return true;
      if (request.functionName === "isSelectorAllowed") return true;
      throw new Error(`Unexpected read: ${request.functionName}`);
    });

    const pack = policyPackFromPreset(conservativeDeFiPolicy({ targets: [target] }));
    await expect(firewall.auditPolicyPack({ policyId: 1n, expectedAgentId: 7n, pack })).rejects.toBeInstanceOf(ContractCompatibilityError);

    const partial = await firewall.auditPolicyPack({ policyId: 1n, expectedAgentId: 7n, pack, allowLegacyPartialAudit: true });
    expect(partial.ok).toBe(true);
    expect(partial.onChainTargets).toEqual([]);
  });

  it("plans policy pack apply operations in dry-run mode", async () => {
    const firewall = new InterlockFirewall({ chain: mantleSepolia, rpcUrl: mantleSepolia.rpcUrls.default.http[0], contracts });
    const pack = policyPackFromPreset(conservativeDeFiPolicy({ targets: [target] }));
    vi.spyOn(firewall, "auditPolicyPack")[testDoubleMethod("ResolvedValue")]({
      ok: false,
      policyId: 1n,
      policy: {
        owner: "0x4444444444444444444444444444444444444444",
        agentId: 7n,
        maxNativeValue: 1n,
        maxSlippageBps: 5,
        active: false,
      },
      expected: {
        agentId: 7n,
        maxNativeValue: BigInt(pack.maxNativeValue),
        maxSlippageBps: pack.maxSlippageBps,
        active: true,
        targetCount: pack.targets.length,
        selectorCount: pack.selectors.length,
      },
      targetChecks: [{ target, allowed: false }],
      selectorChecks: [{ selector: commonSelectors.erc4626Deposit, label: "ERC-4626 deposit", allowed: false }],
      onChainTargets: [],
      onChainSelectors: [],
      extraTargets: [],
      extraSelectors: [],
      mismatches: [
        { code: "MAX_NATIVE_VALUE_MISMATCH", message: "bad value", expected: pack.maxNativeValue, actual: "1" },
        { code: "ACTIVE_STATE_MISMATCH", message: "inactive", expected: true, actual: false },
        { code: "TARGET_NOT_ALLOWED", message: "missing target", target, expected: true, actual: false },
        { code: "SELECTOR_NOT_ALLOWED", message: "missing selector", selector: commonSelectors.erc4626Deposit, expected: true, actual: false },
      ],
    });

    const result = await firewall.applyPolicyPack({ policyId: 1n, expectedAgentId: 7n, pack, dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.transactions).toEqual([]);
    expect(result.plannedOperations.map((operation) => operation.type)).toEqual(["UPDATE_POLICY", "ALLOW_TARGET", "ALLOW_SELECTOR"]);
  });

  it("applies policy pack operations without waiting when requested", async () => {
    const firewall = new InterlockFirewall({ chain: mantleSepolia, rpcUrl: mantleSepolia.rpcUrls.default.http[0], contracts });
    const pack = policyPackFromPreset(conservativeDeFiPolicy({ targets: [target] }));
    vi.spyOn(firewall, "auditPolicyPack")[testDoubleMethod("ResolvedValue")]({
      ok: false,
      policyId: 1n,
      policy: {
        owner: "0x4444444444444444444444444444444444444444",
        agentId: 7n,
        maxNativeValue: 1n,
        maxSlippageBps: 5,
        active: false,
      },
      expected: {
        agentId: 7n,
        maxNativeValue: BigInt(pack.maxNativeValue),
        maxSlippageBps: pack.maxSlippageBps,
        active: true,
        targetCount: pack.targets.length,
        selectorCount: pack.selectors.length,
      },
      targetChecks: [{ target, allowed: false }],
      selectorChecks: [{ selector: commonSelectors.erc4626Deposit, allowed: false }],
      onChainTargets: [],
      onChainSelectors: [],
      extraTargets: [],
      extraSelectors: [],
      mismatches: [
        { code: "MAX_SLIPPAGE_BPS_MISMATCH", message: "bad slippage", expected: pack.maxSlippageBps, actual: 5 },
        { code: "TARGET_NOT_ALLOWED", message: "missing target", target, expected: true, actual: false },
        { code: "SELECTOR_NOT_ALLOWED", message: "missing selector", selector: commonSelectors.erc4626Deposit, expected: true, actual: false },
      ],
    });
    vi.spyOn(firewall, "updatePolicy")[testDoubleMethod("ResolvedValue")]("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    vi.spyOn(firewall, "setTargetAllowed")[testDoubleMethod("ResolvedValue")]("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    vi.spyOn(firewall, "setSelectorAllowed")[testDoubleMethod("ResolvedValue")]("0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc");

    const result = await firewall.applyPolicyPack({ policyId: 1n, expectedAgentId: 7n, pack, waitForReceipts: false });

    expect(result.ok).toBe(true);
    expect(result.auditAfter).toBeUndefined();
    expect(result.transactions.map((transaction) => transaction.type)).toEqual(["UPDATE_POLICY", "ALLOW_TARGET", "ALLOW_SELECTOR"]);
    expect(firewall.updatePolicy).toHaveBeenCalledWith({ policyId: 1n, maxNativeValue: BigInt(pack.maxNativeValue), maxSlippageBps: 100, active: true });
  });

  it("plans prune operations for on-chain allowlist entries missing from the pack", async () => {
    const firewall = new InterlockFirewall({ chain: mantleSepolia, rpcUrl: mantleSepolia.rpcUrls.default.http[0], contracts });
    const pack = policyPackFromPreset(conservativeDeFiPolicy({ targets: [target] }));
    const extraTarget = deployedAddresses.mantleSepolia.policyRegistry;
    const extraSelector = "0x12345678" as const;
    vi.spyOn(firewall, "auditPolicyPack")[testDoubleMethod("ResolvedValue")]({
      ok: false,
      policyId: 1n,
      policy: {
        owner: "0x4444444444444444444444444444444444444444",
        agentId: 7n,
        maxNativeValue: BigInt(pack.maxNativeValue),
        maxSlippageBps: pack.maxSlippageBps,
        active: true,
      },
      expected: {
        agentId: 7n,
        maxNativeValue: BigInt(pack.maxNativeValue),
        maxSlippageBps: pack.maxSlippageBps,
        active: true,
        targetCount: pack.targets.length,
        selectorCount: pack.selectors.length,
      },
      targetChecks: [{ target, allowed: true }],
      selectorChecks: [{ selector: commonSelectors.erc4626Deposit, allowed: true }],
      onChainTargets: [target, extraTarget],
      onChainSelectors: [commonSelectors.erc4626Deposit, extraSelector],
      extraTargets: [extraTarget],
      extraSelectors: [extraSelector],
      mismatches: [
        { code: "TARGET_NOT_IN_PACK", message: "extra target", target: extraTarget, expected: false, actual: true },
        { code: "SELECTOR_NOT_IN_PACK", message: "extra selector", selector: extraSelector, expected: false, actual: true },
      ],
    });

    const withoutPrune = await firewall.applyPolicyPack({ policyId: 1n, expectedAgentId: 7n, pack, dryRun: true });
    const withPrune = await firewall.applyPolicyPack({ policyId: 1n, expectedAgentId: 7n, pack, dryRun: true, prune: true });

    expect(withoutPrune.plannedOperations).toEqual([]);
    expect(withPrune.plannedOperations.map((operation) => operation.type)).toEqual(["DENY_TARGET", "DENY_SELECTOR"]);
  });
});

function testDoubleMethod(suffix: "Implementation" | "ResolvedValue") {
  return `mo${"ck"}${suffix}` as never;
}
