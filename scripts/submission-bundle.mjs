import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultDashboardUrl, defaultDemoVideoUrl, defaultRepoUrl } from "./submission-defaults.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const manifestPath = resolve(root, option("--manifest") ?? "deployments/mantle-sepolia/latest.json");
const outputPath = resolve(root, option("--out") ?? "submission/interlock-firewall-submission.md");
const requireLive = args.includes("--require-live");

const packageJson = readJson(resolve(root, "package.json"));
const manifest = readOptionalJson(manifestPath);

if (requireLive && !manifest.ok) {
  console.error(`Live manifest is required but missing or invalid: ${manifestPath}`);
  process.exit(1);
}

const markdown = renderSubmission({
  packageJson,
  manifest: manifest.ok ? manifest.value : undefined,
  repoUrl: option("--repo-url") ?? defaultRepoUrl,
  dashboardUrl: option("--dashboard-url") ?? defaultDashboardUrl,
  demoVideoUrl: option("--demo-video-url") ?? defaultDemoVideoUrl,
});

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, markdown);

console.log(JSON.stringify({
  ok: true,
  output: outputPath,
  liveManifestIncluded: manifest.ok,
  manifest: manifest.ok ? manifestPath : undefined,
  missingLiveManifest: manifest.ok ? undefined : manifest.error,
}, null, 2));

function renderSubmission({ packageJson, manifest, repoUrl, dashboardUrl, demoVideoUrl }) {
  return `# Interlock Control Plane Submission

## One-Liner

Interlock Control Plane is a Mantle-native safety, benchmark, and evidence layer for autonomous AI agents: simulate proposed transactions, enforce policy, record allow/block decisions on-chain, and expose agent behavior history through SDK, REST, MCP, CLI, dashboard, and indexer APIs.

## Track

Primary: AI DevTools
Secondary: Agentic Wallets & Economy

## Problem

Agent SDKs can give AI agents wallets and on-chain tools, but most teams still need to build their own guardrails before an agent moves funds. A bad tool call, prompt injection, wrong target contract, hallucinated calldata, or overspend can become an irreversible transaction.

## Solution

Interlock gives developers a reusable control layer:

\`\`\`text
agent proposes tx
  -> firewall simulates tx
  -> policy engine checks target, selector, value, slippage, active policy
  -> decision: ALLOW or BLOCK
  -> decision is recorded on Mantle
  -> dashboard/indexer shows Flight Recorder history
  -> Benchmark Arena and Agent Safety Card summarize behavior
\`\`\`

## Why Mantle

Mantle Turing Test is focused on agentic AI, on-chain execution, decision transparency, and agent benchmarking. Interlock is infrastructure for that ecosystem: trading agents, RWA agents, payment agents, and agentic wallets can call the same pre-flight layer before execution.

## Links

- Repository: ${repoUrl}
- Dashboard: ${dashboardUrl}
- Demo video: ${demoVideoUrl}
- Demo runbook: [docs/demo-runbook.md](../docs/demo-runbook.md)
- Demo video script: [docs/demo-video-script.md](../docs/demo-video-script.md)
- Wallet QA checklist: [docs/wallet-qa-checklist.md](../docs/wallet-qa-checklist.md)
- DoraHacks requirements audit: [docs/dorahacks-requirements-audit.md](../docs/dorahacks-requirements-audit.md)
- Desktop screenshot: [docs/screenshots/dashboard-desktop-qa.png](../docs/screenshots/dashboard-desktop-qa.png)
- Mobile screenshot: [docs/screenshots/dashboard-mobile-qa.png](../docs/screenshots/dashboard-mobile-qa.png)
- Judge Demo screenshot: [docs/screenshots/dashboard-judge-qa.png](../docs/screenshots/dashboard-judge-qa.png)
- Package version: \`${packageJson.version ?? "0.1.0"}\`
- License: MIT
- Mantle Sepolia explorer: https://sepolia.mantlescan.xyz

Local live demo command:

\`\`\`bash
pnpm live:demo
\`\`\`

Live service check:

\`\`\`bash
pnpm live:services
\`\`\`

${renderDeploymentSection(manifest)}

## Developer Integration

\`\`\`ts
const decision = await firewall.checkAction({
  agentId,
  policyId,
  tx: {
    to,
    value,
    data,
  },
  metadata: {
    intent: "Deposit into approved vault",
    expectedSlippageBps: 0,
  },
});

if (!decision.allowed) {
  return { blocked: true, reason: decision.reasonCode };
}

const executionTxHash = await walletClient.sendTransaction(decision.tx);
await firewall.recordDecision({ ...decision, executionTxHash });
\`\`\`

## Demo Runbook

Use \`docs/demo-runbook.md\` for the final 3-minute recording path. It keeps the demo focused on one safe action, one blocked action, and the on-chain Flight Recorder instead of spreading attention across roadmap features.

## Demo Flow

1. Register an agent.
2. Create or import a policy for a real target contract and selector.
3. Run a safe read or execution action against the allowlisted target.
4. Firewall returns \`ALLOW / POLICY_PASSED\`.
5. Record the attestation on Mantle.
6. Run a risky unknown-target or overspend action.
7. Firewall returns \`BLOCK / TARGET_NOT_ALLOWED\` or \`BLOCK / VALUE_LIMIT_EXCEEDED\`.
8. Show both records in the dashboard Flight Recorder.

## What Is Implemented

- Solidity contracts: \`AgentRegistry\`, \`PolicyRegistry\`, current \`ActionAttestationV3\`, deprecated \`ActionAttestationV2\`, \`PolicyGuardedExecutor\`, \`DisputeEscrow\`, \`AttestorCommittee\`, and \`ReputationOracle\`.
- TypeScript SDK with \`checkAction\`, \`recordDecision\`, \`guardedSendTransaction\`, EIP-712 attestation helpers, dispute/finalize helpers, policy packs, and adapters.
- MCP server with preflight, record, policy, history, block explanation, and policy draft tools.
- CLI for registration, policy import/apply/audit, preflight, record, history, and doctor checks.
- SQLite-backed indexer and HTTP API for agents, policies, actions, stats, and benchmark summaries.
- Next.js dashboard with policy maintenance, action review, Benchmark Arena, Analytics, Agent Safety Card, docs/changelog routes, and Flight Recorder.
- Examples for raw Viem, agent-framework style integration, GOAT-style tools, AgentKit-style providers, Vercel AI SDK-style tools, LangChain-style tools, backend automation, and preflight API routes.
- CI-style smoke gates for packages, examples, dashboard, manifest tooling, contract verification-status detection, contracts, and CLI doctor.
- Exportable Mantlescan verification artifacts via \`pnpm contracts:verify:export\`.

## Verification Commands

\`\`\`bash
pnpm check
pnpm test
pnpm security:slither
pnpm security:adversarial
pnpm smoke:all
pnpm contracts:verify:export
pnpm contracts:verification-status -- --no-fail
pnpm browser:qa
pnpm submission:doctor
\`\`\`

For live deployment:

\`\`\`bash
pnpm deploy:preflight
pnpm deploy:mantle-sepolia
pnpm live:readiness
pnpm live:smoke
pnpm live:demo:check
pnpm live:services
pnpm browser:qa
pnpm screenshots:capture
pnpm submission:doctor:live
pnpm submission:doctor:final
\`\`\`

Run \`pnpm submission:doctor:final\` only after regenerating this bundle with public GitHub, dashboard, and demo video URLs.

## Judge Hook

We are not building another AI wallet. We are building the control plane that any AI wallet, Byreal/RealClaw-style skill, GOAT/AgentKit tool, or custom Mantle agent can call before moving funds.

## What We Avoided

- no token;
- no full smart-account stack;
- no synthetic RWA platform;
- no real-capital trading strategy;
- no broad multichain scope.

## Roadmap

- ERC-8004-style validation/reputation registry integration.
- ERC-7579/Safe module version for smart-account wallets.
- Policy packs for x402 payments, RWA workflows, and DeFi strategy agents.
- Production multi-attestor or authorized-recorder operations.
- Contract verification automation and public package publishing.
`;
}

function renderDeploymentSection(manifest) {
  if (!manifest?.addresses) {
    return `## Mantle Sepolia Deployment

Live deployment manifest was not found when this bundle was generated.

TODO before final submission:

- run \`pnpm deploy:preflight\`;
- run \`pnpm deploy:mantle-sepolia\`;
- run \`pnpm live:readiness\`;
- run \`pnpm live:smoke\`;
- regenerate this file with \`pnpm submission:bundle\`.
`;
  }

  const { addresses } = manifest;
  const compatibility = manifest.compatibility?.policyRegistry;

  return `## Mantle Sepolia Deployment

- Chain: \`${manifest.chain}\`
- Chain ID: \`${manifest.chainId}\`
- Deployed at: \`${manifest.deployedAt}\`
- Deployer: \`${manifest.deployer}\`
- PolicyRegistry compatibility: \`${compatibility?.version ?? "unknown"}\`, enumeration: \`${String(compatibility?.supportsPolicyEnumeration ?? false)}\`

| Contract | Role | Address | Explorer |
| --- | --- | --- | --- |
${contractRows(addresses)}

Run \`pnpm live:smoke\` to create a fresh safe/block proof pair on this deployment. Run \`pnpm live:demo\` to start the local dashboard and indexer against these addresses.
`;
}

function contractRows(addresses) {
  const catalog = [
    ["agentRegistry", "AgentRegistry", "Agent identity + reputation counters"],
    ["policyRegistry", "PolicyRegistry", "Targets/selectors/limits policy store"],
    ["actionAttestation", "ActionAttestationV3", "EIP-712 attestor-signed decisions + dispute window + evidenceHash"],
    ["policyGuardedExecutor", "PolicyGuardedExecutor", "On-chain enforcement — reverts disallowed actions"],
    ["disputeEscrow", "DisputeEscrow", "Two-sided bonds + slashing for disputes"],
    ["attestorCommittee", "AttestorCommittee", "m-of-n threshold attestation primitive"],
    ["reputationOracle", "ReputationOracle", "Agent score + tier from on-chain counters"],
  ];
  return catalog
    .filter(([key]) => addresses[key])
    .map(
      ([key, label, role]) =>
        `| ${label} | ${role} | \`${addresses[key]}\` | https://sepolia.mantlescan.xyz/address/${addresses[key]} |`,
    )
    .join("\n");
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

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function readOptionalJson(path) {
  try {
    if (!existsSync(path)) {
      return { ok: false, error: `File not found: ${path}` };
    }
    return { ok: true, value: readJson(path) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
