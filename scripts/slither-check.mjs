import { rmSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const reportsDir = resolve(root, "reports");
const solcVersion = "0.8.30";

mkdirSync(reportsDir, { recursive: true });

const runner = resolveRunner();
if (!runner) {
  console.error("Slither could not be run.");
  console.error("Install uv or install Slither manually with: pipx install slither-analyzer");
  console.error("Then rerun: pnpm security:slither");
  process.exit(1);
}

const contracts = [
  {
    file: "packages/contracts/contracts/AgentRegistry.sol",
    report: "reports/slither-AgentRegistry.json",
  },
  {
    file: "packages/contracts/contracts/PolicyRegistry.sol",
    report: "reports/slither-PolicyRegistry.json",
    // False positive: this file defines a minimal external AgentRegistry interface
    // and PolicyRegistry has an unrelated ownerOf(policyId) getter with the same signature.
    extraArgs: ["--exclude", "missing-inheritance"],
  },
  {
    file: "packages/contracts/contracts/ActionAttestation.sol",
    report: "reports/slither-ActionAttestation.json",
  },
  {
    file: "packages/contracts/contracts/ActionAttestationV2.sol",
    report: "reports/slither-ActionAttestationV2.json",
    // Accepted patterns:
    // - timestamp: decision expiry and dispute-window checks;
    // - assembly: dependency-free ECDSA recover;
    // - naming-convention: DOMAIN_SEPARATOR constant.
    extraArgs: [
      "--solc-args",
      "--via-ir --optimize --optimize-runs 200",
      "--exclude",
      "timestamp,assembly,naming-convention",
    ],
  },
  {
    file: "packages/contracts/contracts/PolicyGuardedExecutor.sol",
    report: "reports/slither-PolicyGuardedExecutor.json",
    // Accepted pattern: this contract is an explicit policy-guarded forwarder.
    extraArgs: ["--exclude", "low-level-calls"],
  },
  {
    file: "packages/contracts/contracts/DisputeEscrow.sol",
    report: "reports/slither-DisputeEscrow.json",
    // Accepted patterns:
    // - timestamp: dispute-window checks;
    // - low-level-calls: pull-payment ETH withdraw after state is cleared and reentrancy-locked.
    extraArgs: ["--exclude", "timestamp,low-level-calls"],
  },
  {
    file: "packages/contracts/contracts/AttestorCommittee.sol",
    report: "reports/slither-AttestorCommittee.json",
    // Accepted pattern: dependency-free ECDSA recover mirrors ActionAttestationV2.
    extraArgs: ["--exclude", "assembly"],
  },
  {
    file: "packages/contracts/contracts/ReputationOracle.sol",
    report: "reports/slither-ReputationOracle.json",
  },
  {
    file: "packages/contracts/contracts/TestStrategyVault.sol",
    report: "reports/slither-TestStrategyVault.json",
  },
  {
    file: "packages/contracts/contracts/TestStrategyRouter.sol",
    report: "reports/slither-TestStrategyRouter.json",
  },
];

for (const contract of contracts) {
  rmSync(resolve(root, contract.report), { force: true });

  const args = [
    ...runner.args,
    contract.file,
    "--compile-force-framework",
    "solc",
    ...(contract.extraArgs ?? []),
    "--json",
    contract.report,
  ];

  const result = spawnSync(runner.command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
  });

  if (result.error || result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log(`Slither analysis passed. Reports written to ${dirname(contracts[0].report)}.`);

function resolveRunner() {
  const uvx = spawnSync("uvx", ["--version"], { cwd: root, encoding: "utf8" });
  if (!uvx.error && uvx.status === 0) {
    const install = spawnSync("uvx", ["--from", "solc-select", "solc-select", "install", solcVersion], {
      cwd: root,
      encoding: "utf8",
      stdio: "inherit",
    });
    if (install.status !== 0) return undefined;

    const use = spawnSync("uvx", ["--from", "solc-select", "solc-select", "use", solcVersion], {
      cwd: root,
      encoding: "utf8",
      stdio: "inherit",
    });
    if (use.status !== 0) return undefined;

    return {
      command: "uvx",
      args: ["--from", "slither-analyzer", "--with", "solc-select", "slither"],
    };
  }

  const slither = process.platform === "win32" ? "slither.exe" : "slither";
  const version = spawnSync(slither, ["--version"], { cwd: root, encoding: "utf8" });
  if (!version.error && version.status === 0) {
    return { command: slither, args: [] };
  }

  return undefined;
}
