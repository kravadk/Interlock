import { describe, expect, it } from "vitest";
import { encodeFunctionData, erc20Abi, maxUint256 } from "viem";
import { buildRwaEvidenceRows, tokenEvidenceFromAction } from "./action-evidence";
import type { YieldDataPoint } from "./indexer";

const TOKEN = "0x1111111111111111111111111111111111111111";
const RECIPIENT = "0x2222222222222222222222222222222222222222";

const transferCalldata = (amount: bigint) =>
  encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [RECIPIENT, amount] });
const approveCalldata = (amount: bigint) =>
  encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [RECIPIENT, amount] });

// A yield point in the *indexer* wire shape (poolId, optional chain/symbol, no id/underlyingTokens).
const yieldPoint = (over: Partial<YieldDataPoint> = {}): YieldDataPoint => ({
  source: "defillama",
  poolId: "pool-abc",
  project: "Some Mantle Pool",
  riskNotes: [],
  fetchedAt: new Date().toISOString(),
  ...over,
});

describe("tokenEvidenceFromAction (advisory token rule wiring)", () => {
  it("blocks unlimited approve with UNLIMITED_APPROVE_BLOCKED", () => {
    const evidence = tokenEvidenceFromAction(TOKEN, approveCalldata(maxUint256));
    expect(evidence.status).toBe("fail");
    expect(evidence.reasonCode).toBe("UNLIMITED_APPROVE_BLOCKED");
    expect(evidence.message).toMatch(/advisory, off-chain/);
  });

  it("passes a bounded transfer with TOKEN_RULE_PASSED", () => {
    const evidence = tokenEvidenceFromAction(TOKEN, transferCalldata(1_000n));
    expect(evidence.status).toBe("pass");
    expect(evidence.reasonCode).toBe("TOKEN_RULE_PASSED");
    expect(evidence.details).toContain(`amount 1000`);
  });

  it("passes a bounded approve", () => {
    const evidence = tokenEvidenceFromAction(TOKEN, approveCalldata(500n));
    expect(evidence.status).toBe("pass");
    expect(evidence.reasonCode).toBe("TOKEN_RULE_PASSED");
  });

  it("reports a ready (non-fail) state for non-ERC20 calldata", () => {
    const evidence = tokenEvidenceFromAction(TOKEN, "0xdeadbeef");
    expect(evidence.status).toBe("ready");
    expect(evidence.reasonCode).toBeUndefined();
  });

  it("does not evaluate when the target is not a valid address (no throw)", () => {
    const evidence = tokenEvidenceFromAction("not-an-address", transferCalldata(1n));
    expect(evidence.status).toBe("ready");
    expect(evidence.reasonCode).toBeUndefined();
  });
});

describe("buildRwaEvidenceRows (SDK RWA evidence wiring)", () => {
  it("shows an honest empty state with no rows when no yields are loaded", () => {
    const evidence = buildRwaEvidenceRows([]);
    expect(evidence.status).toBe("ready");
    expect(evidence.rows).toHaveLength(0);
    expect(evidence.reasonCode).toBeUndefined();
  });

  it("tolerates indexer-shaped points missing chain/symbol/tvl/apy and builds rows", () => {
    const evidence = buildRwaEvidenceRows([yieldPoint({ tvlUsd: 5_000_000, apy: 4 })]);
    expect(evidence.rows).toHaveLength(1);
    expect(evidence.rows[0]).toMatch(/Some Mantle Pool/);
  });

  it("flags a low-TVL pool with RWA_TVL_TOO_LOW + an evidence hash", () => {
    const evidence = buildRwaEvidenceRows([yieldPoint({ tvlUsd: 1_000, apy: 4 })]);
    expect(evidence.status).toBe("fail");
    expect(evidence.reasonCode).toBe("RWA_TVL_TOO_LOW");
    expect(evidence.evidenceHash).toMatch(/^0x[0-9a-f]+$/);
  });

  it("flags a high-APY pool with RWA_APY_TOO_HIGH", () => {
    const evidence = buildRwaEvidenceRows([yieldPoint({ tvlUsd: 5_000_000, apy: 120 })]);
    expect(evidence.status).toBe("fail");
    expect(evidence.reasonCode).toBe("RWA_APY_TOO_HIGH");
  });

  it("passes a healthy fresh pool with POLICY_PASSED", () => {
    const evidence = buildRwaEvidenceRows([yieldPoint({ tvlUsd: 5_000_000, apy: 6 })]);
    expect(evidence.status).toBe("pass");
    expect(evidence.reasonCode).toBe("POLICY_PASSED");
  });
});
