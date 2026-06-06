# Submission Package

This file is the judge-facing package map for Interlock Firewall.

## Core Pitch

Interlock Firewall is a Mantle-native pre-flight security layer for autonomous AI agents. It validates agent-proposed transactions, simulates them over Mantle Sepolia RPC, enforces developer-defined policies, records allow/block decisions on-chain, and exposes indexed behavior history.

The practical analogy is GitLab CI/CD for autonomous on-chain actions: the agent proposes a transaction, the firewall runs deterministic checks, only approved actions can proceed, and every decision becomes inspectable history.

## Track Fit

Primary track: `AI DevTools`

Secondary track: `Agentic Wallets & Economy`

Reason: the project is not an AI wallet itself. It is the reusable developer layer that AI wallets, trading agents, RWA agents, and payment agents call before execution.

## Live Deployment

Current Mantle Sepolia deployment is stored in:

- `deployments/mantle-sepolia/latest.json`
- `deployments/mantle-sepolia/latest.env`
- `deployments/mantle-sepolia/summary.md`

Contracts:

- `AgentRegistry`: `0xa8d6f3478b683ee674ff5a9167e6838c589162b4`
- `PolicyRegistry`: `0x16a02f6ed0d3db730fd60d5c51ec99e7825e41e0`
- `ActionAttestation`: `0x6488c92049dcbb88a442d1bbf6e94bc137faf4a3`

## Required Links For Submission Form

- Repository: add final GitHub URL.
- Demo video: add final video URL.
- Dashboard: [https://mantle-nine-beta.vercel.app](https://mantle-nine-beta.vercel.app). Use this hosted URL for the judge-facing submission. Local demo remains available at `http://127.0.0.1:3000` for recording or debugging.
- Documentation entrypoint: `README.md`.
- Product logic: `docs/product-logic.md`.
- Demo runbook: `docs/demo-runbook.md`.
- Hosting runbook: `docs/hosting.md`.
- Contract verification: `docs/contract-verification.md`.
- Wallet QA checklist: `docs/wallet-qa-checklist.md`.
- DoraHacks requirements audit: `docs/dorahacks-requirements-audit.md`.
- Generated submission bundle: `submission/interlock-firewall-submission.md`.

## Screenshots

Use the generated screenshots:

- `docs/screenshots/dashboard-desktop-qa.png`
- `docs/screenshots/dashboard-mobile-qa.png`
- `docs/screenshots/dashboard-judge-qa.png`

Regenerate them with:

```bash
pnpm screenshots:capture
```

## Demo Proof Points

The final video should show:

- Start Here readiness checklist;
- Judge Demo safe and risky scenarios;
- connected Mantle Sepolia deployment;
- selected indexed agent and policy;
- policy allowlist;
- live pre-flight result;
- Flight Recorder rows;
- at least one Mantlescan transaction link;
- SDK/CLI/AgentKit/GOAT snippets from Developer Integration;
- Mantle Ecosystem policy pack summaries.

## Verification Commands

Run before submission:

```bash
pnpm check
pnpm test
pnpm security:slither
pnpm security:adversarial
pnpm smoke:all
pnpm live:verify
pnpm live:adversarial
pnpm live:smoke
pnpm live:full-test
pnpm live:services
pnpm browser:qa
pnpm submission:doctor:live
pnpm submission:bundle:live
pnpm submission:doctor:final
```

For the actual final bundle, pass the public links explicitly:

```bash
pnpm submission:bundle:live -- --repo-url <PUBLIC_GITHUB_URL> --dashboard-url https://mantle-nine-beta.vercel.app --demo-video-url <DEMO_VIDEO_URL>
pnpm submission:doctor:final
```

`pnpm submission:doctor:final` is intentionally stricter than the live doctor. It requires the generated submission bundle to contain a public GitHub URL, public dashboard URL, and demo video URL. The dashboard URL is already set; the repository and demo video URLs remain external handoff items.

## DoraHacks Requirements Status

See `docs/dorahacks-requirements-audit.md` for the full mapping.

Short version:

- Normal `AI DevTools` submission: technically ready on the code/product side, but final public repository and video links are still required.
- Best UI/UX: hosted frontend is ready, but the final demo video URL is still required.
- 20 Project Deployment Award: not complete until contracts are verified on Mantle Explorer, a >=2 minute demo video is uploaded, and the public GitHub URL is added. The public dashboard requirement is already satisfied.

## Known Non-Production Limits

- Dev Alpha only.
- Not audited for mainnet custody.
- No production wallet-drainer detection claims.
- No complete account-abstraction wallet stack.
- Simple reputation counters, not a full trust protocol.
- Mythril symbolic execution is not currently part of the automated local gate on this Windows setup.

## Final Judge Message

Interlock Firewall turns autonomous agent execution into controlled autonomy: agents can propose actions, but policies, simulation, and on-chain accountability decide what actually gets through.
