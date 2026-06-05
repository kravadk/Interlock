# Product Logic

This document explains Interlock Firewall as an end product, not only as a hackathon demo.

## 1. Simple Definition

Interlock Firewall is a developer tool for teams that let AI agents propose on-chain actions.

It sits between the agent and the wallet:

```text
AI agent proposes transaction
  -> Interlock Firewall checks it
  -> allowed transaction can be sent
  -> blocked transaction never reaches execution
  -> every decision is recorded and visible
```

The product is not "an AI wallet". It is the safety and accountability layer that another AI wallet, trading bot, RWA agent, or automation backend calls before `sendTransaction`.

## 2. Who It Is For

Primary users:

- developers building AI agents that can call blockchain tools;
- teams using Viem, custom backend workers, AgentKit-style agents, GOAT-style tools, or agent frameworks;
- Mantle teams building trading agents, payment agents, RWA agents, portfolio agents, or agentic wallets;
- hackathon judges evaluating whether an agent is safe enough to run on-chain.

Secondary users:

- protocol teams that want to see what an agent has been allowed to do;
- wallet builders that need a policy and attestation layer before execution;
- auditors reviewing an agent's historical decisions.

## 3. The Pain

Without Interlock Firewall, an AI-agent developer usually has to build these pieces by hand:

- restrict which contracts an agent can call;
- restrict which functions/selectors it can call;
- limit how much native value it can spend;
- simulate a transaction before execution;
- block malformed calldata or unsupported actions;
- explain why something was blocked;
- keep an auditable history of agent decisions;
- show that history to users, judges, or future integrators.

The dangerous moment is not when the agent writes text. The dangerous moment is when a model, strategy engine, or tool planner produces a transaction and the runtime is about to send it.

Interlock Firewall controls that moment.

## 4. GitLab-Like Mental Model

The easiest analogy is GitLab CI/CD, but for autonomous on-chain actions.

| GitLab / software workflow | Interlock Firewall workflow |
| --- | --- |
| Developer opens a merge request | Agent proposes a transaction |
| CI validates code | Firewall validates calldata, target, value, policy, and simulation |
| Branch protection blocks unsafe merges | Policy blocks unsafe agent actions |
| Reviewer can inspect pipeline logs | Developer can inspect Policy Checks and simulation result |
| Merge is allowed only if checks pass | Transaction is sent only if decision is `ALLOW` |
| Audit log records who merged what | ActionAttestation records allow/block decisions on Mantle |
| Project dashboard shows pipeline history | Flight Recorder shows agent action history |

So the product promise is:

> Give autonomous agents a CI/CD gate before they move funds.

This makes the product easier to understand: we are not asking developers to trust the agent. We give them a repeatable pre-flight gate with policy, simulation, and an audit log.

## 5. What Should Exist At The End

The finished product should have six working surfaces.

### 5.1 SDK

The SDK is the main product.

A developer installs it and wraps the risky part of their agent runtime:

```ts
const decision = await firewall.checkAction({
  agentId,
  policyId,
  tx: {
    to,
    value,
    data,
  },
  metadata: {
    intent: "Agent wants to deposit into approved vault",
    expectedSlippageBps: 30,
  },
});

if (!decision.allowed) {
  return { blocked: true, reason: decision.reasonCode };
}

const executionTxHash = await walletClient.sendTransaction(decision.tx);
await firewall.recordDecision({ ...decision, executionTxHash });
```

What the SDK must provide:

- typed input validation;
- `checkAction`;
- `recordDecision`;
- `guardedSendTransaction`;
- helpers for calldata generation;
- stable typed errors;
- clear reason codes;
- integration examples.

### 5.2 REST / Preflight API

Some teams will not put blockchain logic directly in the agent runtime. For them, Interlock should provide a backend path:

```text
agent backend -> POST /preflight -> ALLOW/BLOCK response
agent backend -> POST /record -> on-chain attestation
```

This is useful for teams that run agents in Python, LangChain, OpenAI tools, Vercel AI SDK, or a custom backend.

### 5.3 CLI

The CLI is for setup, debugging, CI, and demos.

It should answer questions like:

- is my RPC pointed at Mantle Sepolia?
- do the deployed contracts have bytecode?
- does my policy include this target?
- would this transaction be allowed?
- what decisions has this agent recorded?

The CLI is the developer's "doctor" and "debugger".

### 5.4 Dashboard

The dashboard is a developer console.

It should not be a landing page and should not use fake data. It should show the current state of a real deployment.

It needs these panels:

#### Agent Profile

Shows what agent is selected and what it has done.

Must show:

- agent id;
- owner address;
- metadata URI;
- allowed / blocked / failed counters;
- wallet connection status;
- indexer status;
- latest indexed action;
- links to Mantlescan where relevant.

What the user learns:

> This agent exists on Mantle, has this owner, and has this decision history.

#### Policy Editor

Shows what this agent is allowed to do.

Must show:

- policy id;
- policy owner;
- active / inactive state;
- max native value;
- max slippage bps;
- allowed targets;
- allowed selectors;
- create/update buttons;
- Mantlescan links for configured contracts.

What the user learns:

> The agent is constrained by rules that are visible and editable by the policy owner.

#### Action Review

Shows a proposed transaction before it is executed.

Must show:

- target address;
- native value;
- full calldata, not only selector;
- expected slippage;
- simulation result;
- final decision badge: `ALLOW` or `BLOCK`;
- reason code;
- human-readable explanation;
- record attestation button when a wallet is connected.

What the user learns:

> The agent proposed this exact transaction, and the firewall made this exact decision before execution.

#### Policy Checks

Explains why the decision happened.

Must show:

- policy active;
- target allowlisted;
- selector allowlisted;
- value within limit;
- slippage within limit;
- simulation success/failure;
- invalid input status when applicable.

What the user learns:

> The decision is deterministic and debuggable, not a black box.

#### Flight Recorder

Shows on-chain decision history.

Must show:

- action id or row number;
- decision;
- reason code;
- target;
- transaction hash;
- timestamp/block;
- Mantlescan link;
- indexer sync state.

What the user learns:

> The allow/block history is not just UI state. It is recorded on Mantle and indexed for inspection.

#### Developer Integration

Shows how to copy the current flow into code.

Must show:

- SDK snippet using current agent/policy/action;
- REST snippet;
- CLI equivalent command;
- contract addresses;
- RPC and indexer URLs;
- environment variables required.

What the user learns:

> I can integrate this in my own agent runtime without reverse-engineering the demo.

### 5.5 Indexer

The indexer makes the dashboard and external reads fast.

It reads Mantle events from:

- `AgentRegistry`;
- `PolicyRegistry`;
- `ActionAttestation`.

It exposes:

- agents;
- policies;
- allowlists;
- action history;
- stats;
- health and sync state.

### 5.6 Contracts

The contracts provide the verifiable layer.

Current core contracts:

- `AgentRegistry`: identity and reputation counters;
- `PolicyRegistry`: policy ownership and rules;
- `ActionAttestation`: allow/block decision events;
- demo target contracts only for local/test flows.

The contracts should not store full LLM traces or large simulation output. They should store compact, verifiable references: hashes, decisions, reason codes, counters, and ownership.

## 6. End-To-End Product Flow

### Setup Flow

```text
1. Developer opens dashboard or CLI.
2. Developer registers an agent.
3. Developer creates a policy.
4. Developer allowlists contracts and selectors.
5. Developer sets spend/slippage limits.
6. Agent runtime receives agentId and policyId.
```

After setup, the agent is not free to call anything. It has a policy boundary.

### Runtime Flow

```text
1. Agent proposes transaction.
2. Runtime calls Interlock SDK/API before sending.
3. Firewall validates input shape.
4. Firewall loads policy from Mantle.
5. Firewall simulates the transaction over Mantle RPC.
6. Firewall checks policy rules.
7. Firewall returns typed decision.
8. If BLOCK: app does not send tx and can record block decision.
9. If ALLOW: app sends tx and records decision.
10. ActionAttestation emits event.
11. AgentRegistry counters update.
12. Indexer syncs event.
13. Dashboard shows the Flight Recorder row.
```

### Safe Path Example

```text
Agent: "Read my own registered agent profile."
Target: AgentRegistry
Selector: getAgent(uint256)
Value: 0
Simulation: success
Policy: target + selector allowed
Decision: ALLOW / POLICY_PASSED
Result: optional execution + attestation recorded
```

### Blocked Path Example

```text
Agent: "Send 5 MNT to an unknown contract."
Target: unknown
Selector: unknown
Value: above policy limit
Simulation: irrelevant or failed
Policy: target not allowed / value too high
Decision: BLOCK / TARGET_NOT_ALLOWED or VALUE_LIMIT_EXCEEDED
Result: no execution, block decision recorded
```

## 7. What The Demo Should Show

The demo should be simple and repeatable:

1. "Here is a registered agent."
2. "Here is the policy that limits what this agent can do."
3. "The agent proposes a safe action."
4. "Firewall simulates it, checks policy, and allows it."
5. "The decision is recorded on Mantle."
6. "The agent proposes a risky action."
7. "Firewall blocks it with a clear reason."
8. "Flight Recorder shows both actions with Mantlescan links."
9. "Developer Integration shows how another team would call this from SDK/API/CLI."

The demo should avoid broad roadmap features. The strongest story is:

> Agent autonomy is useful only when developers can constrain it, inspect it, and prove what happened.

## 8. Why This Needs Blockchain

The policy engine can run off-chain, but the accountability layer should be on-chain because:

- agent identity should be publicly inspectable;
- policy ownership should be verifiable;
- allow/block decisions should not be editable later;
- reputation counters should be based on recorded behavior;
- judges and integrators can verify the same history independently.

The chain is not used to run the whole AI system. It is used to anchor the agent's operational history.

## 9. What It Is Not

Interlock Firewall is not:

- a wallet;
- a trading bot;
- a universal scam detector;
- a full smart-account system;
- an ERC-4337 account implementation;
- a full audit product;
- a complete reputation protocol;
- proof that an allowlisted protocol is economically safe.

It is a deterministic gate before agent transaction execution.

## 10. Product Completion Definition

The project is "finished enough for developers" when a new developer can do this in under 15 minutes:

1. clone the repo;
2. read the README;
3. run the dashboard or CLI;
4. register an agent on Mantle Sepolia;
5. create a policy;
6. run one allowed action and one blocked action;
7. inspect both in Flight Recorder;
8. copy the SDK snippet into their own agent runtime.

The project is "finished enough for DoraHacks final submission" when:

1. repo is public on GitHub;
2. dashboard is publicly accessible;
3. demo video is uploaded;
4. contracts are deployed on Mantle Sepolia;
5. submission bundle contains final URLs;
6. `pnpm submission:doctor:final` passes.

The project is "finished enough for production claims" only after:

1. production recorder authorization or multi-attestor operations;
2. replay protection reviewed beyond the Dev Alpha nonce/deadline model;
3. action execution/result recording if production users need proof beyond pre-flight evidence;
4. policy ownership transfer;
5. emergency deactivate path;
6. fuzz/property tests;
7. full static analysis;
8. external audit.
