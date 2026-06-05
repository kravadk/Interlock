# Examples

This document tracks example projects and what each one proves.

## Raw Viem

Path:

```text
examples/raw-viem
```

Run:

```bash
pnpm --filter @interlock/example-raw-viem demo
```

Purpose:

- show direct SDK usage;
- show allow/block shape;
- avoid framework-specific assumptions.

## Agent Demo

Path:

```text
apps/agent-demo
```

Run:

```bash
pnpm demo
AGENT_ID=<real_agent_id> POLICY_ID=<real_policy_id> pnpm agent:benchmark
RECORD_DECISIONS=true PRIVATE_KEY=0x... AGENT_ID=<real_agent_id> POLICY_ID=<real_policy_id> pnpm agent:benchmark
```

Purpose:

- run the default Interlock benchmark suite from an agent-runtime entrypoint;
- show safe read, unknown target, overspend, and high-slippage scenarios;
- output a judge-ready JSON report with dashboard and `/agent/:id` links.

## Backend Automation

Path:

```text
examples/backend-automation
```

Run:

```bash
pnpm --filter @interlock/example-backend-automation demo
```

Purpose:

- show a worker/cron style integration;
- show safe, overspend and unknown-target outcomes;
- prove that backend automation can stop before execution.

## Preflight API

Path:

```text
examples/preflight-api
```

Run:

```bash
pnpm --filter @interlock/example-preflight-api demo
```

Purpose:

- show the backend API route pattern;
- prove that agent-proposed JSON can be normalized into a typed allow/block/error response;
- demonstrate optional on-chain decision recording without requiring the endpoint to execute the transaction.

## Agent Framework Adapter

Path:

```text
examples/agent-framework
```

Run:

```bash
pnpm --filter @interlock/example-agent-framework demo
```

Purpose:

- show the framework integration pattern;
- prove that `tool.execute` only runs after an allowed firewall decision;
- map cleanly to GOAT, AgentKit, LangChain, Vercel AI SDK or custom agent runtimes.

## GOAT-Style Adapter

Path:

```text
examples/goat-adapter
```

Run:

```bash
pnpm --filter @interlock/example-goat-adapter demo
```

Purpose:

- show a GOAT-style tool producing a proposed transaction;
- prove Interlock can wrap the tool without a smart-account migration;
- keep execution blocked unless the firewall returns `ALLOW`.

## AgentKit-Style Adapter

Path:

```text
examples/agentkit-adapter
```

Run:

```bash
pnpm --filter @interlock/example-agentkit-adapter demo
```

Purpose:

- show an AgentKit-style action provider preparing a transaction;
- prove Interlock can sit between action provider and wallet execution;
- keep AgentKit responsible for tools/wallets while Interlock handles policy and attestations.

## Byreal / RealClaw Adapter

Path:

```text
examples/byreal-realclaw-adapter
```

Run:

```bash
pnpm --filter @interlock/example-byreal-realclaw-adapter demo
```

Purpose:

- show how a RealClaw/OpenClaw-style skill-proposed transaction can call Interlock first;
- normalize skill action JSON into `AgentAction`;
- avoid fake protocol addresses by requiring teams to pass real targets for real strategy integration.

## CLI

Run:

```bash
pnpm cli -- help
pnpm cli -- preset --name conservative-defi --target 0xe4dfef03e107225f2239cfff955a378a9a8158be --max-native 0.02
```

Purpose:

- support backend automation;
- support CI gates;
- allow devs to run preflight without writing code.

## Planned Examples

### LangChain / Vercel AI SDK

Use case:

```text
LLM tool call -> check-only firewall tool -> deterministic execution code
```

## Acceptance For Every Example

Each example should include:

- README;
- `.env.example`;
- runnable script;
- safe action;
- blocked action;
- expected console output;
- no private key committed;
- `pnpm check` or equivalent compile check.
