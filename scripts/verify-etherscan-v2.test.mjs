import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const script = resolve(root, "scripts", "verify-etherscan-v2.mjs");

const result = runVerificationScript(["--dry-run"]);

assert.equal(result.status, 0, result.stderr);

const report = JSON.parse(result.stdout);
assert.equal(report.ok, true);
assert.equal(report.dryRun, true);
assert.equal(report.chainId, "5003");
assert.match(report.compilerVersion, /^v0\.8\.35\+commit\.47b9dedd$/);
assert.equal(report.settings.evmVersion, "paris");
assert.equal(report.settings.viaIR, true);
assert.deepEqual(report.settings.optimizer, { enabled: true, runs: 200 });
assert.equal(report.contracts.length, 3);

const byLabel = new Map(report.contracts.map((contract) => [contract.label, contract]));
assert.equal(byLabel.get("AgentRegistry")?.constructorArguments, "");
assert.equal(
  byLabel.get("PolicyRegistry")?.constructorArguments,
  "000000000000000000000000a8d6f3478b683ee674ff5a9167e6838c589162b4",
);
assert.equal(
  byLabel.get("ActionAttestation")?.constructorArguments,
  "000000000000000000000000a8d6f3478b683ee674ff5a9167e6838c589162b4" +
    "00000000000000000000000016a02f6ed0d3db730fd60d5c51ec99e7825e41e0",
);

for (const sourceFile of ["AgentRegistry.sol", "PolicyRegistry.sol", "ActionAttestation.sol"]) {
  assert.equal(report.sourceFiles.includes(sourceFile), true, `Missing source file ${sourceFile}`);
}

const exportDir = mkdtempSync(join(tmpdir(), "interlock-verification-artifacts-"));
try {
  const exportResult = runVerificationScript(["--export-dir", exportDir]);
  assert.equal(exportResult.status, 0, exportResult.stderr);

  const exportReport = JSON.parse(exportResult.stdout);
  assert.equal(exportReport.ok, true);
  assert.equal(exportReport.files.length, 3);

  const standardJson = JSON.parse(readFileSync(join(exportDir, "standard-json-input.json"), "utf8"));
  assert.equal(standardJson.settings.viaIR, true);
  assert.equal(standardJson.settings.evmVersion, "paris");
  assert.equal(standardJson.sources["AgentRegistry.sol"].content.includes("contract AgentRegistry"), true);

  const contracts = JSON.parse(readFileSync(join(exportDir, "contracts.json"), "utf8"));
  assert.equal(contracts.contracts.length, 3);
  assert.equal(contracts.settings.viaIR, true);

  const readme = readFileSync(join(exportDir, "README.md"), "utf8");
  assert.match(readme, /Mantle Sepolia Contract Verification Artifacts/);
  assert.match(readme, /viaIR/);
  assert.match(readme, /standard-json-input\.json/);
} finally {
  rmSync(exportDir, { recursive: true, force: true });
}

console.log("Etherscan V2 verification dry-run tests passed");

function runVerificationScript(args) {
  let last;
  for (let attempt = 0; attempt < 4; attempt++) {
    last = spawnSync(process.execPath, [script, ...args], {
      cwd: root,
      encoding: "utf8",
    });
    if (last.status === 0 || !isWindowsNodeHandleClosingCrash(last)) {
      return last;
    }
  }
  return last;
}

function isWindowsNodeHandleClosingCrash(result) {
  return (
    process.platform === "win32" &&
    result.status === 3221226505
  );
}
