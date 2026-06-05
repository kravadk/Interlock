import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, http } from "viem";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const manifestPath = resolve(root, option("--manifest") ?? "deployments/mantle-sepolia/latest.json");
const noFail = args.includes("--no-fail");
const offline = args.includes("--offline");

const checks = [];
const agentRegistryVerificationAbi = [
  {
    type: "function",
    name: "actionAttestation",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
];

const policyRegistryVerificationAbi = [
  {
    type: "function",
    name: "VERSION",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "supportsPolicyEnumeration",
    stateMutability: "pure",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "agentRegistry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
];

const actionAttestationVerificationAbi = [
  {
    type: "function",
    name: "agentRegistry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "policyRegistry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
];

if (!existsSync(manifestPath)) {
  checks.push(check("manifest-present", false, `Deployment manifest not found: ${manifestPath}`));
  finish();
  process.exit(noFail ? 0 : 1);
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8").replace(/^\uFEFF/, ""));
const shapeErrors = validateManifestShape(manifest);
checks.push(check("manifest-shape", shapeErrors.length === 0, shapeErrors.join("; ")));

if (shapeErrors.length === 0 && !offline) {
  await verifyOnChain(manifest);
}

finish();

async function verifyOnChain(manifest) {
  const client = createPublicClient({
    chain: {
      id: 5003,
      name: "Mantle Sepolia",
      nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
      rpcUrls: { default: { http: [manifest.rpcUrl] } },
      blockExplorers: { default: { name: "Mantlescan", url: "https://sepolia.mantlescan.xyz" } },
      testnet: true,
    },
    transport: http(manifest.rpcUrl),
  });

  try {
    const chainId = await client.getChainId();
    checks.push(check("chain-id", chainId === 5003, `expected 5003, got ${chainId}`));
  } catch (error) {
    checks.push(check("chain-id", false, errorMessage(error)));
    return;
  }

  for (const [name, address] of Object.entries(manifest.addresses)) {
    try {
      const bytecode = await client.getBytecode({ address });
      checks.push(check(`bytecode:${name}`, Boolean(bytecode && bytecode !== "0x"), `no bytecode at ${address}`));
    } catch (error) {
      checks.push(check(`bytecode:${name}`, false, errorMessage(error)));
    }
  }

  await verifyReceipts(client, manifest);
  await verifyCompatibility(client, manifest);
  await verifyLinks(client, manifest);
}

async function verifyReceipts(client, manifest) {
  const deploymentTxToAddress = {
    agentRegistry: manifest.addresses.agentRegistry,
    policyRegistry: manifest.addresses.policyRegistry,
    actionAttestation: manifest.addresses.actionAttestation,
  };

  for (const [name, hash] of Object.entries(manifest.transactions)) {
    try {
      const receipt = await client.getTransactionReceipt({ hash });
      checks.push(check(`receipt:${name}:status`, receipt.status === "success", `status=${receipt.status}`));
      checks.push(
        check(
          `receipt:${name}:block`,
          receipt.blockNumber.toString() === manifest.blocks[name],
          `expected block ${manifest.blocks[name]}, got ${receipt.blockNumber.toString()}`,
        ),
      );

      const expectedAddress = deploymentTxToAddress[name];
      if (expectedAddress) {
        checks.push(
          check(
            `receipt:${name}:contractAddress`,
            receipt.contractAddress?.toLowerCase() === expectedAddress.toLowerCase(),
            `expected ${expectedAddress}, got ${receipt.contractAddress ?? "null"}`,
          ),
        );
      }
    } catch (error) {
      checks.push(check(`receipt:${name}`, false, errorMessage(error)));
    }
  }
}

async function verifyCompatibility(client, manifest) {
  try {
    const version = await client.readContract({
      address: manifest.addresses.policyRegistry,
      abi: policyRegistryVerificationAbi,
      functionName: "VERSION",
    });
    checks.push(check("policyRegistry:version", version === "1.2.0", `expected 1.2.0, got ${String(version)}`));
  } catch (error) {
    checks.push(check("policyRegistry:version", false, errorMessage(error)));
  }

  try {
    const supportsPolicyEnumeration = await client.readContract({
      address: manifest.addresses.policyRegistry,
      abi: policyRegistryVerificationAbi,
      functionName: "supportsPolicyEnumeration",
    });
    checks.push(
      check(
        "policyRegistry:supportsPolicyEnumeration",
        supportsPolicyEnumeration === true,
        `expected true, got ${String(supportsPolicyEnumeration)}`,
      ),
    );
  } catch (error) {
    checks.push(check("policyRegistry:supportsPolicyEnumeration", false, errorMessage(error)));
  }
}

async function verifyLinks(client, manifest) {
  try {
    const actionAttestation = await client.readContract({
      address: manifest.addresses.agentRegistry,
      abi: agentRegistryVerificationAbi,
      functionName: "actionAttestation",
    });
    checks.push(
      check(
        "agentRegistry:actionAttestation",
        actionAttestation.toLowerCase() === manifest.addresses.actionAttestation.toLowerCase(),
        `expected ${manifest.addresses.actionAttestation}, got ${actionAttestation}`,
      ),
    );
  } catch (error) {
    checks.push(check("agentRegistry:actionAttestation", false, errorMessage(error)));
  }

  try {
    const agentRegistry = await client.readContract({
      address: manifest.addresses.policyRegistry,
      abi: policyRegistryVerificationAbi,
      functionName: "agentRegistry",
    });
    checks.push(
      check(
        "policyRegistry:agentRegistry",
        agentRegistry.toLowerCase() === manifest.addresses.agentRegistry.toLowerCase(),
        `expected ${manifest.addresses.agentRegistry}, got ${agentRegistry}`,
      ),
    );
  } catch (error) {
    checks.push(check("policyRegistry:agentRegistry", false, errorMessage(error)));
  }

  try {
    const [agentRegistry, policyRegistry] = await Promise.all([
      client.readContract({
        address: manifest.addresses.actionAttestation,
        abi: actionAttestationVerificationAbi,
        functionName: "agentRegistry",
      }),
      client.readContract({
        address: manifest.addresses.actionAttestation,
        abi: actionAttestationVerificationAbi,
        functionName: "policyRegistry",
      }),
    ]);

    checks.push(
      check(
        "actionAttestation:agentRegistry",
        agentRegistry.toLowerCase() === manifest.addresses.agentRegistry.toLowerCase(),
        `expected ${manifest.addresses.agentRegistry}, got ${agentRegistry}`,
      ),
    );
    checks.push(
      check(
        "actionAttestation:policyRegistry",
        policyRegistry.toLowerCase() === manifest.addresses.policyRegistry.toLowerCase(),
        `expected ${manifest.addresses.policyRegistry}, got ${policyRegistry}`,
      ),
    );
  } catch (error) {
    checks.push(check("actionAttestation:links", false, errorMessage(error)));
  }
}

function validateManifestShape(value) {
  const errors = [];
  if (value?.chain !== "mantleSepolia") errors.push("chain must be mantleSepolia");
  if (value?.chainId !== 5003) errors.push("chainId must be 5003");
  if (typeof value?.rpcUrl !== "string" || !value.rpcUrl.startsWith("http")) errors.push("rpcUrl must be an http(s) URL");

  for (const key of ["agentRegistry", "policyRegistry", "actionAttestation"]) {
    if (!isAddress(value?.addresses?.[key])) errors.push(`addresses.${key} must be an EVM address`);
    if (!isHash(value?.transactions?.[key])) errors.push(`transactions.${key} must be a tx hash`);
    if (!isBlock(value?.blocks?.[key])) errors.push(`blocks.${key} must be a block number string`);
  }

  if (!isHash(value?.transactions?.setActionAttestation)) errors.push("transactions.setActionAttestation must be a tx hash");
  if (!isBlock(value?.blocks?.setActionAttestation)) errors.push("blocks.setActionAttestation must be a block number string");
  if (value?.compatibility?.policyRegistry?.version !== "1.2.0") errors.push("PolicyRegistry version must be 1.2.0");
  if (value?.compatibility?.policyRegistry?.supportsPolicyEnumeration !== true) errors.push("PolicyRegistry enumeration must be true");

  return errors;
}

function finish() {
  const ok = checks.every((item) => item.ok);
  console.log(
    JSON.stringify(
      {
        ok,
        offline,
        manifestPath,
        summary: {
          total: checks.length,
          passed: checks.filter((item) => item.ok).length,
          failed: checks.filter((item) => !item.ok).length,
        },
        checks,
      },
      null,
      2,
    ),
  );

  if (!ok && !noFail) {
    process.exitCode = 1;
  }
}

function check(name, ok, detail = "") {
  return { name, ok, ...(ok ? {} : { detail }) };
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

function isAddress(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value);
}

function isHash(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value);
}

function isBlock(value) {
  return typeof value === "string" && /^\d+$/.test(value);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
