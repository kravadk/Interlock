import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const script = readFileSync(resolve(root, "scripts", "live-demo.mjs"), "utf8");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

assert.match(script, /await run\(pnpm, \["build:packages"\]\);/);
assert.match(script, /start\("indexer", pnpm, \["indexer"\]\)/);
assert.match(script, /start\("web", pnpm, \["--filter", "@interlock\/web", "dev"\], \{ PORT: process\.env\.WEB_PORT \?\? "3000" \}\)/);
assert.doesNotMatch(script, /process\.env\.PORT\s*=/);
assert.match(packageJson.scripts["live:demo"], /deployments\/mantle-sepolia\/latest\.env/);
assert.match(packageJson.scripts["live:demo:check"], /--check-only/);
assert.match(packageJson.scripts["smoke:all"], /live:demo:test/);

console.log("Live demo script tests passed");
