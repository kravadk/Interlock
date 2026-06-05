import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const script = resolve(root, "scripts", "submission-doctor.mjs");

const result = spawnSync(process.execPath, [script, "--require-live"], {
  cwd: root,
  encoding: "utf8",
});

assert.equal(result.status, 0, result.stderr);

const report = JSON.parse(result.stdout);
assert.equal(report.ok, true);
assert.equal(report.requireLive, true);
assert.equal(report.summary.requiredFailures, 0);

const checkNames = new Set(report.checks.map((check) => check.name));

for (const expected of [
  "file:examples/vercel-ai-adapter/README.md",
  "file:examples/langchain-adapter/README.md",
  "file:apps/web/src/app/docs/[[...slug]]/page.tsx",
  "file:apps/web/src/app/changelog/page.tsx",
  "file:apps/web/src/app/manifest.ts",
  "file:apps/web/src/app/opengraph-image.tsx",
  "file:apps/web/public/.well-known/security.txt",
  "file:.changeset/config.json",
  "file:.github/workflows/release.yml",
  "script:contracts:verify",
  "script:contracts:verify:export",
  "script:contracts:verify:test",
  "script:contracts:verification-status",
  "script:contracts:verification-status:test",
  "script:release:changeset:check",
  "env:NEXT_PUBLIC_POLICY_GUARDED_EXECUTOR",
  "env:NEXT_PUBLIC_DISPUTE_ESCROW",
  "env:NEXT_PUBLIC_REPUTATION_ORACLE",
  "live-address:agentRegistry",
  "live-address:policyRegistry",
  "live-address:actionAttestation",
]) {
  assert.equal(checkNames.has(expected), true, `Missing submission doctor check: ${expected}`);
}

console.log("Submission doctor tests passed");
