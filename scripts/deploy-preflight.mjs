import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPublicClient, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const mantleSepolia = {
  id: 5003,
  name: "Mantle Sepolia",
  nativeCurrency: { name: "MNT", symbol: "MNT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.sepolia.mantle.xyz"] },
  },
};

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const envFile = resolve(root, option("--env-file") ?? ".env");
const noFail = args.includes("--no-fail");
const minBalanceWei = BigInt(option("--min-balance-wei") ?? "1000000000000000");
const zeroPrivateKey = `0x${"0".repeat(64)}`;
const checks = [];

const fileEnv = existsSync(envFile) ? loadEnvFile(envFile) : undefined;
const env = { ...(fileEnv ?? {}), ...process.env };
const rpcUrl = env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0];
const privateKey = env.PRIVATE_KEY;

checks.push({
  name: "env-file-present",
  ok: existsSync(envFile),
  detail: existsSync(envFile) ? envFile : `Env file not found: ${envFile}`,
});

checks.push({
  name: "private-key-configured",
  ok: isPrivateKey(privateKey) && privateKey !== zeroPrivateKey,
  detail: privateKey === zeroPrivateKey
    ? "PRIVATE_KEY is the zero placeholder and must be replaced with a funded deployer key."
    : privateKey
      ? "PRIVATE_KEY is present but never printed."
      : "PRIVATE_KEY is missing.",
});

checks.push({
  name: "rpc-url-configured",
  ok: typeof rpcUrl === "string" && rpcUrl.length > 0,
  detail: rpcUrl,
});

let accountAddress;
if (isPrivateKey(privateKey) && privateKey !== zeroPrivateKey) {
  accountAddress = privateKeyToAccount(privateKey).address;
}

if (rpcUrl) {
  const publicClient = createPublicClient({ chain: mantleSepolia, transport: http(rpcUrl) });

  try {
    const chainId = await publicClient.getChainId();
    checks.push({
      name: "rpc-chain-id",
      ok: chainId === mantleSepolia.id,
      detail: `chainId=${chainId}, expected=${mantleSepolia.id}`,
    });
  } catch (error) {
    checks.push({
      name: "rpc-chain-id",
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  if (accountAddress) {
    try {
      const balance = await publicClient.getBalance({ address: accountAddress });
      checks.push({
        name: "deployer-balance",
        ok: balance >= minBalanceWei,
        detail: `${formatEther(balance)} MNT at ${accountAddress}; minimum=${formatEther(minBalanceWei)} MNT`,
      });
    } catch (error) {
      checks.push({
        name: "deployer-balance",
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    checks.push({
      name: "deployer-balance",
      ok: false,
      detail: "Skipped because PRIVATE_KEY is missing, invalid, or zero placeholder.",
    });
  }
}

const ok = checks.every((check) => check.ok);
const report = {
  ok,
  envFile,
  chain: "mantleSepolia",
  expectedChainId: mantleSepolia.id,
  deployer: accountAddress,
  checks,
  nextCommands: ok
    ? [
        "pnpm deploy:mantle-sepolia",
        "pnpm deployment:manifest:doctor",
        "pnpm live:smoke",
      ]
    : [
        "copy .env.example .env",
        "set PRIVATE_KEY to a funded Mantle Sepolia deployer key",
        "pnpm deploy:preflight",
      ],
};

console.log(JSON.stringify(report, null, 2));

if (!ok && !noFail) {
  process.exitCode = 1;
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
    if (key) entries[key] = value;
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

function isPrivateKey(value) {
  return typeof value === "string" && /^0x[a-fA-F0-9]{64}$/.test(value);
}
