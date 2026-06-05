type Bucket = {
  tokens: number;
  updatedAt: number;
};

type RateLimitArea = "ai" | "attest" | "demo" | "rpc";

const buckets = new Map<string, Bucket>();

const defaults: Record<RateLimitArea, number> = {
  ai: 20,
  attest: 30,
  demo: 10,
  rpc: 120,
};

export function rateLimit(request: Request, area: RateLimitArea): Response | undefined {
  if (process.env.RATE_LIMIT_DISABLED === "true") return undefined;

  const limit = readLimit(area);
  if (limit <= 0) return undefined;

  const now = Date.now();
  const key = `${area}:${clientIp(request)}`;
  const refillPerMs = limit / 60_000;
  const current = buckets.get(key) ?? { tokens: limit, updatedAt: now };
  const tokens = Math.min(limit, current.tokens + (now - current.updatedAt) * refillPerMs);

  if (tokens < 1) {
    buckets.set(key, { tokens, updatedAt: now });
    const retryAfter = Math.max(1, Math.ceil((1 - tokens) / refillPerMs / 1000));
    return Response.json(
      {
        error: "Rate limit exceeded.",
        action: `Retry after ${retryAfter}s or lower request frequency for /api/${area === "demo" ? "demo/run" : area}.`,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  buckets.set(key, { tokens: tokens - 1, updatedAt: now });
  return undefined;
}

export function resetRateLimitsForTest() {
  buckets.clear();
}

function readLimit(area: RateLimitArea): number {
  const specific = process.env[`RATE_LIMIT_${area.toUpperCase()}_RPM`];
  const fallback = process.env.RATE_LIMIT_RPM;
  const raw = specific ?? fallback;
  if (!raw) return defaults[area];
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : defaults[area];
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return request.headers.get("x-real-ip")?.trim() || "local";
}
