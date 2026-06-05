import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

await build("@interlock/shared", [
  "packages/shared/dist/index.js",
  "packages/shared/dist/index.d.ts",
  "packages/shared/dist/abis.js",
  "packages/shared/dist/abis.d.ts",
]);

await build(
  "@interlock/firewall-sdk",
  [
    "packages/sdk/dist/index.js",
    "packages/sdk/dist/index.d.ts",
  ],
  [
    "packages/sdk/node_modules/@interlock/shared/dist/index.js",
    "packages/sdk/node_modules/@interlock/shared/dist/index.d.ts",
    "packages/sdk/node_modules/@interlock/shared/dist/abis.js",
    "packages/sdk/node_modules/@interlock/shared/dist/abis.d.ts",
  ],
);

await build(
  "@interlock/indexer",
  [
    "packages/indexer/dist/index.js",
    "packages/indexer/dist/index.d.ts",
  ],
  [
    "packages/indexer/node_modules/@interlock/shared/dist/index.js",
    "packages/indexer/node_modules/@interlock/shared/dist/index.d.ts",
    "packages/indexer/node_modules/@interlock/shared/dist/abis.js",
    "packages/indexer/node_modules/@interlock/shared/dist/abis.d.ts",
  ],
);

await build(
  "@interlock/mcp",
  [
    "packages/mcp/dist/index.js",
    "packages/mcp/dist/index.d.ts",
  ],
  [
    "packages/mcp/node_modules/@interlock/shared/dist/index.js",
    "packages/mcp/node_modules/@interlock/shared/dist/index.d.ts",
    "packages/mcp/node_modules/@interlock/firewall-sdk/dist/index.js",
    "packages/mcp/node_modules/@interlock/firewall-sdk/dist/index.d.ts",
  ],
);

await build(
  "@interlock/cli",
  [
    "packages/cli/dist/index.js",
    "packages/cli/dist/index.d.ts",
  ],
  [
    "packages/cli/node_modules/@interlock/shared/dist/index.js",
    "packages/cli/node_modules/@interlock/shared/dist/index.d.ts",
    "packages/cli/node_modules/@interlock/shared/dist/abis.js",
    "packages/cli/node_modules/@interlock/shared/dist/abis.d.ts",
    "packages/cli/node_modules/@interlock/firewall-sdk/dist/index.js",
    "packages/cli/node_modules/@interlock/firewall-sdk/dist/index.d.ts",
  ],
);

console.log("Package build outputs ready");

async function build(packageName, outputs, dependencies = []) {
  if (dependencies.length > 0) {
    await waitForFiles(dependencies);
  }

  try {
    await run([pnpm, ["--filter", packageName, "build"]]);
  } catch (error) {
    console.warn(`Build failed for ${packageName}; retrying once after output settle.`);
    await sleep(1_000);
    if (dependencies.length > 0) {
      await waitForFiles(dependencies);
    }
    await run([pnpm, ["--filter", packageName, "build"]]);
  }
  await waitForFiles(outputs);
}

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

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
