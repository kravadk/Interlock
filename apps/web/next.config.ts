import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(here, "../..");

const nextConfig: NextConfig = {
  webpack(config) {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@interlock/shared": path.join(workspaceRoot, "packages/shared/dist/index.js"),
      "@interlock/firewall-sdk": path.join(workspaceRoot, "packages/sdk/dist/index.js"),
    };
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders(),
      },
    ];
  },
};

function securityHeaders() {
  const connectSrc = [
    "'self'",
    process.env.NEXT_PUBLIC_MANTLE_RPC_URL,
    process.env.MANTLE_RPC_URL,
    process.env.NEXT_PUBLIC_INDEXER_URL,
    "https://rpc.sepolia.mantle.xyz",
    "https://sepolia.mantlescan.xyz",
    "https://api.anthropic.com",
    "https://*.sentry.io",
  ]
    .filter(Boolean)
    .join(" ");

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    `connect-src ${connectSrc}`,
  ].join("; ");

  return [
    { key: "Content-Security-Policy-Report-Only", value: csp },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    ...(process.env.VERCEL_ENV === "production"
      ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
      : []),
  ];
}

export default nextConfig;
