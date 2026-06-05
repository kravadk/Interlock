import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultManifest = resolve(root, "deployments", "mantle-sepolia", "latest.json");

const args = process.argv.slice(2);
const manifestPath = resolve(root, readOption("--manifest") ?? readOption("--file") ?? defaultManifest);
const outputPath = readOption("--out");
const indexerUrl = readOption("--indexer-url") ?? "";
const port = readOption("--port") ?? "8787";
const autoSync = readOption("--auto-sync") ?? "true";
const syncIntervalMs = readOption("--sync-interval-ms") ?? "60000";
const blockChunkSize = readOption("--block-chunk-size") ?? "9000";
const indexerDbPath = readOption("--indexer-db-path");
const defaultAgentId = readOption("--default-agent-id") ?? "";
const defaultPolicyId = readOption("--default-policy-id") ?? "";
const defaultActionTarget = readOption("--default-action-target");
const defaultSelector = readOption("--default-selector") ?? "0x2de5aaf7";

if (!existsSync(manifestPath)) {
  console.error(`Deployment manifest not found: ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(stripBom(readFileSync(manifestPath, "utf8")));
const errors = validateManifest(manifest);

if (errors.length > 0) {
  console.error("Cannot generate env from invalid deployment manifest:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

const env = renderEnv(manifest, {
  indexerUrl,
  port,
  autoSync,
  syncIntervalMs,
  blockChunkSize,
  indexerDbPath,
  defaultAgentId,
  defaultPolicyId,
  defaultActionTarget,
  defaultSelector,
});

if (outputPath) {
  const resolvedOutputPath = resolve(root, outputPath);
  mkdirSync(dirname(resolvedOutputPath), { recursive: true });
  writeFileSync(resolvedOutputPath, env);
  console.log(`Deployment env written: ${resolvedOutputPath}`);
} else {
  process.stdout.write(env);
}

function readOption(name) {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`Missing value for ${name}`);
    process.exit(1);
  }
  return value;
}

function validateManifest(value) {
  const result = [];
  const addresses = value?.addresses ?? {};
  const blocks = value?.blocks ?? {};

  if (value?.chain !== "mantleSepolia") result.push(`expected chain mantleSepolia, got ${String(value?.chain)}`);
  if (value?.chainId !== 5003) result.push(`expected chainId 5003, got ${String(value?.chainId)}`);
  if (!isHttpUrl(value?.rpcUrl)) result.push("rpcUrl must be an http(s) URL");

  for (const key of ["agentRegistry", "policyRegistry", "actionAttestation"]) {
    if (!isAddress(addresses[key])) result.push(`addresses.${key} must be an EVM address`);
  }
  for (const key of ["testStrategyVault", "testStrategyRouter"]) {
    if (addresses[key] !== undefined && !isAddress(addresses[key])) result.push(`addresses.${key} must be an EVM address`);
  }

  for (const key of ["agentRegistry", "policyRegistry", "actionAttestation"]) {
    if (!isBlockNumber(blocks[key])) result.push(`blocks.${key} must be a block number string`);
  }

  return result;
}

function renderEnv(manifest, options) {
  const { addresses, blocks, rpcUrl } = manifest;
  const fromBlock = minBlock([blocks.agentRegistry, blocks.policyRegistry, blocks.actionAttestation]);

  return `MANTLE_RPC_URL=${rpcUrl}
AGENT_REGISTRY=${addresses.agentRegistry}
POLICY_REGISTRY=${addresses.policyRegistry}
ACTION_ATTESTATION=${addresses.actionAttestation}
${addresses.testStrategyVault ? `TEST_STRATEGY_VAULT=${addresses.testStrategyVault}\n` : ""}${addresses.testStrategyRouter ? `TEST_STRATEGY_ROUTER=${addresses.testStrategyRouter}\n` : ""}
NEXT_PUBLIC_MANTLE_RPC_URL=${rpcUrl}
NEXT_PUBLIC_AGENT_REGISTRY=${addresses.agentRegistry}
NEXT_PUBLIC_POLICY_REGISTRY=${addresses.policyRegistry}
NEXT_PUBLIC_ACTION_ATTESTATION=${addresses.actionAttestation}
${addresses.testStrategyVault ? `NEXT_PUBLIC_TEST_STRATEGY_VAULT=${addresses.testStrategyVault}\n` : ""}${addresses.testStrategyRouter ? `NEXT_PUBLIC_TEST_STRATEGY_ROUTER=${addresses.testStrategyRouter}\n` : ""}
NEXT_PUBLIC_INDEXER_URL=${options.indexerUrl}
NEXT_PUBLIC_DEFAULT_AGENT_ID=${options.defaultAgentId}
NEXT_PUBLIC_DEFAULT_POLICY_ID=${options.defaultPolicyId}
NEXT_PUBLIC_DEFAULT_ACTION_TARGET=${options.defaultActionTarget ?? addresses.agentRegistry}
NEXT_PUBLIC_DEFAULT_SELECTOR=${options.defaultSelector}
INDEXER_URL=${options.indexerUrl}
FROM_BLOCK=${fromBlock}
INDEXER_DB_PATH=${options.indexerDbPath ?? defaultDeploymentDbPath(addresses.actionAttestation)}
PORT=${options.port}
AUTO_SYNC=${options.autoSync}
SYNC_INTERVAL_MS=${options.syncIntervalMs}
INDEXER_BLOCK_CHUNK_SIZE=${options.blockChunkSize}
`;
}

function minBlock(values) {
  return values
    .map((value) => BigInt(value))
    .reduce((min, value) => (value < min ? value : min))
    .toString();
}

function defaultDeploymentDbPath(actionAttestation) {
  return `.interlock-indexer-${actionAttestation.toLowerCase().slice(2, 10)}.sqlite`;
}

function isAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isBlockNumber(value) {
  return typeof value === "string" && /^\d+$/.test(value);
}

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//.test(value);
}

function stripBom(value) {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
