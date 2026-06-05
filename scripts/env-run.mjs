import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

let [, , command, ...args] = process.argv;

if (!command) {
  console.error("Usage: node scripts/env-run.mjs [--env-file path] <command> [...args]");
  process.exit(1);
}

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
let envFile = resolve(root, ".env");
let explicitEnvFile = false;

if (command === "--env-file") {
  const [providedEnvFile, nextCommand, ...rest] = args;
  if (!providedEnvFile || !nextCommand) {
    console.error("Usage: node scripts/env-run.mjs --env-file <path> <command> [...args]");
    process.exit(1);
  }
  envFile = resolve(root, providedEnvFile);
  explicitEnvFile = true;
  command = nextCommand;
  args = rest;
}

if (explicitEnvFile && !existsSync(envFile)) {
  console.error(`Env file not found: ${envFile}`);
  process.exit(1);
}

const rootEnvFile = resolve(root, ".env");
const rootEnv = explicitEnvFile && existsSync(rootEnvFile) ? loadEnvFile(rootEnvFile) : {};
const loaded = existsSync(envFile) ? loadEnvFile(envFile) : {};
const env = { ...rootEnv, ...loaded, ...process.env };

const spawned = spawnCommand(command, args);
const child = spawn(spawned.command, spawned.args, {
  cwd: root,
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Command terminated by ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});

function loadEnvFile(path) {
  const entries = {};
  const content = readFileSync(path, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = line.slice(0, equalsIndex).trim();
    const value = stripQuotes(line.slice(equalsIndex + 1).trim());
    if (!key || process.env[key] !== undefined) continue;

    entries[key] = value;
  }

  return entries;
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function spawnCommand(value, commandArgs) {
  if (process.platform !== "win32") {
    return { command: value, args: commandArgs };
  }

  const commandLine = [value, ...commandArgs].map(quoteWindowsArg).join(" ");
  return {
    command: process.env.ComSpec ?? "cmd.exe",
    args: ["/d", "/s", "/c", commandLine],
  };
}

function quoteWindowsArg(value) {
  if (!/[ \t"&|<>^]/.test(value)) return value;
  return `"${value.replaceAll('"', '\\"')}"`;
}
