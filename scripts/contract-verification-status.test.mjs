import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const script = join(root, "scripts", "contract-verification-status.mjs");
const manifest = join(root, "scripts", "fixtures", "deployment-manifest.valid.json");

const verifiedDir = mkdtempSync(join(tmpdir(), "interlock-verified-html-"));
try {
  for (const label of ["AgentRegistry", "PolicyRegistry", "ActionAttestation"]) {
    writeFileSync(
      join(verifiedDir, `${label}.html`),
      "<html><body><h3>Contract Source Code Verified</h3><section>Contract ABI</section><a>Read Contract</a><a>Write Contract</a></body></html>",
    );
  }

  const result = run(["--manifest", manifest, "--html-dir", verifiedDir]);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.summary.verified, 3);
  assert.equal(report.summary.unverified, 0);
} finally {
  rmSync(verifiedDir, { recursive: true, force: true });
}

const unverifiedDir = mkdtempSync(join(tmpdir(), "interlock-unverified-html-"));
try {
  writeFileSync(join(unverifiedDir, "AgentRegistry.html"), "<html><body>Contract Source Code Verified Contract ABI</body></html>");
  writeFileSync(join(unverifiedDir, "PolicyRegistry.html"), "<html><body>Unverified Contract Source Code Similar Match</body></html>");
  writeFileSync(join(unverifiedDir, "ActionAttestation.html"), "<html><body>Contract Source Code Verified Contract ABI</body></html>");

  const result = run(["--manifest", manifest, "--html-dir", unverifiedDir]);
  assert.notEqual(result.status, 0);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.summary.verified, 2);
  assert.equal(report.summary.unverified, 1);
  assert.equal(report.contracts.find((contract) => contract.label === "PolicyRegistry")?.verified, false);
} finally {
  rmSync(unverifiedDir, { recursive: true, force: true });
}

console.log("Contract verification status tests passed");

function run(args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}
