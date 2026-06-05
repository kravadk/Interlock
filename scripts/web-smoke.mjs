import { createServer } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const host = "127.0.0.1";
const requestedPort = Number(readOption("--port") ?? process.env.WEB_SMOKE_PORT ?? "3021");
const port = await getAvailablePort(requestedPort);
const url = `http://${host}:${port}`;

await run([pnpm, ["build:packages"]]);
await waitForFiles([
  "packages/shared/dist/index.js",
  "packages/shared/dist/abis.js",
  "packages/sdk/dist/index.js",
  "apps/web/node_modules/@interlock/shared/dist/index.js",
  "apps/web/node_modules/@interlock/firewall-sdk/dist/index.js",
]);

await runWithRetry("@interlock/web build", [pnpm, ["--filter", "@interlock/web", "build"]]);
await waitForFiles([
  "apps/web/.next/BUILD_ID",
  "apps/web/.next/routes-manifest.json",
  "apps/web/.next/app-build-manifest.json",
]);

const server = startServer(port);
try {
  const content = await waitForHttp(url, server);
  const expected = ["Interlock", "Enter the control plane", "Mantle Sepolia"];
  const missing = expected.filter((text) => !content.includes(text));
  if (missing.length > 0) {
    throw new Error(`Landing response is missing expected text: ${missing.join(", ")}`);
  }

  console.log(`Web smoke passed at ${url}`);
} finally {
  stopServer(server);
}

function readOption(name) {
  const args = process.argv.slice(2);
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}`);
  }
  return value;
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
      "apps/web/node_modules/@interlock/shared/dist/index.js",
      "apps/web/node_modules/@interlock/firewall-sdk/dist/index.js",
    ]);
    await run(command);
  }
}

function startServer(port) {
  const nextBin = process.platform === "win32" ? "apps/web/node_modules/.bin/next.cmd" : "apps/web/node_modules/.bin/next";
  const spawned = spawnCommand(resolve(root, nextBin), ["start", "-H", host, "-p", String(port)]);
  const child = spawn(spawned.command, spawned.args, {
    cwd: resolve(root, "apps/web"),
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  const logs = [];
  child.stdout.on("data", (chunk) => logs.push(chunk.toString()));
  child.stderr.on("data", (chunk) => logs.push(chunk.toString()));
  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      logs.push(`next start exited with ${code}`);
    }
  });

  return { child, logs };
}

async function waitForHttp(url, server) {
  const deadline = Date.now() + 60_000;
  let lastError;

  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(`Dashboard server exited with ${server.child.exitCode}. Logs:\n${server.logs.join("").slice(-4_000)}`);
    }

    try {
      const response = await fetch(url);
      const text = await response.text();
      if (response.ok) return text;
      lastError = new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(500);
  }

  throw new Error(
    `Dashboard did not become healthy at ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}\nLogs:\n${server.logs.join("").slice(-4_000)}`,
  );
}

function stopServer(server) {
  const pid = server.child.pid;
  if (!pid) return;

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore" });
    return;
  }

  server.child.kill("SIGTERM");
}

async function getAvailablePort(preferredPort) {
  if (Number.isInteger(preferredPort) && preferredPort > 0 && (await canListen(preferredPort))) {
    return preferredPort;
  }

  return new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once("error", rejectPort);
    server.listen(0, host, () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === "object" && address?.port) {
          resolvePort(address.port);
        } else {
          rejectPort(new Error("Could not allocate a free web smoke port."));
        }
      });
    });
  });
}

function canListen(port) {
  return new Promise((resolveCanListen) => {
    const server = createServer();
    server.once("error", () => resolveCanListen(false));
    server.listen(port, host, () => {
      server.close(() => resolveCanListen(true));
    });
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
  throw new Error(`Web build output missing after wait: ${missing.join(", ")}`);
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
