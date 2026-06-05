import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const smokeRoot = mkdtempSync(join(tmpdir(), "interlock-consumer-"));
const tarballDir = join(smokeRoot, "tarballs");
const appDir = join(smokeRoot, "app");
const livePolicyTarget = "0xe4dfef03e107225f2239cfff955a378a9a8158be";

const packages = [
  { name: "@interlock/shared", dir: "packages/shared" },
  { name: "@interlock/firewall-sdk", dir: "packages/sdk" },
  { name: "@interlock/indexer", dir: "packages/indexer" },
  { name: "@interlock/mcp", dir: "packages/mcp" },
  { name: "@interlock/cli", dir: "packages/cli" },
];

rmSync(smokeRoot, { recursive: true, force: true });
mkdirSync(tarballDir, { recursive: true });
mkdirSync(appDir, { recursive: true });

try {
  const dependencies = {};
  const overrides = {};

  for (const pkg of packages) {
    const summary = packPackage(pkg);
    const relativeTarball = relative(appDir, summary.filename).replaceAll("\\", "/");
    dependencies[pkg.name] = `file:${relativeTarball}`;
    overrides[pkg.name] = `file:${relativeTarball}`;
  }

  writeFileSync(
    join(appDir, "package.json"),
    JSON.stringify(
      {
        name: "interlock-consumer-smoke",
        private: true,
        type: "module",
        dependencies,
        pnpm: {
          overrides,
        },
      },
      null,
      2,
    ),
  );

  writeFileSync(
    join(appDir, "verify.mjs"),
    `import { InterlockFirewall, policyPackFromPreset, conservativeDeFiPolicy, withInterlockFirewall } from "@interlock/firewall-sdk";
import { mantleSepolia, agentRegistryAbi, deployedAddresses } from "@interlock/shared";
import { ActionStore, createIndexerServer } from "@interlock/indexer";

if (typeof InterlockFirewall !== "function") throw new Error("InterlockFirewall export missing");
if (typeof withInterlockFirewall !== "function") throw new Error("withInterlockFirewall export missing");
if (typeof InterlockFirewall.prototype.recordDecisionAndWait !== "function") {
  throw new Error("recordDecisionAndWait export missing");
}
if (mantleSepolia.id !== 5003) throw new Error("Mantle Sepolia chain mismatch");
if (!Array.isArray(agentRegistryAbi)) throw new Error("ABI export missing");
if (typeof createIndexerServer !== "function") throw new Error("Indexer server export missing");
const pack = policyPackFromPreset(conservativeDeFiPolicy({ targets: [deployedAddresses.mantleSepolia.agentRegistry] }));
if (pack.version !== "interlock.policy.v1") throw new Error("Policy pack export missing");

const store = new ActionStore();
if (store.list().length !== 0) throw new Error("ActionStore did not initialize empty");

console.log("Consumer import smoke passed");
`,
  );

  run("pnpm", ["install", "--ignore-scripts"], appDir, { capture: true });
  run("node", ["verify.mjs"], appDir);
  runAgentops(["help"], appDir);
  runAgentops(["preset", "--name", "conservative-defi", "--target", livePolicyTarget], appDir);
  runAgentops(["policy-pack", "--name", "conservative-defi", "--target", livePolicyTarget], appDir);
  runAgentops(["policy-audit", "--help"], appDir);
  runAgentops(["policy-apply", "--help"], appDir);
  runAgentops(["policy-check", "--help"], appDir);

  console.log("Consumer install smoke passed");
} finally {
  rmSync(smokeRoot, { recursive: true, force: true });
}

function packPackage(pkg) {
  const result = run("pnpm", ["pack", "--pack-destination", tarballDir, "--json"], join(root, pkg.dir), {
    capture: true,
  });
  const summary = JSON.parse(result.stdout.trim());
  if (summary.name !== pkg.name) {
    throw new Error(`Unexpected pack summary for ${pkg.name}: ${result.stdout}`);
  }
  return summary;
}

function run(command, args, cwd, options = {}) {
  const spawned = spawnCommand(command, args);
  const result = spawnSync(spawned.command, spawned.args, {
    cwd,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });

  if (result.status !== 0) {
    throw new Error(
      `Command failed (${result.status}): ${command} ${args.join(" ")}\n${result.error?.message ?? ""}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
  }

  return result;
}

function runDirect(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });

  if (result.status !== 0) {
    throw new Error(
      `Command failed (${result.status}): ${command} ${args.join(" ")}\n${result.error?.message ?? ""}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`,
    );
  }

  return result;
}

function runAgentops(args, cwd) {
  runDirect(process.execPath, [join(cwd, "node_modules", "@interlock", "cli", "dist", "index.js"), ...args], cwd);
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
  return `"${value.replaceAll('"', '""')}"`;
}
