#!/usr/bin/env node
/**
 * Dependency-free secret scanner. Walks tracked source files and flags high-signal secret patterns
 * (populated private keys, Anthropic/AWS keys, PEM blocks). Reports file:line + pattern name only —
 * never the matched value. Exits 1 on any hit. Run: `node scripts/secret-scan.mjs`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  "node_modules", "dist", ".next", ".git", "artifacts", "coverage", ".vercel", ".turbo", "build",
]);
const SKIP_FILES = new Set(["pnpm-lock.yaml", "secret-scan.mjs", "SECURITY.md"]);
const SKIP_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".woff", ".woff2", ".ttf", ".map",
  ".sqlite", ".lock", ".tgz", ".gz", ".zip", ".pdf",
]);

const PATTERNS = [
  { name: "anthropic-api-key", re: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: "aws-access-key", re: /AKIA[0-9A-Z]{16}/ },
  { name: "populated-private-key", re: /(?:PRIVATE_KEY|ATTESTOR_PRIVATE_KEY)\s*[:=]\s*["']?0x[0-9a-fA-F]{64}/ },
  { name: "pem-private-key", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
];

const hits = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".env") && entry.name !== ".env.example") continue; // never read real .env
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(full);
      continue;
    }
    if (SKIP_FILES.has(entry.name) || SKIP_EXT.has(path.extname(entry.name))) continue;
    if (statSync(full).size > 2_000_000) continue;
    scan(full);
  }
}

function scan(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return;
  }
  const rel = path.relative(ROOT, file);
  text.split("\n").forEach((line, i) => {
    for (const { name, re } of PATTERNS) {
      if (re.test(line)) hits.push(`${rel}:${i + 1}  [${name}]`);
    }
  });
}

walk(ROOT);

if (hits.length) {
  console.error(`Secret scan FAILED — ${hits.length} potential secret(s):`);
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}
console.log("Secret scan passed — no secrets detected.");
