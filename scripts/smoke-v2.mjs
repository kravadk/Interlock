// Throwaway on-chain smoke test for Interlock ActionAttestationV2 (Mantle Sepolia, chainId 5003).
// Registers an agent, creates a policy, signs an EIP-712 Action, and records it so the
// dashboard shows a real record with the new dispute-window status.
// Reads PRIVATE_KEY only from .env and never prints it.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// viem lives in apps/web/node_modules — resolve it from there.
// On Windows, dynamic import() of an absolute path requires a file:// URL.
const require = createRequire(resolve(root, "apps/web/package.json"));
const importFrom = (id) => import(pathToFileURL(require.resolve(id)).href);
const { createPublicClient, createWalletClient, decodeEventLog, http, keccak256, parseEther } =
  await importFrom("viem");
const { privateKeyToAccount } = await importFrom("viem/accounts");

// --- load PRIVATE_KEY from .env (only) ---
function loadEnv(file) {
  const out = {};
  const txt = readFileSync(file, "utf8");
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const env = loadEnv(resolve(root, ".env"));
const privateKey = env.PRIVATE_KEY;
if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  throw new Error("PRIVATE_KEY missing or malformed in .env (expected 0x + 64 hex chars).");
}

// --- chain / contracts ---
const CHAIN_ID = 5003;
const RPC_URL = "https://rpc.sepolia.mantle.xyz";
const EXPLORER = "https://sepolia.mantlescan.xyz/tx/";

const AGENT_REGISTRY = "0xa8d6f3478b683ee674ff5a9167e6838c589162b4";
const POLICY_REGISTRY = "0x16a02f6ed0d3db730fd60d5c51ec99e7825e41e0";
const ACTION_ATTESTATION_V2 = "0x6488c92049dcbb88a442d1bbf6e94bc137faf4a3";

const mantleSepolia = {
  id: CHAIN_ID,
  name: "Mantle Sepolia",
  nativeCurrency: { name: "Mantle", symbol: "MNT", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
};

// --- ABIs ---
const artifactsDir = resolve(root, "packages/contracts/artifacts");
const loadAbi = (name) => JSON.parse(readFileSync(resolve(artifactsDir, `${name}.json`), "utf8")).abi;
const agentRegistryAbi = loadAbi("AgentRegistry");
const policyRegistryAbi = loadAbi("PolicyRegistry");
const actionAttestationAbi = loadAbi("ActionAttestationV2");

// --- clients ---
const account = privateKeyToAccount(privateKey);
const publicClient = createPublicClient({ chain: mantleSepolia, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain: mantleSepolia, transport: http(RPC_URL) });

function findEvent(receipt, abi, address, eventName) {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== address.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({ abi, data: log.data, topics: log.topics });
      if (decoded.eventName === eventName) return decoded.args;
    } catch {
      // not this event
    }
  }
  throw new Error(`Event ${eventName} not found in receipt for ${address}`);
}

async function main() {
  console.log(`Attestor/deployer: ${account.address}`);

  // ---------------------------------------------------------------
  // Step 1: registerAgent
  // ---------------------------------------------------------------
  console.log("[1] registerAgent...");
  const registerHash = await walletClient.writeContract({
    account,
    chain: mantleSepolia,
    address: AGENT_REGISTRY,
    abi: agentRegistryAbi,
    functionName: "registerAgent",
    args: ["ipfs://interlock-v2-smoke"],
  });
  const registerReceipt = await publicClient.waitForTransactionReceipt({ hash: registerHash });
  const { agentId } = findEvent(registerReceipt, agentRegistryAbi, AGENT_REGISTRY, "AgentRegistered");
  console.log(`    agentId = ${agentId}`);

  // ---------------------------------------------------------------
  // Step 2: createPolicy
  // ---------------------------------------------------------------
  console.log("[2] createPolicy...");
  const createHash = await walletClient.writeContract({
    account,
    chain: mantleSepolia,
    address: POLICY_REGISTRY,
    abi: policyRegistryAbi,
    functionName: "createPolicy",
    args: [agentId, parseEther("0.02"), 100, [AGENT_REGISTRY], ["0x2de5aaf7"]],
  });
  const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createHash });
  const { policyId } = findEvent(createReceipt, policyRegistryAbi, POLICY_REGISTRY, "PolicyCreated");
  console.log(`    policyId = ${policyId}`);

  // ---------------------------------------------------------------
  // Step 3: derive action params
  // ---------------------------------------------------------------
  const calldata = "0x2de5aaf70000000000000000000000000000000000000000000000000000000000000001";
  const calldataHash = keccak256(calldata);
  const selector = "0x2de5aaf7";
  const simulationHash = calldataHash;
  const target = AGENT_REGISTRY;
  const value = 0n;
  const decision = 0;
  const reasonCode = 0;

  // ---------------------------------------------------------------
  // Step 4: read nonce
  // ---------------------------------------------------------------
  const nonce = await publicClient.readContract({
    address: ACTION_ATTESTATION_V2,
    abi: actionAttestationAbi,
    functionName: "nonces",
    args: [agentId],
  });
  console.log(`[4] nonce = ${nonce}`);

  // ---------------------------------------------------------------
  // Step 5: EIP-712 sign
  // ---------------------------------------------------------------
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const domain = {
    name: "AgentOps",
    version: "2",
    chainId: CHAIN_ID,
    verifyingContract: ACTION_ATTESTATION_V2,
  };
  const types = {
    Action: [
      { name: "agentId", type: "uint256" },
      { name: "policyId", type: "uint256" },
      { name: "target", type: "address" },
      { name: "value", type: "uint256" },
      { name: "calldataHash", type: "bytes32" },
      { name: "selector", type: "bytes4" },
      { name: "simulationHash", type: "bytes32" },
      { name: "decision", type: "uint8" },
      { name: "reasonCode", type: "uint8" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };
  const message = {
    agentId,
    policyId,
    target,
    value,
    calldataHash,
    selector,
    simulationHash,
    decision,
    reasonCode,
    nonce,
    deadline,
  };
  const signature = await walletClient.signTypedData({
    account,
    domain,
    types,
    primaryType: "Action",
    message,
  });
  console.log("[5] signed EIP-712 Action.");

  // ---------------------------------------------------------------
  // Step 6: recordAction
  // ---------------------------------------------------------------
  console.log("[6] recordAction...");
  const recordHash = await walletClient.writeContract({
    account,
    chain: mantleSepolia,
    address: ACTION_ATTESTATION_V2,
    abi: actionAttestationAbi,
    functionName: "recordAction",
    args: [
      agentId,
      policyId,
      target,
      value,
      calldataHash,
      selector,
      simulationHash,
      decision,
      reasonCode,
      deadline,
      signature,
    ],
  });
  const recordReceipt = await publicClient.waitForTransactionReceipt({ hash: recordHash });
  const checked = findEvent(recordReceipt, actionAttestationAbi, ACTION_ATTESTATION_V2, "ActionChecked");

  const statusNames = { 0: "ACTIVE", 1: "CHALLENGED", 2: "FINALIZED" };
  const statusNum = Number(checked.status);

  console.log("\n================ SMOKE TEST RESULTS ================");
  console.log(`agentId        = ${agentId}`);
  console.log(`policyId       = ${policyId}`);
  console.log(`actionCheckId  = ${checked.actionCheckId}`);
  console.log(`status         = ${statusNum} (${statusNames[statusNum] ?? "UNKNOWN"})`);
  console.log(`finalizableAt  = ${checked.finalizableAt}`);
  console.log(`--- tx hashes ---`);
  console.log(`registerAgent  : ${EXPLORER}${registerHash}`);
  console.log(`createPolicy   : ${EXPLORER}${createHash}`);
  console.log(`recordAction   : ${EXPLORER}${recordHash}`);
  console.log("====================================================");
}

main().catch((err) => {
  console.error("SMOKE TEST FAILED:", err?.shortMessage ?? err?.message ?? err);
  if (err?.metaMessages) console.error(err.metaMessages.join("\n"));
  process.exitCode = 1;
});
