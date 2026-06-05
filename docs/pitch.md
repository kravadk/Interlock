# Pitch

## One-Liner

Interlock Control Plane is a Mantle-native safety, benchmark, and evidence layer that simulates, checks, blocks, records, and scores autonomous AI-agent transactions before execution.

## Problem

AI agents can already get wallets through tools like AgentKit and GOAT, but unrestricted agent execution is unsafe. A hallucinated transaction, bad tool call, prompt injection, or wrong target contract can move funds irreversibly.

## Insight

The future of on-chain AI is not just autonomy. It is controlled autonomy.

Agents need:

- identity;
- policy;
- simulation;
- audit trails;
- behavior-based reputation.

## Solution

Interlock gives every Mantle agent a pre-flight control plane:

```text
proposed action -> simulation -> policy decision -> on-chain attestation -> evidence -> benchmark/reputation
```

The easiest mental model is GitLab CI/CD for autonomous on-chain actions:

- agent proposal = merge request;
- policy checks = pipeline;
- allow/block = protected merge gate;
- Flight Recorder = audit log;
- Benchmark Arena = repeatable safety test suite;
- MCP server = agent-native integration path.

The developer can let an agent suggest actions without letting it bypass checks before execution.

## Demo Script

1. Show Interlock Control Plane and selected real Mantle Sepolia agent/policy.
2. Open Benchmark Arena and run safe action.
3. Pipeline shows target/selector/value/slippage/simulation checks.
4. Safe action returns `ALLOW / POLICY_PASSED`.
5. Run unknown-target or overspend scenario.
6. Interlock returns `BLOCK / TARGET_NOT_ALLOWED` or `VALUE_LIMIT_EXCEEDED`.
7. Record or inspect pre-flight attestation on Mantle.
8. Show Agent Safety Card, Flight Recorder, and MCP/SDK integration snippet.

## Why Mantle

Mantle Turing Test is about agentic AI on-chain. Interlock Firewall is infrastructure for that ecosystem: any trading, RWA, payment, or wallet agent can use it before moving funds.

## Track

Primary: AI DevTools
Secondary: Agentic Wallets & Economy

## What It Is Not

It is not another AI wallet. It is the control plane that AI wallets, Byreal/RealClaw-style skills, GOAT/AgentKit tools, and custom Mantle agents can call before execution.
