import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const script = join(root, "scripts", "live-alpha-readiness.mjs");
const fixture = join(root, "scripts", "fixtures", "deployment-manifest.valid.json");

const tempDir = mkdtempSync(join(tmpdir(), "interlock-live-readiness-"));
try {
  const generatedEnv = join(tempDir, "latest.env");
  const result = run(["--manifest", fixture, "--env-out", generatedEnv, "--no-fail"]);
  assert.equal(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.manifest, fixture);
  assert.equal(report.envOut, generatedEnv);
  assert.equal(report.checks.find((check) => check.name === "manifest-doctor")?.ok, true);
  assert.equal(report.checks.find((check) => check.name === "manifest-env")?.ok, true);
  assert.equal(report.checks.find((check) => check.name === "cli-doctor")?.ok, true);
  assert.equal(report.ok, true);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

const missing = run(["--manifest", "missing.json", "--no-fail"]);
assert.equal(missing.status, 0);
assert.equal(JSON.parse(missing.stdout).checks[0].name, "manifest-present");

console.log("Live alpha readiness tests passed");

function run(args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}
