import { writeFileSync } from "node:fs";
import { InterlockFirewall, agentRegistryGetAgentCalldata, runInterlockBenchmark, type AgentAction } from "@interlock/firewall-sdk";
import { deployedAddresses, mantleSepolia } from "@interlock/shared";
import { isAddress, type Address } from "viem";

if (process.argv.includes("--goal")) {
  await runGoalAgent();
} else {
  await runBenchmarkAgent();
}

async function runGoalAgent() {
  const privateKey = normalizePrivateKey(process.env.PRIVATE_KEY);
  const recordDecisions = process.env.RECORD_DECISIONS === "true" || process.argv.includes("--record");
  const goal = argValue("--goal") ?? "Protect a low-value Mantle agent action before execution.";
  const rpcUrl = process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0];
  const recorderUrl = normalizeRecorderUrl(process.env.RECORDER_URL ?? process.env.INDEXER_URL);
  const agentId = readRequiredBigIntEnv("AGENT_ID");
  const policyId = readRequiredBigIntEnv("POLICY_ID");
  const contracts = {
    agentRegistry: envAddress("AGENT_REGISTRY", deployedAddresses.mantleSepolia.agentRegistry),
    policyRegistry: envAddress("POLICY_REGISTRY", deployedAddresses.mantleSepolia.policyRegistry),
    actionAttestation: envAddress("ACTION_ATTESTATION", deployedAddresses.mantleSepolia.actionAttestation),
  };
  if (recordDecisions && !privateKey) {
    throw new Error("Goal runner recording requires PRIVATE_KEY. Run without --record for read-only preflight.");
  }

  const firewall = new InterlockFirewall({ chain: mantleSepolia, rpcUrl, privateKey, contracts });
  const safeAction: AgentAction = {
    agentId,
    policyId,
    tx: { to: contracts.agentRegistry, value: 0n, data: agentRegistryGetAgentCalldata(agentId) },
    metadata: { intent: `Goal runner safe action: ${goal}`, expectedSlippageBps: 0, route: "agent-goal:safe" },
  };
  const riskyAction: AgentAction = {
    agentId,
    policyId,
    tx: { to: contracts.actionAttestation, value: 0n, data: "0x" },
    metadata: { intent: `Goal runner risky action: ${goal}`, expectedSlippageBps: 0, route: "agent-goal:unknown-target" },
  };
  const proposal = recorderUrl
    ? await createRecorderProposal(recorderUrl, {
        agentId: agentId.toString(),
        policyId: policyId.toString(),
        target: safeAction.tx.to,
        value: safeAction.tx.value.toString(),
        calldata: safeAction.tx.data,
        intent: goal,
      })
    : undefined;
  const bundle = await firewall.checkActionBundle({
    bundleId: `goal-${Date.now()}`,
    agentId,
    policyId,
    intent: goal,
    metadata: { source: "agent", routeProvider: "manual", expectedSlippageBps: 0 },
    actions: [safeAction, riskyAction],
  });
  const recorderPreflight = proposal
    ? await preflightRecorderProposal(recorderUrl!, proposal.proposal.proposalId).catch((error) => ({
        error: error instanceof Error ? error.message : String(error),
      }))
    : undefined;
  const attestations = recordDecisions ? await firewall.recordBundleDecisions(bundle) : [];
  const recorderRecord = proposal && attestations[0]
    ? await recordRecorderProposal(recorderUrl!, proposal.proposal.proposalId, {
        actionCheckId: attestations[0].actionCheckId?.toString(),
        txHash: attestations[0].transactionHash,
      }).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }))
    : undefined;
  const output = {
    product: "Interlock Agent Goal Runner",
    mode: recordDecisions ? "recorded" : "read-only",
    goal,
    chain: { name: mantleSepolia.name, chainId: mantleSepolia.id },
    proposalTimeline: [
      { status: "proposed", detail: "Agent created safe and risky proposed actions from the goal." },
      { status: "preflighted", detail: `Bundle decision: ${bundle.decision} / ${bundle.reasonCode}` },
      ...(attestations.length ? [{ status: "recorded", detail: `${attestations.length} decisions recorded on Mantle Sepolia.` }] : []),
    ],
    dashboard: process.env.DASHBOARD_URL ?? "https://mantle-nine-beta.vercel.app",
    safetyCard: `${process.env.DASHBOARD_URL ?? "https://mantle-nine-beta.vercel.app"}/agent/${agentId.toString()}`,
    recorder: recorderUrl
      ? {
          url: recorderUrl,
          proposal,
          preflight: recorderPreflight,
          record: recorderRecord,
        }
      : { url: undefined, proposalPersistence: "disabled: set RECORDER_URL or INDEXER_URL to persist proposal lifecycle." },
    bundle,
    attestations,
  };
  console.log(JSON.stringify(output, bigintReplacer, 2));
}

async function runBenchmarkAgent() {
  const privateKey = normalizePrivateKey(process.env.PRIVATE_KEY);
  const recordDecisions = process.env.RECORD_DECISIONS === "true" || process.argv.includes("--record");
  const rpcUrl = process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0];
  const agentId = readRequiredBigIntEnv("AGENT_ID");
  const policyId = readRequiredBigIntEnv("POLICY_ID");
  const contracts = {
    agentRegistry: envAddress("AGENT_REGISTRY", deployedAddresses.mantleSepolia.agentRegistry),
    policyRegistry: envAddress("POLICY_REGISTRY", deployedAddresses.mantleSepolia.policyRegistry),
    actionAttestation: envAddress("ACTION_ATTESTATION", deployedAddresses.mantleSepolia.actionAttestation),
  };

  if (recordDecisions && !privateKey) {
    throw new Error("Set PRIVATE_KEY or disable RECORD_DECISIONS. Read-only benchmark mode works without a key.");
  }

  const firewall = new InterlockFirewall({
    chain: mantleSepolia,
    rpcUrl,
    privateKey,
    contracts,
  });
  const report = await runInterlockBenchmark({
    firewall,
    agentId,
    policyId,
    contracts,
    recordDecisions,
  });
  const output = {
    product: "Mantle Agent Safety & Benchmark Control Plane",
    mode: recordDecisions ? "recorded" : "read-only",
    chain: { name: mantleSepolia.name, chainId: mantleSepolia.id },
    dashboard: process.env.DASHBOARD_URL ?? "https://mantle-nine-beta.vercel.app",
    safetyCard: `${process.env.DASHBOARD_URL ?? "https://mantle-nine-beta.vercel.app"}/agent/${agentId.toString()}`,
    report,
  };

  const outPath = process.env.BENCHMARK_OUT;
  if (outPath) {
    writeFileSync(outPath, `${JSON.stringify(output, bigintReplacer, 2)}\n`, "utf8");
  }

  console.log(JSON.stringify(output, bigintReplacer, 2));
}

function envAddress(name: string, fallback: Address) {
  const value = process.env[name];
  if (!value) return fallback;
  if (!isAddress(value)) {
    throw new Error(`${name} must be a valid EVM address.`);
  }
  return value;
}

function normalizePrivateKey(value?: string) {
  if (!value) return undefined;
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("PRIVATE_KEY must be a 32-byte hex private key.");
  }
  return normalized as `0x${string}`;
}

function readRequiredBigIntEnv(name: string) {
  const value = process.env[name];
  if (!value || !/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be set to a positive id from the deployed Interlock contracts.`);
  }
  return BigInt(value);
}

function bigintReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}

function normalizeRecorderUrl(value?: string) {
  if (!value || value === "disabled") return undefined;
  return value.replace(/\/$/, "");
}

async function createRecorderProposal(
  recorderUrl: string,
  body: { agentId: string; policyId: string; target: Address; value: string; calldata: `0x${string}`; intent: string },
) {
  const response = await fetch(`${recorderUrl}/proposals`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Recorder proposal creation failed (${response.status}): ${await response.text()}`);
  }
  return (await response.json()) as { proposal: { proposalId: string; status: string } };
}

async function preflightRecorderProposal(recorderUrl: string, proposalId: string) {
  const response = await fetch(`${recorderUrl}/proposals/${encodeURIComponent(proposalId)}/preflight`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Recorder proposal preflight failed (${response.status}): ${await response.text()}`);
  }
  return (await response.json()) as unknown;
}

async function recordRecorderProposal(
  recorderUrl: string,
  proposalId: string,
  body: { actionCheckId?: string; txHash?: `0x${string}` },
) {
  const response = await fetch(`${recorderUrl}/proposals/${encodeURIComponent(proposalId)}/record`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Recorder proposal record failed (${response.status}): ${await response.text()}`);
  }
  return (await response.json()) as unknown;
}

function argValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  const next = process.argv[index + 1];
  return next && !next.startsWith("--") ? next : undefined;
}
