import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixture = join(root, "scripts", "fixtures", "deployment-manifest.valid.json");
const tempDir = mkdtempSync(join(tmpdir(), "interlock-manifest-test-"));

try {
  const valid = run(["scripts/deployment-manifest-doctor.mjs", "--manifest", fixture]);
  assert.equal(valid.status, 0, valid.stderr);
  const validReport = JSON.parse(valid.stdout);
  assert.equal(validReport.ok, true);
  assert.equal(validReport.compatibility.policyRegistry.version, "1.2.0");
  assert.equal(validReport.compatibility.policyRegistry.supportsPolicyEnumeration, true);

  const optionalManifest = JSON.parse(readFileSync(fixture, "utf8"));
  optionalManifest.addresses.testStrategyVault = "0x1111111111111111111111111111111111111111";
  optionalManifest.addresses.testStrategyRouter = "0x2222222222222222222222222222222222222222";
  optionalManifest.transactions.testStrategyVault = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  optionalManifest.transactions.testStrategyRouter = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  optionalManifest.blocks.testStrategyVault = "39252150";
  optionalManifest.blocks.testStrategyRouter = "39252151";
  const optionalPath = join(tempDir, "optional.json");
  writeFileSync(optionalPath, `${JSON.stringify(optionalManifest, null, 2)}\n`);

  const optional = run(["scripts/deployment-manifest-doctor.mjs", "--manifest", optionalPath]);
  assert.equal(optional.status, 0, optional.stderr);
  const optionalReport = JSON.parse(optional.stdout);
  assert.equal(optionalReport.ok, true);
  assert.equal(optionalReport.addressCount, 5);

  const missing = run(["scripts/deployment-manifest-doctor.mjs", "--manifest", join(tempDir, "missing.json"), "--no-fail"]);
  assert.equal(missing.status, 0, missing.stderr);
  const missingReport = JSON.parse(missing.stdout);
  assert.equal(missingReport.ok, false);
  assert.match(missingReport.errors[0], /Cannot read deployment manifest/);

  const invalidManifest = JSON.parse(readFileSync(fixture, "utf8"));
  invalidManifest.compatibility.policyRegistry.supportsPolicyEnumeration = false;
  const invalidPath = join(tempDir, "invalid.json");
  writeFileSync(invalidPath, `${JSON.stringify(invalidManifest, null, 2)}\n`);

  const invalid = run(["scripts/deployment-manifest-doctor.mjs", "--manifest", invalidPath]);
  assert.notEqual(invalid.status, 0);
  const invalidReport = JSON.parse(invalid.stdout);
  assert.equal(invalidReport.ok, false);
  assert.ok(
    invalidReport.errors.some((error) => error.includes("compatibility.policyRegistry.supportsPolicyEnumeration")),
    invalidReport.errors.join("\n"),
  );

  console.log("Deployment manifest doctor tests passed");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.error) {
    throw result.error;
  }

  return result;
}
