import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

let tempRoot: string | undefined;

afterEach(() => {
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
  tempRoot = undefined;
});

describe("init-agent-app generator", () => {
  it("creates a real starter without secrets or fake addresses and typechecks the generated code", () => {
    tempRoot = mkdtempSync(join(process.cwd(), ".tmp-interlock-starter-"));
    const out = join(tempRoot, "agent");

    const generated = runNode([tsxCli(), "src/index.ts", "init-agent-app", "--out", out, "--template", "viem"]);
    expect(generated.status).toBe(0);

    const env = readFileSync(join(out, ".env.example"), "utf8");
    const agent = readFileSync(join(out, "src", "agent.ts"), "utf8");
    const interlock = readFileSync(join(out, "src", "interlock.ts"), "utf8");

    expect(env).toContain("PRIVATE_KEY=");
    expect(env).not.toMatch(/PRIVATE_KEY=0x[0-9a-fA-F]{64}/);
    expect(`${agent}\n${interlock}`).not.toContain("0x0000000000000000000000000000000000000000");
    expect(agent).toContain("firewall.checkAction");

    const typecheck = runNode([
      tscCli(),
      "--noEmit",
      "--skipLibCheck",
      "--module",
      "NodeNext",
      "--moduleResolution",
      "NodeNext",
      "--target",
      "ES2022",
      "--types",
      "node",
      join(out, "src", "agent.ts"),
      join(out, "src", "interlock.ts"),
    ]);
    expect(typecheck.status).toBe(0);
    // Generates a starter then runs tsx + a full tsc typecheck on it — far slower than the 5s default,
    // especially on CI runners. Give it a generous ceiling so CI is deterministic, not flaky.
  }, 120_000);
});

function runNode(args: string[]) {
  return spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

function tsxCli() {
  return join(process.cwd(), "..", "..", "node_modules", "tsx", "dist", "cli.mjs");
}

function tscCli() {
  return join(process.cwd(), "..", "..", "node_modules", "typescript", "bin", "tsc");
}
