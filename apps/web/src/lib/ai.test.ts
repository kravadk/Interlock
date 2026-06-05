import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  validateBlockSummary,
  validateExplanation,
  validatePolicyDraft,
  type ExplainPayload,
} from "./ai-types";
import { aiEnabled, explainDecision } from "./ai";

/* -------------------------------------------------------------------------- *
 * Validators — the guard that lets the client fall back deterministically.    *
 * -------------------------------------------------------------------------- */
describe("validateExplanation", () => {
  const valid = {
    riskScore: 12,
    severity: "low",
    headline: "Action is safe.",
    plain: "All policy checks passed and the simulation succeeded.",
    recommendation: "No action needed.",
  };

  it("accepts well-formed output", () => {
    expect(validateExplanation(valid)).toEqual(valid);
  });

  it("clamps riskScore into 0-100 and rounds", () => {
    expect(validateExplanation({ ...valid, riskScore: 240.6 })?.riskScore).toBe(100);
    expect(validateExplanation({ ...valid, riskScore: -5 })?.riskScore).toBe(0);
  });

  it("rejects an unknown severity", () => {
    expect(validateExplanation({ ...valid, severity: "spicy" })).toBeNull();
  });

  it("rejects a missing field", () => {
    const { recommendation, ...partial } = valid;
    void recommendation;
    expect(validateExplanation(partial)).toBeNull();
  });

  it("rejects non-objects", () => {
    expect(validateExplanation(null)).toBeNull();
    expect(validateExplanation("nope")).toBeNull();
  });
});

describe("validatePolicyDraft", () => {
  const valid = {
    maxNativeValue: "2",
    maxSlippageBps: 100,
    targets: ["0xabc"],
    selectors: ["0x2de5aaf7"],
    rationale: "Swap on Merchant Moe with a tight cap.",
    assumptions: ["Assumed Merchant Moe router address."],
  };

  it("accepts well-formed output", () => {
    expect(validatePolicyDraft(valid)).toEqual(valid);
  });

  it("rejects non-array targets", () => {
    expect(validatePolicyDraft({ ...valid, targets: "0xabc" })).toBeNull();
  });

  it("clamps slippage", () => {
    expect(validatePolicyDraft({ ...valid, maxSlippageBps: 99999 })?.maxSlippageBps).toBe(10000);
  });
});

describe("validateBlockSummary", () => {
  it("accepts well-formed output", () => {
    const valid = { narrative: "Mostly unknown targets.", topRisks: ["unallowlisted targets"], suggestions: ["tighten allowlist"] };
    expect(validateBlockSummary(valid)).toEqual(valid);
  });

  it("rejects a missing narrative", () => {
    expect(validateBlockSummary({ topRisks: [], suggestions: [] })).toBeNull();
  });
});

/* -------------------------------------------------------------------------- *
 * Client — graceful fallback + caching against a mocked /api/ai route.        *
 * -------------------------------------------------------------------------- */
const payload: ExplainPayload = {
  decision: "ALLOW",
  reason: "POLICY_PASSED",
  riskScore: 8,
  target: "0x0000000000000000000000000000000000000001",
  value: "0",
  selector: "0x2de5aaf7",
  simulationHash: `0x${"a".repeat(64)}`,
  checks: { policyActive: true },
};

describe("aiEnabled", () => {
  const original = process.env.NEXT_PUBLIC_AI_ENABLED;
  afterEach(() => {
    process.env.NEXT_PUBLIC_AI_ENABLED = original;
  });

  it("defaults to enabled", () => {
    delete process.env.NEXT_PUBLIC_AI_ENABLED;
    expect(aiEnabled()).toBe(true);
  });

  it("is disabled only when explicitly 'false'", () => {
    process.env.NEXT_PUBLIC_AI_ENABLED = "false";
    expect(aiEnabled()).toBe(false);
  });
});

describe("explainDecision", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ok with data on a 200 response", async () => {
    const data = {
      riskScore: 8,
      severity: "low",
      headline: "Safe.",
      plain: "Checks passed.",
      recommendation: "Proceed.",
    };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data }) }) as unknown as typeof fetch;
    const result = await explainDecision({ ...payload, simulationHash: `0x${"b".repeat(64)}` });
    expect(result).toEqual({ ok: true, data });
  });

  it("falls back on a 503 (no key)", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: "not configured" }) }) as unknown as typeof fetch;
    const result = await explainDecision({ ...payload, simulationHash: `0x${"c".repeat(64)}` });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not configured");
  });

  it("falls back when fetch throws", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
    const result = await explainDecision({ ...payload, simulationHash: `0x${"d".repeat(64)}` });
    expect(result.ok).toBe(false);
  });

  it("caches by simulationHash (no second fetch)", async () => {
    const data = { riskScore: 8, severity: "low", headline: "h", plain: "p", recommendation: "r" };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const key = { ...payload, simulationHash: `0x${"e".repeat(64)}` };
    await explainDecision(key);
    await explainDecision(key);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
