#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  InterlockFirewall,
  buildErc8004AgentManifest,
  getErc8004Agent,
  getMantleEcosystemPolicyPack,
  listMantleEcosystemPolicyPacks,
  listPolicyPackRegistryEntries,
  parsePolicyPack,
  runInterlockBenchmark,
  suggestedCalldataForPolicyAction,
  validatePolicyPackRegistry,
  type GatewayMode,
} from "@interlock/firewall-sdk";
import { deployedAddresses, mantleSepolia, type ReasonCodeLabel } from "@interlock/shared";
import { createPublicClient, getAddress, http, isAddress, type Address, type Hex } from "viem";

const defaultFromBlock = 39258697n;

const server = new McpServer({
  name: "interlock-control-plane",
  version: "0.1.0",
});

server.tool(
  "interlock_get_status",
  "Return Interlock Recorder/Control Plane runtime status for the configured Mantle Sepolia environment.",
  {},
  async () => textResult(await getStatus()),
);

server.tool(
  "interlock_preflight",
  "Run an Interlock pre-flight policy, simulation, and risk check for a proposed Mantle Sepolia agent transaction. This does not send the transaction.",
  {
    agentId: positiveIdSchema("agentId"),
    policyId: positiveIdSchema("policyId"),
    to: addressSchema("to"),
    valueWei: z.string().regex(/^\d+$/).default("0").describe("Native value in wei."),
    data: calldataSchema().default("0x"),
    expectedSlippageBps: slippageSchema().optional(),
    intent: z.string().optional(),
  },
  async (input) => textResult(await preflight(input)),
);

server.tool(
  "interlock_gateway_action",
  "Run the Interlock Agent Gateway for a proposed action. Modes: dry-run, record-only, execute-if-allowed, block-and-alert.",
  {
    agentId: positiveIdSchema("agentId"),
    policyId: positiveIdSchema("policyId"),
    to: addressSchema("to"),
    valueWei: z.string().regex(/^\d+$/).default("0").describe("Native value in wei."),
    data: calldataSchema().default("0x"),
    expectedSlippageBps: slippageSchema().optional(),
    intent: z.string().optional(),
    mode: gatewayModeSchema().default("dry-run"),
    recordDecision: z.boolean().optional(),
    recordTiming: z.enum(["before-send", "after-send"]).optional(),
    throwOnBlock: z.boolean().default(false),
  },
  async (input) => textResult(await gatewayAction(input)),
);

server.tool(
  "interlock_record_decision",
  "Run pre-flight and record the resulting allow/block decision on Mantle Sepolia. Requires PRIVATE_KEY in the MCP server environment.",
  {
    agentId: positiveIdSchema("agentId"),
    policyId: positiveIdSchema("policyId"),
    to: addressSchema("to"),
    valueWei: z.string().regex(/^\d+$/).default("0").describe("Native value in wei."),
    data: calldataSchema().default("0x"),
    expectedSlippageBps: slippageSchema().optional(),
    intent: z.string().optional(),
  },
  async (input) => {
    if (!process.env.PRIVATE_KEY) {
      return textResult({
        ok: false,
        code: "PRIVATE_KEY_REQUIRED",
        message: "Recording decisions requires PRIVATE_KEY in the MCP server environment. Pre-flight remains available without a key.",
      });
    }
    const firewall = createFirewall();
    const decision = await firewall.checkAction(toAgentAction(input));
    const attestation = await firewall.recordDecisionAndWait(decision);
    return textResult({ ok: true, decision: jsonSafeDecision(decision), attestation: jsonSafe(attestation) });
  },
);

server.tool(
  "interlock_run_benchmark",
  "Run the default Interlock benchmark suite for a real agent/policy. Optionally records pre-flight decisions when PRIVATE_KEY is configured.",
  {
    agentId: positiveIdSchema("agentId"),
    policyId: positiveIdSchema("policyId"),
    recordDecisions: z.boolean().default(false),
  },
  async ({ agentId, policyId, recordDecisions }) => {
    if (recordDecisions && !process.env.PRIVATE_KEY) {
      return textResult({
        ok: false,
        code: "PRIVATE_KEY_REQUIRED",
        message: "Recording benchmark decisions requires PRIVATE_KEY. Run without recordDecisions for read-only benchmark checks.",
      });
    }
    const firewall = createFirewall();
    const report = await runInterlockBenchmark({
      firewall,
      agentId: BigInt(agentId),
      policyId: BigInt(policyId),
      contracts: currentContracts(),
      recordDecisions,
    });
    return textResult({ ok: true, report: jsonSafe(report) });
  },
);

server.tool(
  "interlock_get_safety_card",
  "Build a public safety-card style summary for a Mantle Sepolia agent from real AgentRegistry counters and ActionChecked history.",
  {
    agentId: positiveIdSchema("agentId"),
    fromBlock: z.string().regex(/^\d+$/).optional(),
  },
  async ({ agentId, fromBlock }) => {
    const firewall = createFirewall();
    const id = BigInt(agentId);
    const [stats, history] = await Promise.all([
      firewall.getAgentStats(id),
      firewall.getActionHistory({ agentId: id, fromBlock: fromBlock ? BigInt(fromBlock) : envFromBlock() }),
    ]);
    const reasonBreakdown = history.reduce<Record<string, number>>((accumulator, entry) => {
      accumulator[entry.reasonCode] = (accumulator[entry.reasonCode] ?? 0) + 1;
      return accumulator;
    }, {});
    return textResult({
      ok: true,
      agentId,
      stats: jsonSafe(stats),
      historyCount: history.length,
      latestActions: history.slice(0, 10).map(jsonSafe),
      reasonBreakdown,
      safetyCardPath: `/agent/${agentId}`,
      disclaimer: "Dev Alpha counters only. This is not an audited production trust score.",
    });
  },
);

server.tool(
  "interlock_get_policy",
  "Read a policy and its enumerated target/selector allowlists from Mantle Sepolia.",
  { policyId: positiveIdSchema("policyId") },
  async ({ policyId }) => {
    const firewall = createFirewall();
    const id = BigInt(policyId);
    const [policy, targets, selectors] = await Promise.all([
      firewall.getPolicy(id),
      firewall.getAllowedTargets(id),
      firewall.getAllowedSelectors(id),
    ]);
    return textResult({ ok: true, policyId, policy: jsonSafe(policy), targets, selectors });
  },
);

server.tool(
  "interlock_get_agent_history",
  "Read ActionChecked history for an agent from Mantle Sepolia.",
  {
    agentId: positiveIdSchema("agentId"),
    policyId: positiveIdSchema("policyId").optional(),
    fromBlock: z.string().regex(/^\d+$/).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  },
  async ({ agentId, policyId, fromBlock, limit }) => {
    const firewall = createFirewall();
    const history = await firewall.getActionHistory({
      agentId: BigInt(agentId),
      policyId: policyId ? BigInt(policyId) : undefined,
      fromBlock: fromBlock ? BigInt(fromBlock) : envFromBlock(),
    });
    return textResult({
      ok: true,
      count: Math.min(history.length, limit),
      history: history.slice(0, limit).map(jsonSafe),
      note: "History is real ActionChecked event data from Mantle Sepolia.",
    });
  },
);

server.tool(
  "interlock_explain_block",
  "Explain why Interlock blocked or allowed an action and what the developer should do next.",
  {
    reasonCode: z.enum([
      "POLICY_PASSED",
      "TARGET_NOT_ALLOWED",
      "VALUE_LIMIT_EXCEEDED",
      "SLIPPAGE_LIMIT_EXCEEDED",
      "SIMULATION_FAILED",
      "UNKNOWN_SELECTOR",
    ]),
  },
  async ({ reasonCode }) => textResult(explainReason(reasonCode)),
);

server.tool(
  "interlock_explain_decision",
  "Explain an Interlock decision/reason code and return the next developer action.",
  {
    reasonCode: z.enum([
      "POLICY_PASSED",
      "TARGET_NOT_ALLOWED",
      "VALUE_LIMIT_EXCEEDED",
      "SLIPPAGE_LIMIT_EXCEEDED",
      "SIMULATION_FAILED",
      "UNKNOWN_SELECTOR",
    ]),
  },
  async ({ reasonCode }) => textResult(explainReason(reasonCode)),
);

server.tool(
  "interlock_create_policy_draft",
  "Create a JSON policy draft from a Mantle track policy pack. Template packs never include fake protocol addresses.",
  {
    packId: z.string().default("mantle-basic-agent"),
    agentId: positiveIdSchema("agentId").default("1"),
    target: addressSchema("target").optional(),
  },
  async ({ packId, agentId, target }) => {
    return textResult(createPolicyPackDraft({ packId, agentId, target }));
  },
);

server.tool(
  "interlock_create_policy_pack",
  "Create a policy pack JSON template from the official Interlock registry. Template packs never include fake protocol addresses.",
  {
    packId: z.string().default("mantle-basic-agent"),
    agentId: positiveIdSchema("agentId").default("1"),
    target: addressSchema("target").optional(),
  },
  async ({ packId, agentId, target }) => textResult(createPolicyPackDraft({ packId, agentId, target })),
);

server.tool(
  "interlock_validate_policy_pack",
  "Validate either the built-in policy-pack registry or a provided policy pack JSON string.",
  {
    policyPackJson: z.string().optional(),
  },
  async ({ policyPackJson }) => {
    if (!policyPackJson) {
      return textResult(validatePolicyPackRegistry());
    }
    try {
      return textResult({ ok: true, policyPack: parsePolicyPack(policyPackJson) });
    } catch (error) {
      return textResult({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  },
);

server.tool(
  "interlock_get_erc8004_identity",
  "Read an ERC-8004 agent identity from the official Mantle Sepolia IdentityRegistry.",
  {
    agentId: positiveIdSchema("agentId"),
    identityRegistry: addressSchema("identityRegistry").optional(),
  },
  async ({ agentId, identityRegistry }) => {
    const publicClient = createPublicClient({
      chain: mantleSepolia,
      transport: http(process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0]),
    });
    const registry =
      identityRegistry
        ? getAddress(identityRegistry)
        : optionalEnvAddress("ERC8004_IDENTITY_REGISTRY") ?? deployedAddresses.mantleSepolia.erc8004IdentityRegistry;
    if (!registry) {
      return textResult({
        ok: false,
        code: "ERC8004_REGISTRY_NOT_CONFIGURED",
        message: "Pass identityRegistry explicitly or set ERC8004_IDENTITY_REGISTRY. Interlock does not ship unverified placeholder registry addresses.",
      });
    }
    try {
      return textResult({ ok: true, identity: await getErc8004Agent({ publicClient, identityRegistry: registry, agentId: BigInt(agentId) }) });
    } catch (error) {
      return textResult({ ok: false, code: "ERC8004_READ_FAILED", message: error instanceof Error ? error.message : String(error) });
    }
  },
);

server.tool(
  "interlock_build_erc8004_manifest",
  "Build an ERC-8004-compatible agent manifest that links an Interlock agent to MCP/dashboard services.",
  {
    interlockAgentId: positiveIdSchema("interlockAgentId"),
    name: z.string().min(1),
    description: z.string().min(1),
    mcpUrl: z.string().url().optional(),
    dashboardUrl: z.string().url().optional(),
  },
  async ({ interlockAgentId, name, description, mcpUrl, dashboardUrl }) => {
    const services = [
      ...(mcpUrl ? [{ type: "mcp" as const, url: mcpUrl, description: "Interlock MCP server endpoint" }] : []),
      ...(dashboardUrl ? [{ type: "dashboard" as const, url: dashboardUrl, description: "Interlock Agent Safety Card" }] : []),
    ];
    return textResult({
      ok: true,
      manifest: buildErc8004AgentManifest({
        interlockAgentId,
        name,
        description,
        services,
      }),
    });
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function preflight(input: {
  agentId: string;
  policyId: string;
  to: string;
  valueWei: string;
  data: string;
  expectedSlippageBps?: number;
  intent?: string;
}) {
  const firewall = createFirewall();
  const action = toAgentAction(input);
  const decision = await firewall.checkAction(action);
  return {
    ok: true,
    decision: jsonSafeDecision(decision),
    developerNextStep: nextStepForReason(decision.reasonCode),
    note: "This is a pre-flight decision. It is not proof that the downstream transaction executed.",
  };
}

async function gatewayAction(input: {
  agentId: string;
  policyId: string;
  to: string;
  valueWei: string;
  data: string;
  expectedSlippageBps?: number;
  intent?: string;
  mode: GatewayMode;
  recordDecision?: boolean;
  recordTiming?: "before-send" | "after-send";
  throwOnBlock: boolean;
}) {
  if (gatewayModeNeedsPrivateKey(input.mode, input.recordDecision) && !process.env.PRIVATE_KEY) {
    return {
      ok: false,
      code: "PRIVATE_KEY_REQUIRED",
      message: `${input.mode} requires PRIVATE_KEY in the MCP server environment. Use dry-run for read-only checks.`,
    };
  }
  const firewall = createFirewall();
  const result = await firewall.runGatewayAction(toAgentAction(input), {
    mode: input.mode,
    recordDecision: input.recordDecision,
    recordTiming: input.recordTiming,
    throwOnBlock: input.throwOnBlock,
  });
  return {
    ok: true,
    gateway: jsonSafe(result),
    developerNextStep: result.nextAction,
    note: "Gateway attestations are pre-flight decision evidence, not proof that the downstream transaction executed.",
  };
}

function createFirewall() {
  return new InterlockFirewall({
    chain: mantleSepolia,
    rpcUrl: process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0],
    privateKey: normalizePrivateKey(process.env.PRIVATE_KEY),
    contracts: currentContracts(),
  });
}

function currentContracts() {
  return {
    agentRegistry: envAddress("AGENT_REGISTRY", deployedAddresses.mantleSepolia.agentRegistry),
    policyRegistry: envAddress("POLICY_REGISTRY", deployedAddresses.mantleSepolia.policyRegistry),
    actionAttestation: envAddress("ACTION_ATTESTATION", deployedAddresses.mantleSepolia.actionAttestation),
  };
}

async function getStatus() {
  const rpcUrl = process.env.MANTLE_RPC_URL ?? mantleSepolia.rpcUrls.default.http[0];
  const contracts = currentContracts();
  const publicClient = createPublicClient({ chain: mantleSepolia, transport: http(rpcUrl) });
  const [chainId, blockNumber, agentRegistryCode, policyRegistryCode, actionAttestationCode] = await Promise.all([
    publicClient.getChainId(),
    publicClient.getBlockNumber(),
    publicClient.getBytecode({ address: contracts.agentRegistry }),
    publicClient.getBytecode({ address: contracts.policyRegistry }),
    publicClient.getBytecode({ address: contracts.actionAttestation }),
  ]);
  return {
    ok: chainId === mantleSepolia.id && Boolean(agentRegistryCode && policyRegistryCode && actionAttestationCode),
    product: "Mantle Agent Safety & Benchmark Control Plane",
    chain: { name: mantleSepolia.name, chainId, expectedChainId: mantleSepolia.id, blockNumber: blockNumber.toString() },
    rpcUrl,
    contracts: {
      agentRegistry: { address: contracts.agentRegistry, hasCode: Boolean(agentRegistryCode) },
      policyRegistry: { address: contracts.policyRegistry, hasCode: Boolean(policyRegistryCode) },
      actionAttestation: { address: contracts.actionAttestation, hasCode: Boolean(actionAttestationCode) },
    },
    privateKeyConfigured: Boolean(process.env.PRIVATE_KEY),
    policyPackRegistry: {
      entries: listPolicyPackRegistryEntries().length,
      validation: validatePolicyPackRegistry().ok,
    },
  };
}

function toAgentAction(input: {
  agentId: string;
  policyId: string;
  to: string;
  valueWei: string;
  data: string;
  expectedSlippageBps?: number;
  intent?: string;
}) {
  return {
    agentId: BigInt(input.agentId),
    policyId: BigInt(input.policyId),
    tx: {
      to: getAddress(input.to),
      value: BigInt(input.valueWei),
      data: input.data as Hex,
    },
    metadata: {
      intent: input.intent,
      expectedSlippageBps: input.expectedSlippageBps,
    },
  };
}

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, bigintReplacer, 2),
      },
    ],
  };
}

function jsonSafe(value: unknown) {
  return JSON.parse(JSON.stringify(value, bigintReplacer));
}

function jsonSafeDecision(decision: Awaited<ReturnType<InterlockFirewall["checkAction"]>>) {
  return jsonSafe({
    allowed: decision.allowed,
    decision: decision.decision,
    reasonCode: decision.reasonCode,
    riskScore: decision.riskScore,
    explanation: decision.explanation,
    agentId: decision.agentId,
    policyId: decision.policyId,
    tx: decision.tx,
    selector: decision.selector,
    calldataHash: decision.calldataHash,
    simulationHash: decision.simulationHash,
    simulation: decision.simulation,
    checks: decision.checks,
  });
}

function bigintReplacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}

function envAddress(name: string, fallback: Address) {
  const value = process.env[name];
  if (!value) return fallback;
  if (!isAddress(value)) {
    throw new Error(`${name} must be a valid EVM address.`);
  }
  return getAddress(value);
}

function optionalEnvAddress(name: string) {
  const value = process.env[name];
  if (!value) return undefined;
  if (!isAddress(value)) {
    throw new Error(`${name} must be a valid EVM address.`);
  }
  return getAddress(value);
}

function normalizePrivateKey(value?: string): Hex | undefined {
  if (!value) return undefined;
  const normalized = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("PRIVATE_KEY must be a 32-byte hex private key.");
  }
  return normalized as Hex;
}

function envFromBlock() {
  const value = process.env.FROM_BLOCK ?? process.env.ACTION_ATTESTATION_FROM_BLOCK;
  if (!value) return defaultFromBlock;
  if (!/^\d+$/.test(value)) {
    throw new Error("FROM_BLOCK must be a non-negative integer.");
  }
  return BigInt(value);
}

function createPolicyPackDraft(input: { packId: string; agentId: string; target?: string }) {
  const pack = getMantleEcosystemPolicyPack(input.packId);
  if (!pack) {
    return {
      ok: false,
      message: `Unknown packId: ${input.packId}`,
      availablePacks: listMantleEcosystemPolicyPacks().map((item) => ({ id: item.id, name: item.name })),
    };
  }

  const targets =
    pack.mode === "ready"
      ? [{ address: deployedAddresses.mantleSepolia.agentRegistry, label: "AgentRegistry" }]
      : input.target
        ? [{ address: getAddress(input.target), label: "Team supplied real target" }]
        : [];

  return {
    ok: true,
    agentId: input.agentId,
    pack: {
      id: pack.id,
      aliases: pack.aliases,
      name: pack.name,
      trackFit: pack.trackFit,
      ecosystem: pack.ecosystem,
      mode: pack.mode,
      requiredAddresses: pack.requiredAddresses,
      riskNotes: pack.riskNotes,
    },
    policyPack: {
      version: "interlock.policy.v1",
      name: pack.name,
      description: pack.description,
      chainId: mantleSepolia.id,
      maxNativeValue: pack.mode === "ready" ? pack.maxNativeValue : "team-configured",
      maxSlippageBps: pack.maxSlippageBps,
      targets,
      selectors: pack.supportedSelectors,
      notes: [...pack.riskNotes, pack.judgeHook],
    },
    warning:
      pack.mode === "template" && targets.length === 0
        ? "Template packs require real protocol/test-contract addresses from the integrating team before they can be applied on-chain."
        : undefined,
  };
}

function positiveIdSchema(name: string) {
  return z.string().regex(/^[1-9]\d*$/).describe(`${name} as a positive integer string.`);
}

function addressSchema(name: string) {
  return z
    .string()
    .refine((value) => isAddress(value), `${name} must be an EVM address.`)
    .describe(`${name} EVM address.`);
}

function calldataSchema() {
  return z.string().regex(/^0x([0-9a-fA-F]{2})*$/, "calldata must be 0x or full even-byte hex.");
}

function slippageSchema() {
  return z.number().int().min(0).max(10_000).describe("Expected slippage in basis points, 0..10000.");
}

function gatewayModeSchema() {
  return z.enum(["dry-run", "record-only", "execute-if-allowed", "block-and-alert"]);
}

function gatewayModeNeedsPrivateKey(mode: GatewayMode, recordDecision: boolean | undefined) {
  return mode === "record-only" || mode === "execute-if-allowed" || (mode === "block-and-alert" && recordDecision === true);
}

function explainReason(reasonCode: ReasonCodeLabel) {
  return {
    reasonCode,
    explanation:
      reasonCode === "POLICY_PASSED"
        ? "All configured policy, selector, spend, slippage, and simulation checks passed."
        : reasonCode === "TARGET_NOT_ALLOWED"
          ? "The proposed target contract is not in the selected policy allowlist."
          : reasonCode === "UNKNOWN_SELECTOR"
            ? "The calldata selector is not approved for this policy."
            : reasonCode === "VALUE_LIMIT_EXCEEDED"
              ? "The proposed native value is above the policy maxNativeValue."
              : reasonCode === "SLIPPAGE_LIMIT_EXCEEDED"
                ? "The expected slippage metadata exceeds the policy maxSlippageBps."
                : "Mantle RPC simulation reverted or failed before execution.",
    developerNextStep: nextStepForReason(reasonCode),
  };
}

function nextStepForReason(reasonCode: ReasonCodeLabel) {
  if (reasonCode === "POLICY_PASSED") return "Send the transaction in the agent runtime, then record or inspect the pre-flight attestation.";
  if (reasonCode === "TARGET_NOT_ALLOWED") return "Verify the contract address and only add it to the policy if it is an approved real integration.";
  if (reasonCode === "UNKNOWN_SELECTOR") return "Use full calldata, identify the function selector, and allowlist only the required bytes4 selector.";
  if (reasonCode === "VALUE_LIMIT_EXCEEDED") return "Lower the value or create a separate higher-risk policy after review.";
  if (reasonCode === "SLIPPAGE_LIMIT_EXCEEDED") return "Lower the route slippage or use a strategy-specific policy pack.";
  return "Inspect calldata, target state, wallet/account state, and Mantle RPC errors before retrying.";
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
