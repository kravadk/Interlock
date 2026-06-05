import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const script = join(root, "scripts", "deployment-report.mjs");
const fixture = join(root, "scripts", "fixtures", "deployment-manifest.valid.json");

const stdoutRun = run(["--manifest", fixture]);
assert.equal(stdoutRun.status, 0);
assert.match(stdoutRun.stdout, /# Interlock Firewall Mantle Sepolia Deployment/);
assert.match(stdoutRun.stdout, /PolicyRegistry v1\.2\.0/);
assert.match(stdoutRun.stdout, /https:\/\/sepolia\.mantlescan\.xyz\/address\/0xe4dfef03e107225f2239cfff955a378a9a8158be/);
assert.match(stdoutRun.stdout, /https:\/\/sepolia\.mantlescan\.xyz\/tx\/0xf04e367d4fd151a613eab44d1dec82875b4d1f0866bbbd7418764f9957c5e593/);

const optionalManifest = JSON.parse(readFileSync(fixture, "utf8"));
optionalManifest.addresses.testStrategyVault = "0x1111111111111111111111111111111111111111";
optionalManifest.addresses.testStrategyRouter = "0x2222222222222222222222222222222222222222";
optionalManifest.transactions.testStrategyVault = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
optionalManifest.transactions.testStrategyRouter = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
optionalManifest.blocks.testStrategyVault = "39252150";
optionalManifest.blocks.testStrategyRouter = "39252151";
const optionalDir = mkdtempSync(join(tmpdir(), "interlock-deployment-report-optional-"));
try {
  const optionalPath = join(optionalDir, "latest.json");
  writeFileSync(optionalPath, `${JSON.stringify(optionalManifest, null, 2)}\n`);
  const optionalRun = run(["--manifest", optionalPath]);
  assert.equal(optionalRun.status, 0);
  assert.match(optionalRun.stdout, /TestStrategyVault/);
  assert.match(optionalRun.stdout, /TestStrategyRouter deploy/);
} finally {
  rmSync(optionalDir, { recursive: true, force: true });
}

const tempDir = mkdtempSync(join(tmpdir(), "interlock-deployment-report-"));
try {
  const output = join(tempDir, "summary.md");
  const fileRun = run(["--manifest", fixture, "--out", output]);
  assert.equal(fileRun.status, 0);
  const report = readFileSync(output, "utf8");
  assert.match(report, /## Contracts/);
  assert.match(report, /pnpm live:readiness/);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

const missingRun = run(["--manifest", "missing.json"]);
assert.notEqual(missingRun.status, 0);
assert.match(missingRun.stderr, /Deployment manifest not found/);

console.log("Deployment report tests passed");

function run(args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}
