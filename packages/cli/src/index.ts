#!/usr/bin/env node
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseEther, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { actionableError, InterlockFirewall, agentRegistryGetAgentCalldata, agentRegistryGetAgentSelector, describePolicyPreset, runInterlockBenchmark } from "@interlock/firewall-sdk";
import {
  approvalPolicy,
  buildPolicyVersionSnapshot,
  conservativeDeFiPolicy,
  diffPolicyVersionSnapshots,
  generatePolicyPackFromAbi,
  lintPolicyPack,
  listPolicyPackRegistryEntries,
  listMantleEcosystemPolicyPacks,
  paymentPolicy,
  parsePolicyPack,
  policyPackFromPreset,
  policyPackToCreatePolicyInput,
  rwaReadOnlyPolicy,
  validatePolicyPackRegistry,
  type AgentAction,
  type GatewayMode,
  type PolicyVersionSnapshot,
} from "@interlock/firewall-sdk";
import { mantleSepolia } from "@interlock/shared";
import {
  addressFlag,
  assertCliSlippageBps,
  bigintFlag,
  CliInputError,
  contractsFromFlags,
  etherFlag,
  flagBool,
  flagString,
  flagStrings,
  hexFlag,
  numberFlag,
  optionalEtherFlag,
  parseCli,
  privateKeyFromFlags,
  rpcUrlFromFlags,
  requiredString,
} from "./args.js";
import { buildDoctorReport } from "./doctor.js";
import { formatAgent, formatDecision, formatHistory, formatPolicy, formatPolicyPermissionCheck, json } from "./format.js";

async function main() {
  const parsed = parseCli(process.argv.slice(2));

  if (parsed.command === "help" || flagBool(parsed.flags, "help")) {
    printHelp();
    return;
  }

  if (parsed.command === "preset") {
    console.log(json(describePolicyPreset(buildPreset(parsed.flags))));
    return;
  }

  if (parsed.command === "policy-pack") {
    if (flagBool(parsed.flags, "list")) {
      console.log(json({ packs: listMantleEcosystemPolicyPacks() }));
      return;
    }
    const pack = policyPackFromPreset(buildPreset(parsed.flags), {
      name: flagString(parsed.flags, "pack-name"),
      description: flagString(parsed.flags, "description"),
      chainId: mantleSepolia.id,
    });
    console.log(json(pack));
    return;
  }

  if (parsed.command === "policy-pack-list") {
    console.log(json({ packs: listMantleEcosystemPolicyPacks(), registry: listPolicyPackRegistryEntries() }));
    return;
  }

  if (parsed.command === "policy-pack-registry") {
    const validation = validatePolicyPackRegistry();
    console.log(json(validation));
    if (!validation.ok && !flagBool(parsed.flags, "no-fail")) {
      process.exitCode = 1;
    }
    return;
  }

  if (parsed.command === "policy-pack-validate") {
    const pack = readPolicyPackFromFlags(parsed.flags);
    console.log(json({ ok: true, policyPack: pack }));
    return;
  }

  if (parsed.command === "policy-lint") {
    const pack = readPolicyPackFromFlags(parsed.flags);
    const result = lintPolicyPack(pack);
    console.log(json(result));
    if (!result.ok && !flagBool(parsed.flags, "no-fail")) {
      process.exitCode = 1;
    }
    return;
  }

  if (parsed.command === "policy-pack-from-abi") {
    const abiPath = requiredString(parsed.flags, "abi");
    const address = addressFlag(parsed.flags, "address");
    const pack = generatePolicyPackFromAbi({
      address,
      abi: readFileSync(abiPath, "utf8"),
      name: flagString(parsed.flags, "name"),
      description: flagString(parsed.flags, "description"),
      chainId: numberFlag(parsed.flags, "chain-id", mantleSepolia.id),
      maxNativeValue: (optionalEtherFlag(parsed.flags, "max-native") ?? 0n).toString(),
      maxSlippageBps: numberFlag(parsed.flags, "max-slippage-bps", 0),
      includeViewFunctions: flagBool(parsed.flags, "include-view"),
    });
    const out = flagString(parsed.flags, "out");
    if (out) {
      writeFileSync(out, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
      console.log(json({ ok: true, output: out, selectorCount: pack.selectors.length, policyPack: pack }));
    } else {
      console.log(json(pack));
    }
    return;
  }

  if (parsed.command === "init") {
    console.log(json(writeInitEnv(parsed.flags)));
    return;
  }

  if (parsed.command === "init-agent-app") {
    console.log(json(writeAgentStarter(parsed.flags)));
    return;
  }

  if (parsed.command === "doctor") {
    const privateKey = privateKeyFromFlags(parsed.flags);
    const report = await buildDoctorReport({
      rpcUrl: rpcUrlFromFlags(parsed.flags),
      contracts: contractsFromFlags(parsed.flags),
      privateKeyConfigured: Boolean(privateKey),
      indexerUrl: flagString(parsed.flags, "indexer-url") ?? process.env.INDEXER_URL ?? process.env.NEXT_PUBLIC_INDEXER_URL,
    });
    console.log(json(report));
    if (!report.ok && !flagBool(parsed.flags, "no-fail")) {
      process.exitCode = 1;
    }
    return;
  }

  if (parsed.command === "whoami") {
    console.log(json(buildWhoami(parsed.flags)));
    return;
  }

  const firewall = new InterlockFirewall({
    chain: mantleSepolia,
    rpcUrl: rpcUrlFromFlags(parsed.flags),
    privateKey: privateKeyFromFlags(parsed.flags),
    contracts: contractsFromFlags(parsed.flags),
  });

  if (parsed.command === "status") {
    console.log(json(await buildStatus(parsed.flags, firewall)));
    return;
  }

  if (parsed.command === "quickstart") {
    console.log(json(await runQuickstart(parsed.flags, firewall)));
    return;
  }

  if (parsed.command === "benchmark-run") {
    const report = await runInterlockBenchmark({
      firewall,
      agentId: bigintFlag(parsed.flags, "agent-id"),
      policyId: bigintFlag(parsed.flags, "policy-id"),
      contracts: contractsFromFlags(parsed.flags),
      recordDecisions: flagBool(parsed.flags, "record"),
    });
    console.log(json(report));
    return;
  }

  if (parsed.command === "gateway-run") {
    const mode = gatewayModeFromFlags(parsed.flags);
    const recordDecision = gatewayRecordDecisionFromFlags(parsed.flags);
    const recordTiming = gatewayRecordTimingFromFlags(parsed.flags);
    if (gatewayModeNeedsPrivateKey(mode, recordDecision) && !privateKeyFromFlags(parsed.flags)) {
      throw new CliInputError(`${mode} requires --private-key or PRIVATE_KEY. Use --mode dry-run for read-only gateway checks.`);
    }
    const action = actionFromFlags(parsed.flags);
    const result = await firewall.runGatewayAction(action, {
      mode,
      recordDecision,
      recordTiming,
      throwOnBlock: flagBool(parsed.flags, "throw-on-block"),
    });
    console.log(json(result));
    return;
  }

  if (parsed.command === "analytics") {
    console.log(json(await fetchAnalyticsFromIndexer(parsed.flags)));
    return;
  }

  if (parsed.command === "webhook-test") {
    console.log(json(await sendWebhookTest(parsed.flags)));
    return;
  }

  if (parsed.command === "policy-version-snapshot") {
    const snapshot = await buildPolicySnapshot({
      firewall,
      policyId: bigintFlag(parsed.flags, "policy-id"),
      source: flagString(parsed.flags, "source", "cli")!,
    });
    const output = flagString(parsed.flags, "out");
    if (output) {
      writeFileSync(output, `${JSON.stringify(snapshot, null, 2)}\n`);
      console.log(json({ ok: true, output, snapshot }));
    } else {
      console.log(json(snapshot));
    }
    return;
  }

  if (parsed.command === "policy-version-diff") {
    console.log(json(diffPolicySnapshots(readPolicySnapshot(requiredString(parsed.flags, "from")), readPolicySnapshot(requiredString(parsed.flags, "to")))));
    return;
  }

  if (parsed.command === "policy-version-verify") {
    const expected = readPolicySnapshot(requiredString(parsed.flags, "file"));
    const actual = await buildPolicySnapshot({
      firewall,
      policyId: BigInt(expected.policyId),
      source: "verify",
    });
    const diff = diffPolicySnapshots(expected, actual);
    console.log(json({ ok: diff.ok, expected, actual, diff }));
    if (!diff.ok && !flagBool(parsed.flags, "no-fail")) {
      process.exitCode = 1;
    }
    return;
  }

  if (parsed.command === "preflight") {
    const action = actionFromFlags(parsed.flags);
    const decision = await firewall.checkAction(action);
    console.log(json(formatDecision(decision, action)));
    return;
  }

  if (parsed.command === "record") {
    const action = actionFromFlags(parsed.flags);
    const decision = await firewall.checkAction(action);
    const attestation = await firewall.recordDecisionAndWait(decision);
    console.log(json({ ...formatDecision(decision, action), attestation }));
    return;
  }

  if (parsed.command === "register-agent") {
    const result = await firewall.registerAgentAndWait({
      metadataURI: requiredString(parsed.flags, "metadata-uri"),
    });
    console.log(json(result));
    return;
  }

  if (parsed.command === "policy-create") {
    const result = await firewall.createPolicyAndWait({
      agentId: bigintFlag(parsed.flags, "agent-id"),
      maxNativeValue: requiredEther(parsed.flags, "max-native"),
      maxSlippageBps: requiredNumber(parsed.flags, "max-slippage-bps"),
      targets: targetsFromFlags(parsed.flags),
      selectors: selectorsFromFlags(parsed.flags),
    });
    console.log(json(result));
    return;
  }

  if (parsed.command === "policy-create-preset") {
    const result = await firewall.createPolicyFromPresetAndWait({
      agentId: bigintFlag(parsed.flags, "agent-id"),
      preset: buildPreset(parsed.flags),
    });
    console.log(json(result));
    return;
  }

  if (parsed.command === "policy-import") {
    const pack = readPolicyPackFromFlags(parsed.flags);
    const input = policyPackToCreatePolicyInput(bigintFlag(parsed.flags, "agent-id"), pack);
    if (flagBool(parsed.flags, "dry-run")) {
      console.log(json({ policyPack: pack, createPolicyInput: input }));
      return;
    }
    const result = await firewall.createPolicyAndWait(input);
    console.log(json({ ...result, policyPack: { name: pack.name, version: pack.version } }));
    return;
  }

  if (parsed.command === "policy-audit") {
    const audit = await firewall.auditPolicyPack({
      policyId: bigintFlag(parsed.flags, "policy-id"),
      expectedAgentId: optionalBigint(parsed.flags, "agent-id"),
      expectedActive: boolFlag(parsed.flags, "active", true),
      allowLegacyPartialAudit: flagBool(parsed.flags, "legacy-partial"),
      pack: readPolicyPackFromFlags(parsed.flags),
    });
    console.log(json(audit));
    if (!audit.ok && !flagBool(parsed.flags, "no-fail")) {
      process.exitCode = 1;
    }
    return;
  }

  if (parsed.command === "policy-apply") {
    const result = await firewall.applyPolicyPack({
      policyId: bigintFlag(parsed.flags, "policy-id"),
      expectedAgentId: optionalBigint(parsed.flags, "agent-id"),
      expectedActive: boolFlag(parsed.flags, "active", true),
      allowLegacyPartialAudit: flagBool(parsed.flags, "legacy-partial"),
      dryRun: flagBool(parsed.flags, "dry-run"),
      waitForReceipts: !flagBool(parsed.flags, "no-wait"),
      prune: flagBool(parsed.flags, "prune"),
      pack: readPolicyPackFromFlags(parsed.flags),
    });
    console.log(json(result));
    if (!result.ok && !flagBool(parsed.flags, "no-fail")) {
      process.exitCode = 1;
    }
    return;
  }

  if (parsed.command === "history") {
    const history = await firewall.getActionHistory({
      agentId: optionalBigint(parsed.flags, "agent-id"),
      policyId: optionalBigint(parsed.flags, "policy-id"),
      fromBlock: optionalBigint(parsed.flags, "from-block") ?? envFromBlock() ?? 0n,
      toBlock: optionalBigint(parsed.flags, "to-block") ?? "latest",
    });
    console.log(json(formatHistory(history)));
    return;
  }

  if (parsed.command === "agent-get") {
    const agentId = bigintFlag(parsed.flags, "agent-id");
    const stats = await firewall.getAgentStats(agentId);
    console.log(json(formatAgent(agentId, stats)));
    return;
  }

  if (parsed.command === "policy-get") {
    const policyId = bigintFlag(parsed.flags, "policy-id");
    const policy = await firewall.getPolicy(policyId);
    console.log(json(formatPolicy(policyId, policy)));
    return;
  }

  if (parsed.command === "policy-check") {
    const policyId = bigintFlag(parsed.flags, "policy-id");
    const target = optionalAddress(parsed.flags, "target");
    const selector = optionalSelector(parsed.flags, "selector");
    if (!target && !selector) {
      throw new CliInputError("Provide --target, --selector, or both.");
    }
    const result = await firewall.checkPolicyPermissions({ policyId, target, selector });
    console.log(json(formatPolicyPermissionCheck(result)));
    return;
  }

  if (parsed.command === "policy-update") {
    const transactionHash = await firewall.updatePolicy({
      policyId: bigintFlag(parsed.flags, "policy-id"),
      maxNativeValue: requiredEther(parsed.flags, "max-native"),
      maxSlippageBps: requiredNumber(parsed.flags, "max-slippage-bps"),
      active: boolFlag(parsed.flags, "active", true),
    });
    console.log(json({ transactionHash }));
    return;
  }

  if (parsed.command === "target-allow") {
    const transactionHash = await firewall.setTargetAllowed({
      policyId: bigintFlag(parsed.flags, "policy-id"),
      target: addressFlag(parsed.flags, "target"),
      allowed: allowFlag(parsed.flags),
    });
    console.log(json({ transactionHash }));
    return;
  }

  if (parsed.command === "selector-allow") {
    const transactionHash = await firewall.setSelectorAllowed({
      policyId: bigintFlag(parsed.flags, "policy-id"),
      selector: selectorFlag(parsed.flags, "selector"),
      allowed: allowFlag(parsed.flags),
    });
    console.log(json({ transactionHash }));
    return;
  }

  throw new CliInputError(`Unknown command: ${parsed.command}`);
}

function actionFromFlags(flags: Record<string, string | boolean | string[]>): AgentAction {
  const expectedSlippageBps = numberFlag(flags, "slippage-bps");
  assertCliSlippageBps(expectedSlippageBps, "slippage-bps");

  return {
    agentId: bigintFlag(flags, "agent-id"),
    policyId: bigintFlag(flags, "policy-id"),
    tx: {
      to: addressFlag(flags, "to"),
      value: etherFlag(flags, "value"),
      data: hexFlag(flags, "data"),
    },
    metadata: {
      intent: flagString(flags, "intent"),
      route: flagString(flags, "route"),
      expectedSlippageBps,
    },
  };
}

function buildPreset(flags: Record<string, string | boolean | string[]>) {
  const name = requiredString(flags, "name");
  const targets = targetsFromFlags(flags);

  const input = {
    targets,
    maxNativeValue: optionalEtherFlag(flags, "max-native"),
    maxSlippageBps: numberFlag(flags, "max-slippage-bps"),
  };
  assertCliSlippageBps(input.maxSlippageBps, "max-slippage-bps");

  if (name === "conservative-defi") return conservativeDeFiPolicy(input);
  if (name === "payments") return paymentPolicy(input);
  if (name === "rwa-read-only") return rwaReadOnlyPolicy(input);
  if (name === "approvals") return approvalPolicy(input);

  throw new CliInputError("Unknown preset. Use conservative-defi, payments, rwa-read-only, or approvals.");
}

function targetsFromFlags(flags: Record<string, string | boolean | string[]>): `0x${string}`[] {
  const targets = flagStrings(flags, "target").map((target, index) => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(target)) {
      throw new CliInputError(`--target #${index + 1} must be an EVM address.`);
    }
    return target as `0x${string}`;
  });

  if (targets.length === 0) {
    throw new CliInputError("At least one --target is required.");
  }

  return targets;
}

function selectorsFromFlags(flags: Record<string, string | boolean | string[]>): `0x${string}`[] {
  const selectors = flagStrings(flags, "selector").map((selector, index) => {
    if (!/^0x[a-fA-F0-9]{8}$/.test(selector)) {
      throw new CliInputError(`--selector #${index + 1} must be a bytes4 selector like 0xd0e30db0.`);
    }
    return selector as `0x${string}`;
  });

  if (selectors.length === 0) {
    throw new CliInputError("At least one --selector is required.");
  }

  return selectors;
}

function optionalBigint(flags: Record<string, string | boolean | string[]>, key: string): bigint | undefined {
  const value = flagString(flags, key);
  if (!value) return undefined;
  return bigintFlag(flags, key);
}

function envFromBlock(): bigint | undefined {
  const value = process.env.FROM_BLOCK;
  if (!value) return undefined;
  if (!/^\d+$/.test(value)) {
    throw new CliInputError("FROM_BLOCK must be a non-negative integer.");
  }
  return BigInt(value);
}

function requiredNumber(flags: Record<string, string | boolean | string[]>, key: string): number {
  const value = numberFlag(flags, key);
  if (value === undefined) {
    throw new CliInputError(`Missing required --${key}.`);
  }
  if (!Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new CliInputError(`--${key} must be an integer between 0 and 10000.`);
  }
  return value;
}

function requiredEther(flags: Record<string, string | boolean | string[]>, key: string): bigint {
  if (!flagString(flags, key)) {
    throw new CliInputError(`Missing required --${key}.`);
  }
  return etherFlag(flags, key);
}

function boolFlag(flags: Record<string, string | boolean | string[]>, key: string, defaultValue: boolean): boolean {
  const value = flagString(flags, key);
  if (value === undefined) return flagBool(flags, key) || defaultValue;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new CliInputError(`--${key} must be true or false.`);
}

function allowFlag(flags: Record<string, string | boolean | string[]>): boolean {
  if (flagBool(flags, "deny")) return false;
  return boolFlag(flags, "allowed", true);
}

function selectorFlag(flags: Record<string, string | boolean | string[]>, key: string): `0x${string}` {
  const selectorValue = hexFlag(flags, key);
  if (!/^0x[a-fA-F0-9]{8}$/.test(selectorValue)) {
    throw new CliInputError(`--${key} must be a bytes4 selector like 0xd0e30db0.`);
  }
  return selectorValue;
}

function optionalAddress(flags: Record<string, string | boolean | string[]>, key: string): `0x${string}` | undefined {
  if (!flagString(flags, key)) return undefined;
  return addressFlag(flags, key);
}

function optionalSelector(flags: Record<string, string | boolean | string[]>, key: string): `0x${string}` | undefined {
  if (!flagString(flags, key)) return undefined;
  return selectorFlag(flags, key);
}

function gatewayModeFromFlags(flags: Record<string, string | boolean | string[]>): GatewayMode {
  const mode = flagString(flags, "mode", "dry-run")!;
  if (mode === "dry-run" || mode === "record-only" || mode === "execute-if-allowed" || mode === "block-and-alert") {
    return mode;
  }
  throw new CliInputError("--mode must be dry-run, record-only, execute-if-allowed, or block-and-alert.");
}

function gatewayRecordDecisionFromFlags(flags: Record<string, string | boolean | string[]>): boolean | undefined {
  if (flagBool(flags, "record") || flagBool(flags, "record-decision")) return true;
  if (flagBool(flags, "no-record")) return false;
  return undefined;
}

function gatewayRecordTimingFromFlags(flags: Record<string, string | boolean | string[]>): "before-send" | "after-send" | undefined {
  const value = flagString(flags, "record-timing");
  if (value === undefined) return undefined;
  if (value === "before-send" || value === "after-send") return value;
  throw new CliInputError("--record-timing must be before-send or after-send.");
}

function gatewayModeNeedsPrivateKey(mode: GatewayMode, recordDecision: boolean | undefined) {
  return mode === "record-only" || mode === "execute-if-allowed" || (mode === "block-and-alert" && recordDecision === true);
}

function readPolicyPackFromFlags(flags: Record<string, string | boolean | string[]>) {
  const file = requiredString(flags, "file");
  return parsePolicyPack(readFileSync(file, "utf8"));
}

async function buildPolicySnapshot(input: { firewall: InterlockFirewall; policyId: bigint; source: string }): Promise<PolicyVersionSnapshot> {
  const [policy, targets, selectors] = await Promise.all([
    input.firewall.getPolicy(input.policyId),
    input.firewall.getAllowedTargets(input.policyId),
    input.firewall.getAllowedSelectors(input.policyId),
  ]);
  return buildPolicyVersionSnapshot({
    policyId: input.policyId,
    policy,
    targets,
    selectors,
    source: input.source,
    chainId: mantleSepolia.id,
  });
}

function readPolicySnapshot(file: string): PolicyVersionSnapshot {
  return JSON.parse(readFileSync(file, "utf8")) as PolicyVersionSnapshot;
}

const diffPolicySnapshots = diffPolicyVersionSnapshots;

async function fetchAnalyticsFromIndexer(flags: Record<string, string | boolean | string[]>) {
  const baseUrl = indexerUrlFromFlags(flags);
  const agentId = flagString(flags, "agent-id");
  const policyId = flagString(flags, "policy-id");
  const path = agentId ? `/analytics/agents/${agentId}` : policyId ? `/analytics/policies/${policyId}` : "/analytics";
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) {
    throw new Error(`Indexer analytics request failed: ${response.status}`);
  }
  return response.json();
}

async function sendWebhookTest(flags: Record<string, string | boolean | string[]>) {
  const url = flagString(flags, "url") ?? process.env.WEBHOOK_URL;
  if (!url) throw new CliInputError("webhook-test requires --url or WEBHOOK_URL.");
  const payload = flagString(flags, "payload");
  const body = payload ? JSON.parse(payload) : await latestWebhookPayloadFromIndexer(flags);
  const event = flagString(flags, "event", body.decision === "ALLOW" ? "action.allowed" : "action.blocked")!;
  const serialized = JSON.stringify(body);
  const secret = flagString(flags, "secret") ?? process.env.WEBHOOK_SECRET;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-interlock-event": event,
      "x-interlock-delivery": `cli-${Date.now()}`,
      ...(secret ? { "x-interlock-signature": `sha256=${createHmac("sha256", secret).update(serialized).digest("hex")}` } : {}),
    },
    body: serialized,
  });
  return { ok: response.ok, status: response.status, event };
}

function indexerUrlFromFlags(flags: Record<string, string | boolean | string[]>) {
  const url = flagString(flags, "indexer-url") ?? process.env.INDEXER_URL ?? process.env.NEXT_PUBLIC_INDEXER_URL;
  if (!url) {
    throw new CliInputError("Indexer URL is required. Set INDEXER_URL or pass --indexer-url.");
  }
  if (["disabled", "none", "off"].includes(url.toLowerCase())) {
    throw new CliInputError("Indexer URL is disabled. Set INDEXER_URL or pass --indexer-url.");
  }
  return url.replace(/\/$/, "");
}

async function latestWebhookPayloadFromIndexer(flags: Record<string, string | boolean | string[]>) {
  const baseUrl = indexerUrlFromFlags(flags);
  const response = await fetch(`${baseUrl}/actions`);
  if (!response.ok) {
    throw new Error(`Indexer actions request failed: ${response.status}`);
  }
  const body = (await response.json()) as { actions?: Array<Record<string, string>> };
  const action = body.actions?.[0];
  if (!action) {
    throw new CliInputError("webhook-test requires --payload when the configured indexer has no real ActionChecked records.");
  }
  return {
    event: action.decision === "ALLOW" ? "action.allowed" : "action.blocked",
    agentId: action.agentId,
    policyId: action.policyId,
    decision: action.decision,
    reasonCode: action.reasonCode,
    target: action.target,
    selector: action.selector,
    value: action.value,
    transactionHash: action.transactionHash,
    blockNumber: action.blockNumber,
  };
}

function writeInitEnv(flags: Record<string, string | boolean | string[]>) {
  const out = flagString(flags, "out", ".env")!;
  if (existsSync(out) && !flagBool(flags, "force")) {
    throw new CliInputError(`${out} already exists. Re-run with --force or choose --out .env.interlock.local.`);
  }

  const contracts = contractsFromFlags(flags);
  const fromBlock = process.env.FROM_BLOCK ?? process.env.ACTION_ATTESTATION_FROM_BLOCK ?? "39258697";
  const content = [
    "# Interlock Control Plane - Mantle Sepolia Dev Alpha",
    `MANTLE_RPC_URL=${rpcUrlFromFlags(flags)}`,
    "PRIVATE_KEY=",
    `AGENT_REGISTRY=${contracts.agentRegistry}`,
    `POLICY_REGISTRY=${contracts.policyRegistry}`,
    `ACTION_ATTESTATION=${contracts.actionAttestation}`,
    `FROM_BLOCK=${fromBlock}`,
    "INDEXER_URL=",
    "NEXT_PUBLIC_INDEXER_URL=",
    `NEXT_PUBLIC_AGENT_REGISTRY=${contracts.agentRegistry}`,
    `NEXT_PUBLIC_POLICY_REGISTRY=${contracts.policyRegistry}`,
    `NEXT_PUBLIC_ACTION_ATTESTATION=${contracts.actionAttestation}`,
    "NEXT_PUBLIC_DEFAULT_AGENT_ID=",
    "NEXT_PUBLIC_DEFAULT_POLICY_ID=",
    "",
  ].join("\n");

  writeFileSync(out, content, "utf8");
  return {
    ok: true,
    file: out,
    nextSteps: [
      `Fill PRIVATE_KEY in ${out} with a Mantle Sepolia test key for write flows.`,
      "Run: pnpm cli -- doctor --no-fail",
      "Run: pnpm cli -- quickstart --private-key 0x...",
    ],
  };
}

function writeAgentStarter(flags: Record<string, string | boolean | string[]>) {
  const out = requiredString(flags, "out");
  const template = flagString(flags, "template", "viem")!;
  if (!["viem", "agentkit", "goat"].includes(template)) {
    throw new CliInputError("--template must be viem, agentkit, or goat.");
  }
  if (existsSync(out) && !flagBool(flags, "force")) {
    throw new CliInputError(`${out} already exists. Re-run with --force or choose a different --out directory.`);
  }

  mkdirSync(join(out, "src"), { recursive: true });
  writeFileSync(join(out, ".env.example"), starterEnv(), "utf8");
  writeFileSync(join(out, "package.json"), starterPackageJson(template), "utf8");
  writeFileSync(join(out, "README.md"), starterReadme(template), "utf8");
  writeFileSync(join(out, "src", "interlock.ts"), starterInterlockTs(), "utf8");
  writeFileSync(join(out, "src", "agent.ts"), starterAgentTs(template), "utf8");

  return {
    ok: true,
    output: out,
    template,
    files: [".env.example", "package.json", "README.md", "src/interlock.ts", "src/agent.ts"],
    nextSteps: [
      `cd ${out}`,
      "pnpm install",
      "cp .env.example .env",
      "Fill AGENT_ID and POLICY_ID with real Interlock ids.",
      "pnpm start",
    ],
  };
}

function starterEnv() {
  return [
    "MANTLE_RPC_URL=https://rpc.sepolia.mantle.xyz",
    `AGENT_REGISTRY=${contractsFromFlags({}).agentRegistry}`,
    `POLICY_REGISTRY=${contractsFromFlags({}).policyRegistry}`,
    `ACTION_ATTESTATION=${contractsFromFlags({}).actionAttestation}`,
    "AGENT_ID=",
    "POLICY_ID=",
    "PRIVATE_KEY=",
    "",
  ].join("\n");
}

function starterPackageJson(template: string) {
  return `${JSON.stringify({
    name: `interlock-agent-${template}`,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts: { start: "tsx src/agent.ts", check: "tsc --noEmit" },
    dependencies: {
      "@interlock/firewall-sdk": "workspace:*",
      "@interlock/shared": "workspace:*",
      tsx: "^4.19.4",
      typescript: "^5.8.3",
      viem: "^2.51.3",
    },
  }, null, 2)}\n`;
}

function starterReadme(template: string) {
  return `# Interlock Agent Starter (${template})

This starter shows one safe pre-flight and one blocked pre-flight on Mantle Sepolia.

It does not ship private keys, fake protocol addresses, fake balances, or fake transactions.

## Run

\`\`\`bash
pnpm install
cp .env.example .env
# Fill AGENT_ID and POLICY_ID with real Interlock ids.
pnpm start
\`\`\`
`;
}

function starterInterlockTs() {
  return `import { InterlockFirewall } from "@interlock/firewall-sdk";
import { deployedAddresses, mantleSepolia } from "@interlock/shared";

export function createFirewall() {
  return new InterlockFirewall({
    chain: mantleSepolia,
    rpcUrl: process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0],
    privateKey: process.env.PRIVATE_KEY as \`0x\${string}\` | undefined,
    contracts: {
      agentRegistry: (process.env.AGENT_REGISTRY ?? deployedAddresses.mantleSepolia.agentRegistry) as \`0x\${string}\`,
      policyRegistry: (process.env.POLICY_REGISTRY ?? deployedAddresses.mantleSepolia.policyRegistry) as \`0x\${string}\`,
      actionAttestation: (process.env.ACTION_ATTESTATION ?? deployedAddresses.mantleSepolia.actionAttestation) as \`0x\${string}\`,
    },
  });
}
`;
}

function starterAgentTs(template: string) {
  return `import { agentRegistryGetAgentCalldata } from "@interlock/firewall-sdk";
import { createFirewall } from "./interlock.js";

const agentId = BigInt(requiredEnv("AGENT_ID"));
const policyId = BigInt(requiredEnv("POLICY_ID"));
const firewall = createFirewall();

const safeAction = {
  agentId,
  policyId,
  tx: {
    to: firewall.contracts.agentRegistry,
    value: 0n,
    data: agentRegistryGetAgentCalldata(agentId),
  },
  metadata: { intent: "${template} starter safe agent profile read", expectedSlippageBps: 0 },
};

const riskyAction = {
  agentId,
  policyId,
  tx: {
    to: firewall.contracts.actionAttestation,
    value: 0n,
    data: "0x" as const,
  },
  metadata: { intent: "${template} starter unknown target attempt", expectedSlippageBps: 0 },
};

console.log(JSON.stringify({
  safe: await firewall.checkAction(safeAction),
  risky: await firewall.checkAction(riskyAction),
}, (_key, value) => typeof value === "bigint" ? value.toString() : value, 2));

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(\`\${name} is required.\`);
  return value;
}
`;
}

function buildWhoami(flags: Record<string, string | boolean | string[]>) {
  const privateKey = privateKeyFromFlags(flags);
  const account = privateKey ? privateKeyToAccount(privateKey) : undefined;
  return {
    chain: { name: mantleSepolia.name, chainId: mantleSepolia.id },
    account: account
      ? { address: account.address, source: "PRIVATE_KEY" }
      : { address: undefined, source: "read-only", action: "Set PRIVATE_KEY or pass --private-key for write commands." },
    agentId: flagString(flags, "agent-id") ?? process.env.AGENT_ID ?? process.env.NEXT_PUBLIC_DEFAULT_AGENT_ID,
    policyId: flagString(flags, "policy-id") ?? process.env.POLICY_ID ?? process.env.NEXT_PUBLIC_DEFAULT_POLICY_ID,
    rpcUrl: rpcUrlFromFlags(flags),
    contracts: contractsFromFlags(flags),
  };
}

async function buildStatus(flags: Record<string, string | boolean | string[]>, firewall: InterlockFirewall) {
  const privateKey = privateKeyFromFlags(flags);
  const indexerUrl = flagString(flags, "indexer-url") ?? process.env.INDEXER_URL ?? process.env.NEXT_PUBLIC_INDEXER_URL;
  const report = await buildDoctorReport({
    rpcUrl: rpcUrlFromFlags(flags),
    contracts: contractsFromFlags(flags),
    privateKeyConfigured: Boolean(privateKey),
    indexerUrl,
  });
  const agentId = optionalBigint(flags, "agent-id");
  const policyId = optionalBigint(flags, "policy-id");

  return {
    ok: report.ok,
    product: "Mantle Agent Safety & Benchmark Control Plane",
    chain: { name: mantleSepolia.name, chainId: mantleSepolia.id },
    account: buildWhoami(flags).account,
    doctor: report,
    selected: {
      agent: agentId ? formatAgent(agentId, await firewall.getAgentStats(agentId)) : undefined,
      policy: policyId ? formatPolicy(policyId, await firewall.getPolicy(policyId)) : undefined,
    },
    nextSteps: report.ok
      ? ["Run: interlock benchmark run --agent-id <id> --policy-id <id>", "Open the dashboard or /agent/:id safety card."]
      : ["Fix failed doctor checks above.", "Run: interlock doctor --no-fail for actionable diagnostics."],
  };
}

async function runQuickstart(flags: Record<string, string | boolean | string[]>, firewall: InterlockFirewall) {
  if (!privateKeyFromFlags(flags)) {
    throw new CliInputError("quickstart requires --private-key or PRIVATE_KEY because it registers an agent and creates a policy.");
  }

  const metadataURI = flagString(flags, "metadata-uri", `interlock://quickstart/${new Date().toISOString()}`)!;
  const maxNativeValue = optionalEtherFlag(flags, "max-native") ?? parseEther("0.02");
  const maxSlippageBps = numberFlag(flags, "max-slippage-bps", 100)!;
  assertCliSlippageBps(maxSlippageBps, "max-slippage-bps");

  const agent = await firewall.registerAgentAndWait({ metadataURI });
  const policy = await firewall.createPolicyAndWait({
    agentId: agent.agentId,
    maxNativeValue,
    maxSlippageBps,
    targets: [contractsFromFlags(flags).agentRegistry],
    selectors: [agentRegistryGetAgentSelector],
  });
  const safeAction: AgentAction = {
    agentId: agent.agentId,
    policyId: policy.policyId,
    tx: {
      to: contractsFromFlags(flags).agentRegistry,
      value: 0n,
      data: agentRegistryGetAgentCalldata(agent.agentId),
    },
    metadata: { intent: "Quickstart safe AgentRegistry read", expectedSlippageBps: 0 },
  };
  const riskyAction: AgentAction = {
    agentId: agent.agentId,
    policyId: policy.policyId,
    tx: {
      to: contractsFromFlags(flags).actionAttestation,
      value: 0n,
      data: "0x",
    },
    metadata: { intent: "Quickstart unknown target attempt", expectedSlippageBps: 0 },
  };
  const safeDecision = await firewall.checkAction(safeAction);
  const riskyDecision = await firewall.checkAction(riskyAction);
  const attestations = flagBool(flags, "record")
    ? [await firewall.recordDecisionAndWait(safeDecision), await firewall.recordDecisionAndWait(riskyDecision)]
    : [];

  return {
    ok: true,
    agent,
    policy,
    decisions: [formatDecision(safeDecision, safeAction), formatDecision(riskyDecision, riskyAction)],
    attestations,
    dashboardPath: "/",
    safetyCardPath: `/agent/${agent.agentId.toString()}`,
    nextSteps: [
      `Run: interlock benchmark run --agent-id ${agent.agentId.toString()} --policy-id ${policy.policyId.toString()}`,
      `Open: /agent/${agent.agentId.toString()}`,
    ],
  };
}

function printHelp() {
  console.log(`Interlock Control Plane CLI

Commands:
  init        Create an Interlock .env file without overwriting unless --force is set
  quickstart Register agent, create policy, run safe/block preflight
  status      Show RPC, contracts, indexer, selected agent/policy, and next steps
  whoami      Show active chain, account, agent id, policy id, and contracts
  benchmark run Run the default Interlock safety benchmark suite
  gateway run Run the agent gateway: dry-run, record-only, execute-if-allowed, or block-and-alert
  analytics   Read Recorder analytics globally or for one agent/policy
  webhook-test Send a signed latest indexed ActionChecked payload to WEBHOOK_URL or --url
  policy-version snapshot Save or print an off-chain policy version artifact
  policy-version diff Compare two policy version JSON files
  policy-version verify Compare an on-chain policy against a snapshot
  register-agent     Register a new agent and print its id
  policy-create      Create a policy from explicit targets/selectors
  policy-create-preset Create a policy from a named preset
  policy-pack        Print a JSON policy pack from a preset
  policy-pack --list List Mantle ecosystem policy pack templates
  policy-pack-list   List Mantle ecosystem policy pack templates
  policy-pack-registry Validate and print the official Interlock policy pack registry
  policy-pack-validate Validate a JSON policy pack file
  policy-import      Create an on-chain policy from a JSON policy pack
  policy-audit       Compare an on-chain policy against a JSON policy pack
  policy-apply       Apply or prune policy pack rules on an existing on-chain policy
  preflight   Run checkAction and print JSON-safe allow/block output
  record      Run preflight and record the decision on-chain
  history     Read ActionChecked history
  agent-get   Read agent owner, metadata, and reputation counters
  policy-get  Read policy owner, limits, and active state
  policy-check Check whether a target and/or selector is allowed
  preset      Print a policy preset summary
  policy-update    Update native/slippage limits and active status
  target-allow     Allow or deny a target contract for a policy
  selector-allow   Allow or deny a function selector for a policy
  doctor      Check RPC, contract bytecode, env, and optional indexer health

Examples:
  pnpm cli -- init --out .env.interlock.local
  pnpm cli -- whoami
  pnpm cli -- status --agent-id <real_agent_id> --policy-id <real_policy_id>
  pnpm cli -- quickstart --private-key 0x...
  pnpm cli -- benchmark run --agent-id <real_agent_id> --policy-id <real_policy_id>
  pnpm cli -- benchmark run --agent-id <real_agent_id> --policy-id <real_policy_id> --record --private-key 0x...
  pnpm cli -- gateway run --mode dry-run --agent-id <real_agent_id> --policy-id <real_policy_id> --to 0x... --data 0x
  pnpm cli -- gateway run --mode execute-if-allowed --agent-id <real_agent_id> --policy-id <real_policy_id> --to 0x... --data 0x --private-key 0x...
  pnpm cli -- analytics --indexer-url <recorder_api_url>
  pnpm cli -- analytics --agent-id <real_agent_id> --indexer-url <recorder_api_url>
  pnpm cli -- webhook-test --url <webhook_receiver_url> --indexer-url <recorder_api_url> --secret <secret>
  pnpm cli -- policy-version snapshot --policy-id <real_policy_id> --out policies/policy.v1.json
  pnpm cli -- policy-version diff --from policies/policy-1.v1.json --to policies/policy-1.v2.json
  pnpm cli -- policy-version verify --file policies/policy-1.v1.json --private-key 0x...
  pnpm cli -- doctor --indexer-url <recorder_api_url>
  pnpm cli -- doctor --no-fail
  pnpm cli -- register-agent --metadata-uri ipfs://interlock-demo --private-key 0x...
  pnpm cli -- policy-create --agent-id <real_agent_id> --target 0x... --selector 0xd0e30db0 --max-native 0.02 --max-slippage-bps 100 --private-key 0x...
  pnpm cli -- policy-create-preset --agent-id <real_agent_id> --name conservative-defi --target 0x... --max-native 0.02 --private-key 0x...
  node packages/cli/dist/index.js policy-pack --name conservative-defi --target 0x... --max-native 0.02 > policies/conservative-defi.json
  pnpm cli -- policy-pack --list
  pnpm cli -- policy-pack-validate --file policies/conservative-defi.json
  pnpm cli -- policy-import --agent-id <real_agent_id> --file policies/conservative-defi.json --private-key 0x...
  pnpm cli -- policy-audit --policy-id <real_policy_id> --agent-id <real_agent_id> --file policies/conservative-defi.json
  pnpm cli -- policy-apply --policy-id <real_policy_id> --agent-id <real_agent_id> --file policies/conservative-defi.json --dry-run --prune
  pnpm cli -- preflight --agent-id <real_agent_id> --policy-id <real_policy_id> --to 0x... --value 0.01 --data 0x
  pnpm cli -- record --agent-id <real_agent_id> --policy-id <real_policy_id> --to 0x... --private-key 0x...
  pnpm cli -- history --agent-id <real_agent_id> --from-block <deployment_from_block>
  pnpm cli -- agent-get --agent-id <real_agent_id>
  pnpm cli -- policy-get --policy-id <real_policy_id>
  pnpm cli -- policy-check --policy-id <real_policy_id> --target 0x... --selector 0xd0e30db0
  pnpm cli -- preset --name conservative-defi --target 0x... --max-native 0.02
  pnpm cli -- policy-update --policy-id <real_policy_id> --max-native 0.05 --max-slippage-bps 100 --active true --private-key 0x...
  pnpm cli -- target-allow --policy-id <real_policy_id> --target 0x... --deny --private-key 0x...
  pnpm cli -- selector-allow --policy-id <real_policy_id> --selector 0xd0e30db0 --allowed true --private-key 0x...
`);
}

main().catch((error) => {
  if (error instanceof CliInputError) {
    console.error(`Input error: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const actionable = actionableError(error);
  console.error(`${actionable.code}: ${actionable.message}`);
  console.error(`Action: ${actionable.action}`);
  process.exitCode = 1;
});
