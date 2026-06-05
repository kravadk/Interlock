import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const contractsDir = path.join(root, "packages", "contracts", "contracts");
const manifestPath = path.join(root, "deployments", "mantle-sepolia", "latest.json");
const apiKey = process.env.ETHERSCAN_API_KEY ?? process.env.MANTLESCAN_API_KEY;
const apiUrl = process.env.ETHERSCAN_V2_API_URL ?? "https://api.etherscan.io/v2/api";
const poll = process.argv.includes("--poll");
const dryRun = process.argv.includes("--dry-run");
const exportDirOption = option("--export-dir");
const exportDir = exportDirOption ? path.resolve(root, exportDirOption) : undefined;

const contractsRequire = createRequire(path.join(root, "packages", "contracts", "package.json"));
const solc = contractsRequire("solc");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const standardJson = await standardJsonInput();
const sourceCode = JSON.stringify(standardJson);
const compilerVersion = `v${solc.version().replace(".Emscripten.clang", "")}`;

const contracts = [
  {
    label: "AgentRegistry",
    address: manifest.addresses.agentRegistry,
    contractName: "AgentRegistry.sol:AgentRegistry",
    constructorArguments: "",
  },
  {
    label: "PolicyRegistry",
    address: manifest.addresses.policyRegistry,
    contractName: "PolicyRegistry.sol:PolicyRegistry",
    constructorArguments: `000000000000000000000000${manifest.addresses.agentRegistry.slice(2).toLowerCase()}`,
  },
  {
    label: "ActionAttestation",
    address: manifest.addresses.actionAttestation,
    contractName: "ActionAttestation.sol:ActionAttestation",
    constructorArguments:
      `000000000000000000000000${manifest.addresses.agentRegistry.slice(2).toLowerCase()}` +
      `000000000000000000000000${manifest.addresses.policyRegistry.slice(2).toLowerCase()}`,
  },
];

if (exportDir) {
  await exportVerificationArtifacts(exportDir);
  process.exit(0);
}

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun: true,
        apiUrl,
        chainId: String(manifest.chainId),
        compilerVersion,
        settings: standardJson.settings,
        sourceFiles: Object.keys(standardJson.sources),
        contracts,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

async function exportVerificationArtifacts(outputDir) {
  await mkdir(outputDir, { recursive: true });
  const standardJsonPath = path.join(outputDir, "standard-json-input.json");
  const contractsPath = path.join(outputDir, "contracts.json");
  const readmePath = path.join(outputDir, "README.md");

  await writeFile(standardJsonPath, `${JSON.stringify(standardJson, null, 2)}\n`);
  await writeFile(
    contractsPath,
    `${JSON.stringify(
      {
        chainId: String(manifest.chainId),
        compilerVersion,
        apiUrl,
        settings: standardJson.settings,
        contracts,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(readmePath, verificationReadme());

  console.log(
    JSON.stringify(
      {
        ok: true,
        exportDir: outputDir,
        files: [standardJsonPath, contractsPath, readmePath],
        contracts,
      },
      null,
      2,
    ),
  );
}

function verificationReadme() {
  const rows = contracts
    .map(
      (contract) => `| ${contract.label} | \`${contract.address}\` | \`${contract.contractName}\` | \`${contract.constructorArguments || "none"}\` |`,
    )
    .join("\n");

  return `# Mantle Sepolia Contract Verification Artifacts

Generated from \`scripts/verify-etherscan-v2.mjs --export-dir\`.

## Compiler Settings

- Compiler: \`${compilerVersion}\`
- Chain ID: \`${manifest.chainId}\`
- EVM version: \`${standardJson.settings.evmVersion}\`
- viaIR: \`${String(standardJson.settings.viaIR)}\`
- Optimizer: \`${standardJson.settings.optimizer.enabled ? "enabled" : "disabled"}\`
- Optimizer runs: \`${standardJson.settings.optimizer.runs}\`
- License: \`MIT\`

## Files

- \`standard-json-input.json\` - Solidity Standard JSON input for source verification.
- \`contracts.json\` - contract addresses, names, constructor arguments, compiler settings.

## Contracts

| Contract | Address | Contract name | Constructor arguments |
| --- | --- | --- | --- |
${rows}

## API Verification

\`\`\`bash
ETHERSCAN_API_KEY=<key> pnpm contracts:verify -- --poll
pnpm contracts:verification-status
\`\`\`

## Manual Verification

Use \`standard-json-input.json\` in Mantlescan's Solidity Standard JSON verification flow. For constructor arguments, copy the exact value from \`contracts.json\`; use no constructor arguments for \`AgentRegistry\`.
`;
}

if (!apiKey) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: "Missing ETHERSCAN_API_KEY or MANTLESCAN_API_KEY.",
        action: "Create an Etherscan API key, set it in the environment, then rerun pnpm contracts:verify.",
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const results = [];
for (const contract of contracts) {
  const submission = await submitVerification(contract);
  results.push({ ...contract, ...submission });
  if (poll && submission.guid) {
    results[results.length - 1].status = await pollStatus(submission.guid);
  }
}

const ok = results.every((result) => result.ok);
console.log(JSON.stringify({ ok, apiUrl, chainId: "5003", compilerVersion, results }, null, 2));
if (!ok) process.exit(1);

async function standardJsonInput() {
  const files = (await readdir(contractsDir)).filter((file) => file.endsWith(".sol")).sort();
  const sources = Object.fromEntries(
    await Promise.all(
      files.map(async (file) => [
        file,
        {
          content: await readFile(path.join(contractsDir, file), "utf8"),
        },
      ]),
    ),
  );

  return {
    language: "Solidity",
    sources,
    settings: {
      evmVersion: "paris",
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"],
        },
      },
    },
  };
}

async function submitVerification(contract) {
  const body = new URLSearchParams({
    apikey: apiKey,
    chainid: String(manifest.chainId),
    module: "contract",
    action: "verifysourcecode",
    contractaddress: contract.address,
    sourceCode,
    codeformat: "solidity-standard-json-input",
    contractname: contract.contractName,
    compilerversion: compilerVersion,
    optimizationUsed: "1",
    runs: "200",
    constructorArguments: contract.constructorArguments,
    evmVersion: "paris",
    licenseType: "3",
  });

  const response = await fetch(apiUrl, { method: "POST", body });
  const json = await response.json();
  const result = String(json.result ?? "");
  const alreadyVerified = result.toLowerCase().includes("already verified");
  return {
    ok: json.status === "1" || alreadyVerified,
    message: json.message,
    result,
    guid: json.status === "1" ? result : undefined,
  };
}

async function pollStatus(guid) {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const body = new URLSearchParams({
      apikey: apiKey,
      chainid: String(manifest.chainId),
      module: "contract",
      action: "checkverifystatus",
      guid,
    });
    const response = await fetch(apiUrl, { method: "POST", body });
    const json = await response.json();
    const result = String(json.result ?? "");
    if (!result.toLowerCase().includes("pending")) {
      return { attempt, ...json };
    }
  }
  return { pending: true, attempts: 12 };
}

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`Missing value for ${name}`);
    process.exit(1);
  }
  return value;
}
