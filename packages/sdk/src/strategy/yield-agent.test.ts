import { describe, expect, it } from "vitest";
import { pickAllocation, type YieldSignal, type YieldStrategyConfig } from "./yield-agent.js";

const sig = (over: Partial<YieldSignal>): YieldSignal => ({
  source: "defillama",
  poolId: "p",
  project: "test",
  chain: "Mantle",
  fetchedAt: "2026-06-09T00:00:00.000Z",
  ...over,
});

const config: YieldStrategyConfig = {
  minTvlUsd: 100_000,
  maxApy: 50,
  maxAllocationWei: 1_000_000_000_000_000_000n, // 1e18
  fullConfidenceTvlUsd: 1_000_000,
};

describe("pickAllocation", () => {
  it("picks the highest risk-adjusted pool among investable ones", () => {
    const d = pickAllocation({
      config,
      signals: [
        sig({ poolId: "a", project: "alpha", symbol: "USDC", apy: 8, tvlUsd: 2_000_000 }),
        sig({ poolId: "b", project: "beta", symbol: "USDT", apy: 12, tvlUsd: 2_000_000 }),
      ],
    });
    expect(d.chosen?.poolId).toBe("b"); // higher APY, both full confidence
    expect(d.allocateWei).toBe(1_000_000_000_000_000_000n); // tvl >= fullConfidence → full budget
  });

  it("excludes pools below the TVL floor", () => {
    const d = pickAllocation({
      config,
      signals: [sig({ poolId: "thin", apy: 30, tvlUsd: 1_000 })],
    });
    expect(d.chosen).toBeUndefined();
    expect(d.allocateWei).toBe(0n);
    expect(d.ranked[0].riskFlags).toContain("tvl-below-floor");
  });

  it("excludes absurd-APY pools (likely manipulated/unsustainable)", () => {
    const d = pickAllocation({
      config,
      signals: [
        sig({ poolId: "scam", apy: 5000, tvlUsd: 2_000_000 }),
        sig({ poolId: "safe", apy: 9, tvlUsd: 2_000_000 }),
      ],
    });
    expect(d.chosen?.poolId).toBe("safe");
    const scam = d.ranked.find((p) => p.signal.poolId === "scam");
    expect(scam?.investable).toBe(false);
    expect(scam?.riskFlags).toContain("apy-too-high");
  });

  it("sizes the allocation by liquidity confidence (thin-but-investable → smaller ticket)", () => {
    const d = pickAllocation({
      config,
      signals: [sig({ poolId: "mid", apy: 10, tvlUsd: 250_000 })], // 25% of fullConfidence
    });
    expect(d.chosen?.poolId).toBe("mid");
    expect(d.allocateWei).toBe(250_000_000_000_000_000n); // 25% of 1e18
  });

  it("returns no allocation when nothing passes the filters", () => {
    const d = pickAllocation({
      config,
      signals: [
        sig({ poolId: "x", apy: 200, tvlUsd: 5_000_000 }),
        sig({ poolId: "y", apy: 6, tvlUsd: 10 }),
        sig({ poolId: "z", apy: undefined, tvlUsd: 5_000_000 }),
      ],
    });
    expect(d.chosen).toBeUndefined();
    expect(d.allocateWei).toBe(0n);
    expect(d.rationale).toMatch(/No investable pool/);
  });

  it("is deterministic and ranks investable pools first", () => {
    const signals = [
      sig({ poolId: "thin", apy: 40, tvlUsd: 1_000 }),
      sig({ poolId: "good", apy: 10, tvlUsd: 2_000_000 }),
    ];
    const a = pickAllocation({ config, signals });
    const b = pickAllocation({ config, signals });
    expect(a.ranked.map((p) => p.signal.poolId)).toEqual(b.ranked.map((p) => p.signal.poolId));
    expect(a.ranked[0].signal.poolId).toBe("good"); // investable first
  });
});
