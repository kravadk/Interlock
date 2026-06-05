# Demo Runbook

This runbook is the exact path for recording or presenting Interlock Firewall in under 3 minutes.

## 1. Goal

Show that Interlock Firewall is not another AI wallet. It is the safety layer a developer calls before an autonomous agent moves funds.

Core demo message:

```text
Agent proposes transaction -> Firewall simulates and checks policy -> ALLOW or BLOCK -> decision is recorded on Mantle -> dashboard shows agent history.
```

## 2. Pre-Demo Checklist

Run the full local gate:

```bash
pnpm smoke:all
```

For live Mantle Sepolia demo:

```bash
pnpm deploy:mantle-sepolia
pnpm live:readiness
pnpm live:smoke
pnpm submission:bundle:live
```

Required live artifacts:

- `deployments/mantle-sepolia/latest.json`;
- `deployments/mantle-sepolia/latest.env`;
- `deployments/mantle-sepolia/summary.md`;
- `submission/interlock-firewall-submission.md`;
- at least one `ALLOW` and one `BLOCK` attestation visible in Flight Recorder.

## 3. Local Dry Run

Use this before recording to prove the product works without spending gas:

```bash
pnpm smoke:examples
pnpm web:smoke
pnpm demo
```

Expected demo output:

- safe deposit returns `ALLOW / POLICY_PASSED`;
- overspend returns `BLOCK / VALUE_LIMIT_EXCEEDED`;
- dashboard smoke confirms `Policy Editor`, `Selector`, and `Flight Recorder`.

## 4. Live Setup

Start the indexer with deployment env:

```bash
pnpm indexer:live
```

Start the dashboard:

```bash
pnpm web:live
```

Or start both services in one terminal:

```bash
pnpm live:demo
```

Open:

```text
http://127.0.0.1:3000
```

Before recording:

- connect wallet;
- switch to Mantle Sepolia;
- confirm `AgentRegistry`, `PolicyRegistry`, and `ActionAttestation` are non-zero;
- confirm indexer health is visible or click `Sync indexer`;
- keep Mantlescan open for the `ActionChecked` transaction.

Check both live services from the terminal:

```bash
pnpm live:services
```

## 5. Three-Minute Script

### 0:00-0:20 - Problem

Say:

> Agent SDKs can give AI agents wallets and tools, but the dangerous part is what happens right before `sendTransaction`. Today every team has to write custom guardrails.

Show:

- README one-liner or dashboard title.

### 0:20-0:45 - Product Positioning

Say:

> Interlock Firewall is a pre-flight security layer. The agent can propose a transaction, but the firewall decides whether it fits policy.

Show:

- SDK snippet or Developer Integration panel.

### 0:45-1:20 - Policy

Say:

> The developer registers an agent and assigns a policy: allowed contracts, allowed selectors, max native value, max slippage, and active state.

Show:

- Agent profile.
- Policy Editor.
- Allowed target and selector rows.

### 1:20-1:55 - Safe Action

Action:

- run safe `AgentRegistry.getAgent`;
- show simulation and policy checks;
- record attestation.

Say:

> This action passes because the target and selector are allowlisted, value is below the limit, and simulation succeeds.

Expected:

- `ALLOW`;
- `POLICY_PASSED`;
- reputation `allowedActions` increases.

### 1:55-2:25 - Risky Action

Action:

- run unknown target or overspend action;
- record blocked decision.

Say:

> The agent still proposed a transaction, but the firewall blocked it before execution and recorded the reason.

Expected:

- `BLOCK`;
- `TARGET_NOT_ALLOWED` or `VALUE_LIMIT_EXCEEDED`;
- reputation `blockedActions` increases.

### 2:25-2:50 - On-Chain Audit Trail

Show:

- Flight Recorder.
- Mantlescan link.
- calldata hash and simulation hash.

Say:

> The important part is that the behavior history is not a self-claimed agent score. It is backed by on-chain decision events.

### 2:50-3:00 - Close

Say:

> We are not building another AI wallet. We are building the safety layer that any AI wallet, trading agent, RWA agent, or payment agent on Mantle can call before moving funds.

## 6. CLI Backup Demo

If browser wallet or dashboard writes fail, use the CLI path:

```bash
pnpm with-env --env-file deployments/mantle-sepolia/latest.env pnpm cli:built policy-check --policy-id <real_policy_id> --target 0xVault... --selector 0xd0e30db0
pnpm with-env --env-file deployments/mantle-sepolia/latest.env pnpm cli:built preflight --agent-id <real_agent_id> --policy-id <real_policy_id> --to 0xVault... --value 0 --data 0xd0e30db0
pnpm with-env --env-file deployments/mantle-sepolia/latest.env pnpm cli:built history --agent-id <real_agent_id> --from-block 0
```

Use `pnpm live:smoke` as the strongest backup path because it creates a full safe/block flow on deployed contracts.

## 7. What Not To Show

Do not spend demo time on:

- full tokenomics;
- multichain plans;
- RWA document workflows;
- ZK roadmap;
- building a new wallet;
- real trading performance.

Keep the focus on controlled autonomy before execution.

## 8. Judge Questions

**Why not just use AgentKit or GOAT?**
They give agents tools and wallets. Interlock Firewall sits before execution and enforces policy, simulation, attestations, and history.

**Why on-chain?**
Policy and decision history should be independently inspectable. Reputation should come from actual recorded actions, not a dashboard-only score.

**Why Mantle?**
Mantle is pushing agentic AI and on-chain finance. This is reusable infrastructure for that whole surface: trading, RWA, payments, and wallets.

**Is this production security?**
No. It is an experimental MVP with explicit limitations. The value is the architecture, integration path, and live proof of pre-flight enforcement.

## 9. Recording Checklist

Before final video:

- close unrelated tabs;
- zoom browser to readable size;
- keep terminal font readable;
- show only one safe and one risky scenario;
- keep the SDK snippet visible for developer credibility;
- show one explorer link;
- end with Flight Recorder and the one-line positioning.
