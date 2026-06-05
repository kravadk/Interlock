import { describe, expect, it } from "vitest";
import { parseEther } from "viem";
import { deployedAddresses } from "@interlock/shared";
import { approvalPolicy, buildCreatePolicyInput, commonSelectors, conservativeDeFiPolicy, describePolicyPreset, paymentPolicy, rwaReadOnlyPolicy } from "./presets.js";

const target = deployedAddresses.mantleSepolia.agentRegistry;
const extraTarget = deployedAddresses.mantleSepolia.policyRegistry;

describe("policy presets", () => {
  it("builds conservative DeFi presets with deduped selectors", () => {
    const preset = conservativeDeFiPolicy({ targets: [target], extraTargets: [extraTarget], extraSelectors: [commonSelectors.erc4626Deposit] });
    expect(preset.targets).toEqual([target, extraTarget]);
    expect(preset.selectors).toContain(commonSelectors.erc4626Deposit);
    expect(preset.selectors.filter((selector) => selector === commonSelectors.erc4626Deposit)).toHaveLength(1);
  });

  it("builds distinct payment and RWA presets", () => {
    expect(paymentPolicy({ targets: [target] }).selectors).toContain(commonSelectors.erc20Transfer);
    expect(rwaReadOnlyPolicy({ targets: [target] }).maxNativeValue).toBe(0n);
  });

  it("keeps approval selectors isolated", () => {
    expect(approvalPolicy({ targets: [target] }).selectors).toEqual([commonSelectors.erc20Approve]);
  });

  it("converts presets to createPolicy inputs and summaries", () => {
    const preset = conservativeDeFiPolicy({ targets: [target], maxNativeValue: parseEther("0.03"), maxSlippageBps: 50 });
    expect(buildCreatePolicyInput(7n, preset)).toMatchObject({ agentId: 7n, maxNativeValue: parseEther("0.03"), maxSlippageBps: 50 });
    expect(describePolicyPreset(preset).selectors.length).toBeGreaterThan(0);
  });
});
