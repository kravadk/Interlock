import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const manifestPath = resolve(root, option("--manifest") ?? "deployments/mantle-sepolia/latest.json");
const outputPath = option("--out");
const explorer = option("--explorer") ?? "https://sepolia.mantlescan.xyz";

if (!existsSync(manifestPath)) {
  console.error(`Deployment manifest not found: ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, ""));
const errors = validate(manifest);

if (errors.length > 0) {
  console.error("Cannot generate deployment report from invalid manifest:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

const report = renderReport(manifest, explorer);

if (outputPath) {
  const resolvedOutputPath = resolve(root, outputPath);
  mkdirSync(dirname(resolvedOutputPath), { recursive: true });
  writeFileSync(resolvedOutputPath, report);
  console.log(`Deployment report written: ${resolvedOutputPath}`);
} else {
  process.stdout.write(report);
}

function renderReport(manifest, explorerBaseUrl) {
  const addressRows = [
    ["AgentRegistry", manifest.addresses.agentRegistry],
    ["PolicyRegistry", manifest.addresses.policyRegistry],
    ["ActionAttestation", manifest.addresses.actionAttestation],
  ];
  for (const [name, key] of [
    ["TestStrategyVault", "testStrategyVault"],
    ["TestStrategyRouter", "testStrategyRouter"],
  ]) {
    if (manifest.addresses[key]) {
      addressRows.push([name, manifest.addresses[key]]);
    }
  }

  const txRows = [
    ["AgentRegistry deploy", manifest.transactions.agentRegistry, manifest.blocks.agentRegistry],
    ["PolicyRegistry deploy", manifest.transactions.policyRegistry, manifest.blocks.policyRegistry],
    ["ActionAttestation deploy", manifest.transactions.actionAttestation, manifest.blocks.actionAttestation],
    ["AgentRegistry.setActionAttestation", manifest.transactions.setActionAttestation, manifest.blocks.setActionAttestation],
  ];
  for (const [name, key] of [
    ["TestStrategyVault deploy", "testStrategyVault"],
    ["TestStrategyRouter deploy", "testStrategyRouter"],
  ]) {
    if (manifest.transactions[key]) {
      txRows.push([name, manifest.transactions[key], manifest.blocks[key]]);
    }
  }

  return `# Interlock Firewall Mantle Sepolia Deployment

Generated from \`${relativeManifestPath()}\`.

## Network

- Chain: ${manifest.chain}
- Chain ID: ${manifest.chainId}
- RPC URL: ${manifest.rpcUrl}
- Explorer: ${explorerBaseUrl}
- Deployed at: ${manifest.deployedAt}
- Deployer: [${manifest.deployer}](${addressUrl(explorerBaseUrl, manifest.deployer)})

## Contracts

| Contract | Address | Explorer |
| --- | --- | --- |
${addressRows.map(([name, address]) => `| ${name} | \`${address}\` | [open](${addressUrl(explorerBaseUrl, address)}) |`).join("\n")}

## Transactions

| Step | Tx Hash | Block | Explorer |
| --- | --- | --- | --- |
${txRows.map(([name, hash, block]) => `| ${name} | \`${hash}\` | ${block} | [open](${txUrl(explorerBaseUrl, hash)}) |`).join("\n")}

## Compatibility

- PolicyRegistry version: \`${manifest.compatibility.policyRegistry.version}\`
- Policy enumeration: \`${String(manifest.compatibility.policyRegistry.supportsPolicyEnumeration)}\`

## Post-Deploy Commands

\`\`\`bash
pnpm deployment:manifest:doctor
pnpm live:readiness
pnpm live:verify
pnpm live:smoke
pnpm indexer:live
pnpm web:live
\`\`\`

## Submission Snippet

Interlock Firewall is deployed on Mantle Sepolia with verifiable agent registry, policy registry, and action attestation contracts. The deployment supports PolicyRegistry v1.2.0 with enumerable allowlists and slippage bounds for exact policy reconciliation.
`;
}

function validate(value) {
  const errors = [];
  if (value?.chain !== "mantleSepolia") errors.push("chain must be mantleSepolia");
  if (value?.chainId !== 5003) errors.push("chainId must be 5003");
  if (!value?.addresses || typeof value.addresses !== "object") errors.push("addresses must be present");
  if (!value?.transactions || typeof value.transactions !== "object") errors.push("transactions must be present");
  if (!value?.blocks || typeof value.blocks !== "object") errors.push("blocks must be present");
  if (value?.compatibility?.policyRegistry?.version !== "1.2.0") errors.push("PolicyRegistry version must be 1.2.0");
  if (value?.compatibility?.policyRegistry?.supportsPolicyEnumeration !== true) errors.push("PolicyRegistry enumeration must be true");

  for (const key of ["agentRegistry", "policyRegistry", "actionAttestation"]) {
    if (!isAddress(value?.addresses?.[key])) errors.push(`addresses.${key} must be an EVM address`);
    if (!isTxHash(value?.transactions?.[key])) errors.push(`transactions.${key} must be a tx hash`);
    if (!isBlock(value?.blocks?.[key])) errors.push(`blocks.${key} must be a block number string`);
  }

  if (!isTxHash(value?.transactions?.setActionAttestation)) errors.push("transactions.setActionAttestation must be a tx hash");
  if (!isBlock(value?.blocks?.setActionAttestation)) errors.push("blocks.setActionAttestation must be a block number string");

  return errors;
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

function addressUrl(explorerBaseUrl, address) {
  return `${explorerBaseUrl}/address/${address}`;
}

function txUrl(explorerBaseUrl, hash) {
  return `${explorerBaseUrl}/tx/${hash}`;
}

function isAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isTxHash(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value);
}

function isBlock(value) {
  return typeof value === "string" && /^\d+$/.test(value);
}

function relativeManifestPath() {
  return manifestPath.slice(root.length + 1).replaceAll("\\", "/");
}
