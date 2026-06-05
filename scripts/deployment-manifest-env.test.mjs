import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const script = join(root, "scripts", "deployment-manifest-env.mjs");
const fixture = join(root, "scripts", "fixtures", "deployment-manifest.valid.json");

const stdoutRun = run(["--manifest", fixture]);
assert.equal(stdoutRun.status, 0);
assert.match(stdoutRun.stdout, /MANTLE_RPC_URL=https:\/\/rpc\.sepolia\.mantle\.xyz/);
assert.match(stdoutRun.stdout, /AGENT_REGISTRY=0xe4dfef03e107225f2239cfff955a378a9a8158be/);
assert.match(stdoutRun.stdout, /NEXT_PUBLIC_AGENT_REGISTRY=0xe4dfef03e107225f2239cfff955a378a9a8158be/);
assert.match(stdoutRun.stdout, /NEXT_PUBLIC_DEFAULT_ACTION_TARGET=0xe4dfef03e107225f2239cfff955a378a9a8158be/);
assert.match(stdoutRun.stdout, /NEXT_PUBLIC_DEFAULT_SELECTOR=0x2de5aaf7/);
assert.match(stdoutRun.stdout, /NEXT_PUBLIC_INDEXER_URL=\n/);
assert.match(stdoutRun.stdout, /INDEXER_URL=\n/);
assert.match(stdoutRun.stdout, /FROM_BLOCK=39252126/);
assert.match(stdoutRun.stdout, /INDEXER_DB_PATH=\.interlock-indexer-347fb466\.sqlite/);
assert.match(stdoutRun.stdout, /INDEXER_BLOCK_CHUNK_SIZE=9000/);

const optionalManifest = JSON.parse(readFileSync(fixture, "utf8"));
optionalManifest.addresses.testStrategyVault = "0x1111111111111111111111111111111111111111";
optionalManifest.addresses.testStrategyRouter = "0x2222222222222222222222222222222222222222";
const optionalDir = mkdtempSync(join(tmpdir(), "interlock-manifest-env-optional-"));
try {
  const optionalPath = join(optionalDir, "latest.json");
  writeJson(optionalPath, optionalManifest);
  const optionalRun = run(["--manifest", optionalPath]);
  assert.equal(optionalRun.status, 0);
  assert.match(optionalRun.stdout, /TEST_STRATEGY_VAULT=0x1111111111111111111111111111111111111111/);
  assert.match(optionalRun.stdout, /NEXT_PUBLIC_TEST_STRATEGY_ROUTER=0x2222222222222222222222222222222222222222/);
} finally {
  rmSync(optionalDir, { recursive: true, force: true });
}

const tempDir = mkdtempSync(join(tmpdir(), "interlock-manifest-env-"));
try {
  const output = join(tempDir, "latest.env");
  const fileRun = run([
    "--manifest",
    fixture,
    "--out",
    output,
    "--indexer-url",
    "https://sepolia-recorder.interlock.dev",
    "--block-chunk-size",
    "1000",
    "--indexer-db-path",
    "./data/custom.sqlite",
    "--default-agent-id",
    "3",
    "--default-policy-id",
    "2",
  ]);
  assert.equal(fileRun.status, 0);
  const generated = readFileSync(output, "utf8");
  assert.match(generated, /NEXT_PUBLIC_INDEXER_URL=https:\/\/sepolia-recorder\.interlock\.dev/);
  assert.match(generated, /INDEXER_URL=https:\/\/sepolia-recorder\.interlock\.dev/);
  assert.match(generated, /INDEXER_BLOCK_CHUNK_SIZE=1000/);
  assert.match(generated, /INDEXER_DB_PATH=\.\/data\/custom\.sqlite/);
  assert.match(generated, /NEXT_PUBLIC_DEFAULT_AGENT_ID=3/);
  assert.match(generated, /NEXT_PUBLIC_DEFAULT_POLICY_ID=2/);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

const missingRun = run(["--manifest", "missing.json"]);
assert.notEqual(missingRun.status, 0);
assert.match(missingRun.stderr, /Deployment manifest not found/);

console.log("Deployment manifest env tests passed");

function run(args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
