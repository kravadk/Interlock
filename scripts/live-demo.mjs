import { spawn, spawnSync } from "node:child_process";

const root = process.cwd();
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const args = process.argv.slice(2);
const checkOnly = args.includes("--check-only");
const webUrl = envOrDefault("WEB_URL", `http://127.0.0.1:${envOrDefault("WEB_PORT", "3000")}`);
const indexerUrl = envOrDefault("INDEXER_URL", "http://127.0.0.1:8787").replace(/\/$/, "");
const children = [];
let stoppingChildren = false;

await run(pnpm, ["build:packages"]);

if (!(await indexerHealthy())) {
  children.push(start("indexer", pnpm, ["indexer"]));
}

if (!(await webHealthy())) {
  children.push(start("web", pnpm, ["--filter", "@interlock/web", "dev"], { PORT: process.env.WEB_PORT ?? "3000" }));
}

try {
  await waitFor("indexer", indexerHealthy);
  await waitFor("web", webHealthy);

  const health = await fetchJson(`${indexerUrl}/health`);
  const agents = await fetchJson(`${indexerUrl}/agents`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        dashboard: webUrl,
        indexer: indexerUrl,
        indexedAgents: Array.isArray(agents.agents) ? agents.agents.length : 0,
        nextFromBlock: health.nextFromBlock,
        syncIntervalMs: health.syncIntervalMs,
        note: checkOnly ? "Live demo services verified." : "Live demo is running. Press Ctrl+C to stop spawned services.",
      },
      null,
      2,
    ),
  );

  if (checkOnly) {
    stopChildren();
  } else {
    await waitForever();
  }
} catch (error) {
  stopChildren();
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

process.on("SIGINT", () => {
  stopChildren();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopChildren();
  process.exit(0);
});

function start(label, command, commandArgs, envOverrides = {}) {
  const spawned = spawnCommand(command, commandArgs);
  const child = spawn(spawned.command, spawned.args, {
    cwd: root,
    env: { ...process.env, ...envOverrides },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => prefix(label, chunk));
  child.stderr.on("data", (chunk) => prefix(label, chunk));
  child.on("exit", (code, signal) => {
    if (stoppingChildren) return;
    if (code !== 0 && code !== null) {
      console.error(`[${label}] exited with ${code}`);
    }
    if (signal) {
      console.error(`[${label}] terminated by ${signal}`);
    }
  });

  return child;
}

function run(command, commandArgs) {
  const spawned = spawnCommand(command, commandArgs);
  return new Promise((resolve, reject) => {
    const child = spawn(spawned.command, spawned.args, {
      cwd: root,
      env: process.env,
      stdio: "inherit",
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} terminated by ${signal}`));
        return;
      }
      if (code && code !== 0) {
        reject(new Error(`${command} exited with ${code}`));
        return;
      }
      resolve();
    });

    child.on("error", reject);
  });
}

function prefix(label, chunk) {
  for (const line of chunk.toString().split(/\r?\n/)) {
    if (line.trim()) console.log(`[${label}] ${line}`);
  }
}

async function waitFor(label, probe) {
  const deadline = Date.now() + 90_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      if (await probe()) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(750);
  }

  const detail = lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  throw new Error(`${label} did not become healthy before timeout.${detail}`);
}

async function indexerHealthy() {
  try {
    const health = await fetchJson(`${indexerUrl}/health`);
    return health.ok === true;
  } catch {
    return false;
  }
}

async function webHealthy() {
  try {
    const response = await fetch(webUrl);
    const text = await response.text();
    return response.ok && text.includes("Interlock");
  } catch {
    return false;
  }
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned HTTP ${response.status}`);
  }
  return response.json();
}

function stopChildren() {
  stoppingChildren = true;
  for (const child of children) {
    if (!child.pid || child.exitCode !== null) continue;
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  }
}

function waitForever() {
  return new Promise(() => undefined);
}

function spawnCommand(command, commandArgs) {
  if (process.platform !== "win32") {
    return { command, args: commandArgs };
  }

  const commandLine = [command, ...commandArgs].map(quoteWindowsArg).join(" ");
  return {
    command: process.env.ComSpec ?? "cmd.exe",
    args: ["/d", "/s", "/c", commandLine],
  };
}

function quoteWindowsArg(value) {
  if (!/[ \t"&|<>^]/.test(value)) return value;
  return `"${value.replaceAll('"', '\\"')}"`;
}

function envOrDefault(name, fallback) {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
