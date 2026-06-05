// On-chain finalize keeper.
//
// ActionAttestationV3 records are written ACTIVE with a dispute window. After the
// window closes (and if they were not CHALLENGED) anyone may call `finalize(id)` to
// stamp them FINALIZED. Nothing on-chain does this automatically — this keeper closes
// the loop: it enumerates every ActionChecked record, finds the ones whose window has
// elapsed while still ACTIVE, and finalizes them in one pass.
//
// Usage:
//   node scripts/keeper-finalize.mjs --check-only     # report candidates, no tx (no key needed)
//   node scripts/keeper-finalize.mjs                  # finalize candidates (needs PRIVATE_KEY)
//   node scripts/keeper-finalize.mjs --max 5          # cap how many to finalize this run
//   node scripts/keeper-finalize.mjs --no-fail        # exit 0 even when finalize tx errors
//
// Pure selection logic is exported (`selectFinalizable`) so it can be unit-tested
// without an RPC or a funded key.

import { createPublicClient, createWalletClient, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ACTIVE = 0;

/**
 * Given action-check records `{ id, status, finalizableAt }` and the current chain
 * time (seconds), return the ids that are ready to finalize: still ACTIVE and past
 * their dispute window. CHALLENGED / already-FINALIZED records are skipped.
 *
 * @param {Array<{ id: bigint, status: number, finalizableAt: bigint }>} checks
 * @param {bigint} nowSeconds
 * @returns {bigint[]}
 */
export function selectFinalizable(checks, nowSeconds) {
  return checks
    .filter((c) => c.status === ACTIVE && nowSeconds >= c.finalizableAt)
    .map((c) => c.id);
}

// Only run the on-chain keeper when invoked directly (not when imported by the test).
if (process.argv[1]?.endsWith("keeper-finalize.mjs")) {
  await main();
}

async function main() {
  const {
    actionAttestationAbi,
    deployedAddresses,
    mantleSepolia,
    AttestationStatusName,
  } = await import("../packages/shared/dist/index.js");

  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check-only") || args.includes("--dry-run");
  const noFail = args.includes("--no-fail");
  const max = numberOption(args, "--max");
  const zeroAddress = "0x0000000000000000000000000000000000000000";

  const rpcUrl = process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0];
  const actionAttestation = process.env.ACTION_ATTESTATION ?? deployedAddresses.mantleSepolia.actionAttestation;
  const fromBlock = BigInt(
    process.env.FROM_BLOCK ?? process.env.NEXT_PUBLIC_ACTION_ATTESTATION_FROM_BLOCK ?? "0",
  );
  // Mantle Sepolia's public RPC caps eth_getLogs at 10000 blocks per request, so the
  // keeper paginates in <=9000-block windows (override with KEEPER_BLOCK_CHUNK_SIZE on a
  // provider with a higher limit).
  const chunkSize = BigInt(process.env.KEEPER_BLOCK_CHUNK_SIZE ?? "9000");

  if (!isAddress(actionAttestation) || actionAttestation === zeroAddress) {
    fail("Missing ACTION_ATTESTATION address.", noFail);
    return;
  }

  const publicClient = createPublicClient({ chain: mantleSepolia, transport: http(rpcUrl) });

  // Enumerate every ActionChecked id from the deploy block, chunked to stay within
  // public-RPC log-range limits (same chunking the indexer uses).
  const latestBlock = await publicClient.getBlockNumber();
  const ids = new Set();
  for (let start = fromBlock; start <= latestBlock; start += chunkSize) {
    const end = start + chunkSize - 1n > latestBlock ? latestBlock : start + chunkSize - 1n;
    const logs = await publicClient.getContractEvents({
      address: actionAttestation,
      abi: actionAttestationAbi,
      eventName: "ActionChecked",
      fromBlock: start,
      toBlock: end,
    });
    for (const log of logs) {
      if (log.args?.actionCheckId !== undefined) ids.add(log.args.actionCheckId);
    }
  }

  // Read current status + window for each record.
  const checks = [];
  for (const id of ids) {
    const check = await publicClient.readContract({
      address: actionAttestation,
      abi: actionAttestationAbi,
      functionName: "getActionCheck",
      args: [id],
    });
    checks.push({ id, status: Number(check.status), finalizableAt: BigInt(check.finalizableAt) });
  }

  const now = await chainNow(publicClient);
  let candidates = selectFinalizable(checks, now);
  if (max !== undefined) candidates = candidates.slice(0, max);

  const report = {
    contract: actionAttestation,
    totalRecords: checks.length,
    finalizable: candidates.map(String),
    now: Number(now),
  };

  if (checkOnly) {
    console.log(JSON.stringify({ ok: true, mode: "check-only", ...report }, null, 2));
    return;
  }

  if (candidates.length === 0) {
    console.log(JSON.stringify({ ok: true, finalized: [], note: "Nothing to finalize.", ...report }, null, 2));
    return;
  }

  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey || /^0x0+$/.test(privateKey)) {
    fail("Set PRIVATE_KEY to finalize (or pass --check-only).", noFail);
    return;
  }

  const account = privateKeyToAccount(privateKey);
  const walletClient = createWalletClient({ account, chain: mantleSepolia, transport: http(rpcUrl) });

  const finalized = [];
  const failures = [];
  for (const id of candidates) {
    try {
      const hash = await walletClient.writeContract({
        address: actionAttestation,
        abi: actionAttestationAbi,
        functionName: "finalize",
        args: [id],
        chain: mantleSepolia,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      finalized.push({ id: id.toString(), hash, status: receipt.status });
    } catch (error) {
      failures.push({ id: id.toString(), error: error instanceof Error ? error.message : String(error) });
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: failures.length === 0,
        attestor: account.address,
        finalized,
        failures,
        statusLegend: AttestationStatusName,
        ...report,
      },
      null,
      2,
    ),
  );

  if (failures.length > 0 && !noFail) process.exitCode = 1;
}

async function chainNow(publicClient) {
  const block = await publicClient.getBlock();
  return BigInt(block.timestamp);
}

function numberOption(args, flag) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  const value = Number(args[idx + 1]);
  return Number.isFinite(value) ? value : undefined;
}

function fail(message, noFail) {
  console.error(message);
  if (!noFail) process.exitCode = 1;
}
