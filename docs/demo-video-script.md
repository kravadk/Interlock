# Demo Video Script

Target length: 2:30 to 3:00.

## Setup Before Recording

```bash
pnpm indexer:live
pnpm web:live
pnpm live:services
pnpm browser:qa
```

Open:

- Hosted dashboard for the judge-facing recording: `https://mantle-nine-beta.vercel.app/app?mode=judge`
- Local fallback for debugging or wallet QA: `http://127.0.0.1:3000/app?mode=judge`
- Mantlescan ActionAttestation contract page from `deployments/mantle-sepolia/latest.json`
- README SDK usage section

Before pressing record, confirm:

- Start Here shows wallet/network/contracts/indexer/agent/policy readiness.
- Judge Demo mode is available through the toggle or `?mode=judge`.
- Action Review shows a pipeline-style result area with input validation, policy state, RPC simulation, allowlist checks, limit checks, and final decision.
- Manual agent id and policy id are filled with real Mantle Sepolia ids if the indexer is unavailable.
- Flight Recorder either shows real indexed actions or a clear indexer-unavailable state; it must not show placeholder history.
- Browser console has no app errors.

## Recording Flow

### 0:00-0:20 - Problem

Show the dashboard title or README.

Say:

> Agent SDKs can give AI agents wallets and tools, but the risky moment is right before `sendTransaction`. Today teams write custom guardrails or trust a black box.

### 0:20-0:40 - Product

Show Start Here in Judge Demo mode. If using the hosted URL above, the page opens directly in that mode.

Say:

> Interlock Firewall is the pre-flight security layer. The agent proposes a transaction, the firewall simulates it, checks policy, and returns a typed allow or block decision.

### 0:40-1:10 - Policy

Show Policy Editor or the Mantle Basic Agent pack in Mantle Ecosystem.

Say:

> The developer controls allowed targets, allowed selectors, native spend limit, slippage limit, and active state. These rules are on Mantle Sepolia and can be inspected by integrations.

### 1:10-1:45 - Safe Action

Show Action Review and run pre-flight.

Say:

> Here the proposed action matches policy. You can see the pipeline: input validation passes, the policy is active, the target and selector are allowlisted, limits pass, live RPC simulation succeeds, and the firewall returns `ALLOW / POLICY_PASSED`.

If using a pre-recorded live state, show an existing `ALLOW / POLICY_PASSED` Flight Recorder row.

### 1:45-2:15 - Risky Action

Change target to an unknown address or value above the policy limit.

Say:

> The agent can still propose the risky action, but it cannot pass pre-flight. The decision is `BLOCK`, with a specific reason code like `TARGET_NOT_ALLOWED` or `VALUE_LIMIT_EXCEEDED`.

### 2:15-2:45 - Audit Trail

Show Flight Recorder and open a Mantlescan transaction.

Say:

> Decisions are not only dashboard state. They are recorded as pre-flight decision attestations on Mantle, then indexed into the Flight Recorder.

### 2:45-3:00 - Close

Show SDK snippet.

Say:

> We are not building another AI wallet. We are building the safety layer that any AI wallet, trading agent, RWA agent, or payment agent on Mantle can call before moving funds.

If time allows, briefly show the GOAT-style or AgentKit-style adapter example in `examples/goat-adapter` or `examples/agentkit-adapter` to prove this is a developer integration layer, not only a dashboard.

## Backup CLI Flow

If wallet recording fails during the live video, use:

```bash
pnpm live:smoke
pnpm live:full-test
pnpm live:services
```

Then show the freshly indexed Flight Recorder rows in the dashboard.

## After Recording

Upload the video and regenerate the final submission bundle with the real public links:

```bash
pnpm submission:bundle:live -- --repo-url <PUBLIC_GITHUB_URL> --dashboard-url https://mantle-nine-beta.vercel.app --demo-video-url <DEMO_VIDEO_URL>
pnpm submission:doctor:final
```
