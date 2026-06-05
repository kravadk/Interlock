import { describe, expect, it } from "vitest";
import { evaluateRwaGuard, type RwaGuardConfig, type RwaPortfolioContext } from "./rwa-guard.js";

const VAULT_A = "0x00000000000000000000000000000000000000a1";
const VAULT_B = "0x00000000000000000000000000000000000000b2";
const ASSET_X = "0x00000000000000000000000000000000000000e1";
const ASSET_Y = "0x00000000000000000000000000000000000000e2";

const baseCtx = (over: Partial<RwaPortfolioContext> = {}): RwaPortfolioContext => ({
  totalValue: 100n,
  positions: [
    { asset: ASSET_X, value: 40n },
    { asset: ASSET_Y, value: 60n },
  ],
  proposed: { vault: VAULT_A, asset: ASSET_X, addValue: 0n },
  ...over,
});

describe("evaluateRwaGuard", () => {
  it("allows an action within all limits", () => {
    const config: RwaGuardConfig = { maxExposureBpsPerAsset: 6000, allowedVaults: [VAULT_A], allowedAssets: [ASSET_X, ASSET_Y] };
    const finding = evaluateRwaGuard(config, baseCtx());
    expect(finding.ok).toBe(true);
    expect(finding.exposureBps).toBe(4000);
  });

  it("blocks an unknown vault as TARGET_NOT_ALLOWED", () => {
    const config: RwaGuardConfig = { allowedVaults: [VAULT_A] };
    const finding = evaluateRwaGuard(config, baseCtx({ proposed: { vault: VAULT_B, asset: ASSET_X, addValue: 0n } }));
    expect(finding.ok).toBe(false);
    expect(finding.reason).toBe("TARGET_NOT_ALLOWED");
  });

  it("blocks an unknown asset as TARGET_NOT_ALLOWED", () => {
    const config: RwaGuardConfig = { allowedAssets: [ASSET_X] };
    const finding = evaluateRwaGuard(config, baseCtx({ proposed: { asset: ASSET_Y, addValue: 0n } }));
    expect(finding.ok).toBe(false);
    expect(finding.reason).toBe("TARGET_NOT_ALLOWED");
  });

  it("blocks when the daily rebalance budget is exhausted", () => {
    const config: RwaGuardConfig = { maxDailyRebalances: 4 };
    const finding = evaluateRwaGuard(config, baseCtx({ rebalancesToday: 4 }));
    expect(finding.ok).toBe(false);
    expect(finding.reason).toBe("DAILY_REBALANCE_EXCEEDED");
  });

  it("blocks RWA_OVEREXPOSURE when one asset exceeds the per-asset cap", () => {
    // Add 50 into ASSET_X: after = 90/150 = 6000 bps > cap 5000.
    const config: RwaGuardConfig = { maxExposureBpsPerAsset: 5000 };
    const finding = evaluateRwaGuard(config, baseCtx({ proposed: { asset: ASSET_X, addValue: 50n } }));
    expect(finding.ok).toBe(false);
    expect(finding.reason).toBe("RWA_OVEREXPOSURE");
    expect(finding.exposureBps).toBe(6000);
  });

  it("flags CONCENTRATION_RISK when within per-asset cap but over the concentration ceiling", () => {
    // after = 90/150 = 6000; per-asset cap 7000 passes, concentration ceiling 5000 fails.
    const config: RwaGuardConfig = { maxExposureBpsPerAsset: 7000, maxConcentrationBps: 5000 };
    const finding = evaluateRwaGuard(config, baseCtx({ proposed: { asset: ASSET_X, addValue: 50n } }));
    expect(finding.ok).toBe(false);
    expect(finding.reason).toBe("CONCENTRATION_RISK");
  });
});
