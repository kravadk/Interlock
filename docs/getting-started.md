# Getting Started

This guide is the shortest path for a developer to try Interlock Firewall locally and understand where it fits in an agent stack.

## 1. Install

```bash
pnpm install
```

## 2. Verify The Workspace

```bash
pnpm build
pnpm check
pnpm test
```

For commands that need `.env`, copy the example once:

```bash
cp .env.example .env
pnpm env:doctor
```

`pnpm env:doctor` loads `.env`, checks Mantle Sepolia RPC, contract bytecode configuration, private key presence, and optional indexer health.

For a faster smoke pass:

```bash
pnpm --filter @interlock/contracts local:smoke
pnpm --filter @interlock/example-raw-viem demo
pnpm cli -- help
```

For the full devtool readiness pass:

```bash
pnpm smoke:all
```

This also checks package exports, packaged tarballs, consumer install, all examples, local contracts, and CLI doctor output.

## 3. Start The Dashboard

```bash
pnpm dev
```

Open `http://127.0.0.1:3000` — the **landing page** is at `/`, and the developer control plane is at
**`/app`**. The control plane lets you inspect an agent (with an on-chain reputation badge),
create/update policies (incl. AI policy drafting), run a preflight check (with an AI risk explainer
and an optional **Execute enforced** path through `PolicyGuardedExecutor`), record an attestation,
run a live **Agent Demo** loop, view the Flight Recorder (with dispute bond/challenge controls), and
copy SDK/REST/MCP snippets.

To enable the **advisory AI layer**, set a server-side `ANTHROPIC_API_KEY` in `.env` (never exposed
to the browser; the feature returns `503` and the UI falls back to the deterministic explanation when
unset).

## 4. Optional: Start The Indexer

```bash
AGENT_REGISTRY=0x...
POLICY_REGISTRY=0x...
ACTION_ATTESTATION=0x...
AUTO_SYNC=true
SYNC_INTERVAL_MS=60000
pnpm indexer
```

Then set this for the web app:

```bash
NEXT_PUBLIC_INDEXER_URL=<recorder_api_url>
```

The dashboard still works without the indexer, but the indexer gives persistent event history and faster reads. If `INDEXER_DB_PATH` is omitted, storage is scoped to the current `ACTION_ATTESTATION` address so older deployments do not pollute the Flight Recorder.

## 5. Basic SDK Flow

```ts
const decision = await firewall.checkAction({
  agentId: 1n,
  policyId: 1n,
  tx: {
    to: agentRegistryAddress,
    value: 0n,
    data: depositCalldata,
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
```

## 6. Where To Integrate

Call Interlock Firewall immediately before an agent-controlled transaction is sent:

```text
LLM/tool planner -> proposed tx -> firewall.checkAction -> sendTransaction or block
```

Do not let the LLM directly decide whether a transaction is safe. The LLM can propose an action; the firewall decides whether the action fits the policy.
