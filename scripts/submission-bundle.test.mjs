import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const script = join(root, "scripts", "submission-bundle.mjs");
const fixture = join(root, "scripts", "fixtures", "deployment-manifest.valid.json");

const tempDir = mkdtempSync(join(tmpdir(), "interlock-submission-bundle-"));
try {
  const output = join(tempDir, "submission.md");
  const result = run([
    "--manifest",
    fixture,
    "--out",
    output,
    "--repo-url",
    "https://github.com/example/interlock-firewall",
    "--dashboard-url",
    "https://interlock.example",
    "--demo-video-url",
    "https://video.example/demo",
  ]);

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, true);
  assert.equal(report.liveManifestIncluded, true);

  const markdown = readFileSync(output, "utf8");
  assert.match(markdown, /# Interlock Control Plane Submission/);
  assert.match(markdown, /AI DevTools/);
  assert.match(markdown, /MCP server/);
  assert.match(markdown, /Benchmark Arena/);
  assert.match(markdown, /0xec7608730978b68a8d8c36b5d1f131634621116d/);
  assert.match(markdown, /https:\/\/sepolia\.mantlescan\.xyz\/address\/0x347fb466f3c9bc031560b49973ec05bdadd2d4c4/);
  assert.match(markdown, /contract verification-status detection/);
  assert.match(markdown, /Exportable Mantlescan verification artifacts/);
  assert.match(markdown, /pnpm contracts:verify:export/);
  assert.match(markdown, /pnpm contracts:verification-status -- --no-fail/);
  assert.match(markdown, /pnpm smoke:all/);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

const defaultUrlDir = mkdtempSync(join(tmpdir(), "interlock-submission-default-dashboard-"));
try {
  const output = join(defaultUrlDir, "submission.md");
  const result = run([
    "--manifest",
    fixture,
    "--out",
    output,
    "--repo-url",
    "https://github.com/example/interlock-firewall",
    "--demo-video-url",
    "https://video.example/demo",
  ]);

  assert.equal(result.status, 0, result.stderr);
  const markdown = readFileSync(output, "utf8");
  assert.match(markdown, /- Dashboard: https:\/\/mantle-nine-beta\.vercel\.app/);
  assert.doesNotMatch(markdown, /TODO: add deployed dashboard URL/);
} finally {
  rmSync(defaultUrlDir, { recursive: true, force: true });
}

const missingLive = run(["--manifest", "missing.json", "--out", join(tmpdir(), "unused-submission.md"), "--require-live"]);
assert.notEqual(missingLive.status, 0);
assert.match(missingLive.stderr, /Live manifest is required/);

console.log("Submission bundle tests passed");

function run(args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
  });
}
