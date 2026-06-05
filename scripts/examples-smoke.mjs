import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

await run([pnpm, ["build:packages"]]);
await waitForFiles([
  "packages/shared/dist/index.js",
  "packages/shared/dist/abis.js",
  "packages/sdk/dist/index.js",
  "packages/indexer/dist/index.js",
  "packages/cli/dist/index.js",
]);

await runWithRetry("@interlock/example-raw-viem demo", [pnpm, ["--filter", "@interlock/example-raw-viem", "demo"]]);
await runWithRetry("@interlock/example-agent-framework demo", [pnpm, ["--filter", "@interlock/example-agent-framework", "demo"]]);
await runWithRetry("@interlock/example-goat-adapter demo", [pnpm, ["--filter", "@interlock/example-goat-adapter", "demo"]]);
await runWithRetry("@interlock/example-agentkit-adapter demo", [pnpm, ["--filter", "@interlock/example-agentkit-adapter", "demo"]]);
await runWithRetry("@interlock/example-byreal-realclaw-adapter demo", [
  pnpm,
  ["--filter", "@interlock/example-byreal-realclaw-adapter", "demo"],
]);
await runWithRetry("@interlock/example-vercel-ai-adapter demo", [pnpm, ["--filter", "@interlock/example-vercel-ai-adapter", "demo"]]);
await runWithRetry("@interlock/example-langchain-adapter demo", [pnpm, ["--filter", "@interlock/example-langchain-adapter", "demo"]]);
await runWithRetry("@interlock/example-backend-automation demo", [pnpm, ["--filter", "@interlock/example-backend-automation", "demo"]]);
await runWithRetry("@interlock/example-preflight-api demo", [pnpm, ["--filter", "@interlock/example-preflight-api", "demo"]]);

console.log("Examples smoke passed");

function run([command, args]) {
  return new Promise((resolveRun, rejectRun) => {
    const spawned = spawnCommand(command, args);
    const child = spawn(spawned.command, spawned.args, {
      cwd: root,
      stdio: "inherit",
      shell: false,
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        rejectRun(new Error(`${command} ${args.join(" ")} terminated by ${signal}`));
        return;
      }

      if (code !== 0) {
        rejectRun(new Error(`${command} ${args.join(" ")} exited with ${code}`));
        return;
      }

      resolveRun();
    });

    child.on("error", rejectRun);
  });
}

async function runWithRetry(label, command) {
  try {
    await run(command);
  } catch (error) {
    console.warn(`${label} failed; retrying once after workspace output settle.`);
    await sleep(1_000);
    await waitForFiles([
      "packages/shared/dist/index.js",
      "packages/shared/dist/abis.js",
      "packages/sdk/dist/index.js",
      "examples/raw-viem/node_modules/@interlock/firewall-sdk/dist/index.js",
      "examples/agent-framework/node_modules/@interlock/firewall-sdk/dist/index.js",
      "examples/goat-adapter/node_modules/@interlock/firewall-sdk/dist/index.js",
      "examples/agentkit-adapter/node_modules/@interlock/firewall-sdk/dist/index.js",
      "examples/byreal-realclaw-adapter/node_modules/@interlock/firewall-sdk/dist/index.js",
      "examples/vercel-ai-adapter/node_modules/@interlock/firewall-sdk/dist/index.js",
      "examples/langchain-adapter/node_modules/@interlock/firewall-sdk/dist/index.js",
      "examples/backend-automation/node_modules/@interlock/firewall-sdk/dist/index.js",
      "examples/preflight-api/node_modules/@interlock/firewall-sdk/dist/index.js",
    ]);
    await run(command);
  }
}

function spawnCommand(command, args) {
  if (process.platform !== "win32") {
    return { command, args };
  }

  const commandLine = [command, ...args].map(quoteWindowsArg).join(" ");
  return {
    command: process.env.ComSpec ?? "cmd.exe",
    args: ["/d", "/s", "/c", commandLine],
  };
}

function quoteWindowsArg(value) {
  if (!/[ \t"&|<>^]/.test(value)) return value;
  return `"${value.replaceAll('"', '\\"')}"`;
}

async function waitForFiles(paths) {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    const missing = paths.filter((path) => !existsSync(resolve(root, path)));
    if (missing.length === 0) return;
    await sleep(250);
  }

  const missing = paths.filter((path) => !existsSync(resolve(root, path)));
  throw new Error(`Build output missing after wait: ${missing.join(", ")}`);
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
