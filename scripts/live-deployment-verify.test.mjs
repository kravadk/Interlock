import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const script = resolve(root, "scripts", "live-deployment-verify.mjs");
const fixture = resolve(root, "scripts", "fixtures", "deployment-manifest.valid.json");

const offlineRun = run(["--manifest", fixture, "--offline"]);
assert.equal(offlineRun.status, 0);
const offlineReport = JSON.parse(offlineRun.stdout);
assert.equal(offlineReport.ok, true);
assert.equal(offlineReport.offline, true);
assert.equal(offlineReport.summary.failed, 0);
assert.equal(offlineReport.checks[0].name, "manifest-shape");

const missingRun = run(["--manifest", "missing.json", "--no-fail"]);
assert.equal(missingRun.status, 0);
const missingReport = JSON.parse(missingRun.stdout);
assert.equal(missingReport.ok, false);
assert.equal(missingReport.checks[0].name, "manifest-present");

console.log("Live deployment verify tests passed");

function run(args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}
