import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const manifest = resolve(root, option("--manifest") ?? "deployments/mantle-sepolia/latest.json");
const envOut = resolve(root, option("--env-out") ?? "deployments/mantle-sepolia/latest.env");
const noFail = args.includes("--no-fail");

const checks = [];

if (!existsSync(manifest)) {
  checks.push({
    name: "manifest-present",
    ok: false,
    detail: `Deployment manifest not found: ${manifest}`,
  });
  finish();
  process.exit(noFail ? 0 : 1);
}

checks.push(runCheck("manifest-doctor", [
  "node",
  ["scripts/deployment-manifest-doctor.mjs", "--manifest", manifest],
]));

checks.push(runCheck("manifest-env", [
  "node",
  ["scripts/deployment-manifest-env.mjs", "--manifest", manifest, "--out", envOut],
]));

if (existsSync(envOut)) {
  const doctorEnv = {
    ...loadOptionalEnvFile(resolve(root, ".env")),
    ...loadEnvFile(envOut),
    ...process.env,
  };
  delete doctorEnv.INDEXER_URL;
  delete doctorEnv.NEXT_PUBLIC_INDEXER_URL;

  checks.push(runCheck("cli-doctor", [
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["cli:built", "doctor"],
    { env: doctorEnv },
  ]));
} else {
  checks.push({
    name: "cli-doctor",
    ok: false,
    detail: `Env file was not generated: ${envOut}`,
  });
}

finish();

function runCheck(name, [command, commandArgs, options = {}]) {
  const spawned = spawnCommand(command, commandArgs);
  const result = spawnSync(spawned.command, spawned.args, {
    cwd: root,
    encoding: "utf8",
    env: options.env ?? process.env,
  });

  return {
    name,
    ok: result.status === 0,
    command: `${command} ${commandArgs.join(" ")}`,
    stdout: trimOutput(result.stdout ?? ""),
    stderr: trimOutput(result.stderr ?? result.error?.message ?? ""),
  };
}

function finish() {
  const ok = checks.every((check) => check.ok);
  const report = {
    ok,
    manifest,
    envOut,
    checks,
    nextCommands: ok
      ? [
          "pnpm live:smoke",
          "pnpm live:demo",
          "pnpm live:services",
        ]
      : [
          "pnpm deploy:mantle-sepolia",
          "pnpm deployment:manifest:doctor",
          "pnpm deployment:manifest:env -- --manifest deployments/mantle-sepolia/latest.json --out deployments/mantle-sepolia/latest.env",
        ],
  };

  console.log(JSON.stringify(report, null, 2));

  if (!ok && !noFail) {
    process.exitCode = 1;
  }
}

function option(name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`Missing value for ${name}`);
    process.exit(1);
  }
  return value;
}

function trimOutput(value) {
  const trimmed = value.trim();
  if (trimmed.length <= 4_000) return trimmed;
  return `${trimmed.slice(0, 4_000)}\n...<truncated>`;
}

function loadEnvFile(path) {
  const entries = {};
  const content = readFileSync(path, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();
    if (key) entries[key] = stripQuotes(value);
  }

  return entries;
}

function loadOptionalEnvFile(path) {
  return existsSync(path) ? loadEnvFile(path) : {};
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
  return `"${value.replaceAll('"', '""')}"`;
}
