import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const defaultManifest = "deployments/mantle-sepolia/latest.json";
const args = process.argv.slice(2);
const manifestPath = valueAfter("--manifest") ?? valueAfter("--file") ?? defaultManifest;
const noFail = args.includes("--no-fail");

const requiredAddresses = ["agentRegistry", "policyRegistry", "actionAttestation"];
const requiredTransactions = [...requiredAddresses, "setActionAttestation"];
const addressPattern = /^0x[a-fA-F0-9]{40}$/;
const hashPattern = /^0x[a-fA-F0-9]{64}$/;
const integerStringPattern = /^\d+$/;

const report = await buildReport(resolve(manifestPath));
console.log(JSON.stringify(report, null, 2));

if (!report.ok && !noFail) {
  process.exitCode = 1;
}

async function buildReport(path) {
  const errors = [];
  let manifest;

  try {
    manifest = JSON.parse((await readFile(path, "utf8")).replace(/^\uFEFF/, ""));
  } catch (error) {
    return {
      ok: false,
      manifestPath: path,
      errors: [`Cannot read deployment manifest: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  if (!isRecord(manifest)) {
    return {
      ok: false,
      manifestPath: path,
      errors: ["Deployment manifest must be a JSON object."],
    };
  }

  expectEqual(errors, manifest.chain, "mantleSepolia", "chain");
  expectEqual(errors, manifest.chainId, 5003, "chainId");
  expectString(errors, manifest.rpcUrl, "rpcUrl");
  expectIsoDate(errors, manifest.deployedAt, "deployedAt");
  expectAddress(errors, manifest.deployer, "deployer");

  const addresses = recordField(errors, manifest.addresses, "addresses");
  for (const key of requiredAddresses) {
    expectAddress(errors, addresses?.[key], `addresses.${key}`);
  }
  for (const key of ["testStrategyVault", "testStrategyRouter"]) {
    if (addresses?.[key] !== undefined) {
      expectAddress(errors, addresses[key], `addresses.${key}`);
    }
  }

  const compatibility = recordField(errors, manifest.compatibility, "compatibility");
  const policyRegistry = recordField(errors, compatibility?.policyRegistry, "compatibility.policyRegistry");
  expectEqual(errors, policyRegistry?.version, "1.2.0", "compatibility.policyRegistry.version");
  expectEqual(errors, policyRegistry?.supportsPolicyEnumeration, true, "compatibility.policyRegistry.supportsPolicyEnumeration");

  const transactions = recordField(errors, manifest.transactions, "transactions");
  for (const key of requiredTransactions) {
    expectHash(errors, transactions?.[key], `transactions.${key}`);
  }
  for (const key of ["testStrategyVault", "testStrategyRouter"]) {
    if (addresses?.[key] !== undefined) {
      expectHash(errors, transactions?.[key], `transactions.${key}`);
    }
  }

  const blocks = recordField(errors, manifest.blocks, "blocks");
  for (const key of requiredTransactions) {
    expectIntegerString(errors, blocks?.[key], `blocks.${key}`);
  }
  for (const key of ["testStrategyVault", "testStrategyRouter"]) {
    if (addresses?.[key] !== undefined) {
      expectIntegerString(errors, blocks?.[key], `blocks.${key}`);
    }
  }

  return {
    ok: errors.length === 0,
    manifestPath: path,
    chain: manifest.chain,
    chainId: manifest.chainId,
    deployedAt: manifest.deployedAt,
    deployer: manifest.deployer,
    addressCount: isRecord(addresses) ? Object.keys(addresses).length : 0,
    transactionCount: isRecord(transactions) ? Object.keys(transactions).length : 0,
    compatibility: manifest.compatibility,
    errors,
  };
}

function valueAfter(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function recordField(errors, value, path) {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return undefined;
  }
  return value;
}

function expectEqual(errors, actual, expected, path) {
  if (actual !== expected) {
    errors.push(`${path} must be ${JSON.stringify(expected)}.`);
  }
}

function expectString(errors, value, path) {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${path} must be a non-empty string.`);
  }
}

function expectIsoDate(errors, value, path) {
  expectString(errors, value, path);
  if (typeof value === "string" && Number.isNaN(Date.parse(value))) {
    errors.push(`${path} must be a valid ISO date string.`);
  }
}

function expectAddress(errors, value, path) {
  if (typeof value !== "string" || !addressPattern.test(value)) {
    errors.push(`${path} must be an EVM address.`);
  }
}

function expectHash(errors, value, path) {
  if (typeof value !== "string" || !hashPattern.test(value)) {
    errors.push(`${path} must be a transaction hash.`);
  }
}

function expectIntegerString(errors, value, path) {
  if (typeof value !== "string" || !integerStringPattern.test(value)) {
    errors.push(`${path} must be an integer string.`);
  }
}
