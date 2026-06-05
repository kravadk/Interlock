import { afterEach, describe, expect, it } from "vitest";
import { rateLimit, resetRateLimitsForTest } from "./rate-limit";

afterEach(() => {
  resetRateLimitsForTest();
  delete process.env.RATE_LIMIT_AI_RPM;
  delete process.env.RATE_LIMIT_DISABLED;
});

describe("rateLimit", () => {
  it("returns 429 after the per-minute bucket is exhausted", async () => {
    process.env.RATE_LIMIT_AI_RPM = "2";
    const request = requestFor("203.0.113.10");

    expect(rateLimit(request, "ai")).toBeUndefined();
    expect(rateLimit(request, "ai")).toBeUndefined();
    const blocked = rateLimit(request, "ai");

    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("Retry-After")).toBeTruthy();
    expect(blocked?.headers.get("X-RateLimit-Limit")).toBe("2");
    await expect(blocked?.json()).resolves.toMatchObject({ error: "Rate limit exceeded." });
  });

  it("tracks different client IPs separately", () => {
    process.env.RATE_LIMIT_AI_RPM = "1";

    expect(rateLimit(requestFor("203.0.113.10"), "ai")).toBeUndefined();
    expect(rateLimit(requestFor("203.0.113.11"), "ai")).toBeUndefined();
    expect(rateLimit(requestFor("203.0.113.10"), "ai")?.status).toBe(429);
  });

  it("can be disabled for local diagnostics", () => {
    process.env.RATE_LIMIT_DISABLED = "true";
    process.env.RATE_LIMIT_AI_RPM = "1";
    const request = requestFor("203.0.113.10");

    expect(rateLimit(request, "ai")).toBeUndefined();
    expect(rateLimit(request, "ai")).toBeUndefined();
  });
});

function requestFor(ip: string) {
  return new Request("https://interlock.test/api/ai", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}
