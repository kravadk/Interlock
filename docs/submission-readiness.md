# Submission Readiness

This checklist is the final gate before presenting Interlock Firewall as a developer product, not just a demo.

## 1. Product Claim

Interlock Firewall should be presented as:

> A Mantle-native pre-flight security layer for autonomous AI agents: simulate, enforce policy, record decisions on-chain, and expose agent behavior history.

Do not pitch it as a full wallet, trading bot, generic scanner, or production audit product. The focused product is the layer a developer calls immediately before an agent-controlled `sendTransaction`.

## 2. Required Developer Artifacts

The repo is ready for a developer-facing submission only when these artifacts exist and are usable:

- contracts for agent identity, policy registry, action attestations, and demo targets;
- TypeScript SDK with `checkAction`, `recordDecision`, `guardedSendTransaction`, policy packs, and adapters;
- CLI for setup, policy import/apply/audit, preflight, record, history, and doctor checks;
- indexer with persistent event history and HTTP read endpoints;
- dashboard with policy maintenance, action review, and Flight Recorder;
- examples for raw Viem, agent-framework integration, backend automation, and preflight API routes;
- docs for getting started, integration, API, deployment, policies, threat model, and limitations.
- demo runbook for the 3-minute presentation flow.

Run the static readiness doctor:

```bash
pnpm submission:doctor
```

Generate the final Markdown submission bundle:

```bash
pnpm submission:bundle
```

For final live submission mode, require a Mantle Sepolia deployment manifest:

```bash
pnpm submission:doctor:live
pnpm submission:bundle:live -- --repo-url <PUBLIC_GITHUB_URL> --dashboard-url https://mantle-nine-beta.vercel.app --demo-video-url <DEMO_VIDEO_URL>
```

For final DoraHacks submission, after generating the bundle with public URLs, run:

```bash
pnpm submission:doctor:final
```

This final gate requires a public GitHub repository URL, public dashboard URL, and demo video URL in `submission/interlock-firewall-submission.md`. The dashboard URL is already available at `https://mantle-nine-beta.vercel.app`; the remaining external fields are the public GitHub repository URL and the uploaded demo video URL.

## 3. Verification Gate

Before recording a demo or submitting the repo, run:

```bash
pnpm check
pnpm test
pnpm security:slither
pnpm security:adversarial
pnpm smoke:all
pnpm browser:qa
pnpm submission:doctor
pnpm submission:bundle
```

After deployment, run:

```bash
pnpm deploy:preflight
pnpm deploy:mantle-sepolia
pnpm deployment:manifest:doctor
pnpm live:readiness
pnpm live:verify
pnpm contracts:verification-status
pnpm live:adversarial
pnpm deployment:report -- --manifest deployments/mantle-sepolia/latest.json --out deployments/mantle-sepolia/summary.md
pnpm live:smoke
pnpm live:demo:check
pnpm live:services
pnpm browser:qa
pnpm screenshots:capture
pnpm submission:doctor:live
pnpm submission:bundle:live
```

`pnpm smoke:all` is the canonical local gate that mirrors the GitHub Actions smoke step. It checks docs links, submission readiness, submission bundle tests, package exports, packed tarballs, external consumer install, examples, production dashboard HTTP smoke, deployment manifest doctor/env tests, live demo script invariants, local contracts, and CLI doctor output.

## 4. Live Demo Definition

A strong live demo should show the complete developer flow:

```text
register agent
  -> create or import policy
  -> agent proposes safe action
  -> firewall simulates and allows
  -> action is recorded on-chain
  -> agent proposes risky action
  -> firewall blocks with reason code
  -> dashboard shows both decisions in Flight Recorder
```

Minimum scenarios:

- `ALLOW / POLICY_PASSED` for an allowlisted `AgentRegistry.getAgent` call.
- `BLOCK / TARGET_NOT_ALLOWED` for an unknown target.
- `BLOCK / VALUE_LIMIT_EXCEEDED` for overspend.

The demo should begin from Start Here or Judge Demo mode, include an explorer link for at least one `ActionChecked` transaction, show the dashboard Flight Recorder after indexer sync, and end with a copyable SDK or CLI integration snippet.

## 5. Submission Materials

Prepare these links or screenshots:

- GitHub repository.
- Live dashboard URL: [https://mantle-nine-beta.vercel.app](https://mantle-nine-beta.vercel.app).
- Mantle Sepolia contract addresses.
- `deployments/mantle-sepolia/latest.json`.
- `deployments/mantle-sepolia/summary.md`.
- Mantlescan links for `AgentRegistry`, `PolicyRegistry`, and `ActionAttestation`.
- Contract source-verification status from `pnpm contracts:verification-status`.
- Demo video under 3 minutes.
- Demo runbook: `docs/demo-runbook.md`.
- Demo video script: `docs/demo-video-script.md`.
- Wallet QA checklist: `docs/wallet-qa-checklist.md`.
- README quick-start section.
- SDK integration snippet.
- Policy pack example.
- Flight Recorder screenshot showing allow and block records.
- Desktop screenshot: `docs/screenshots/dashboard-desktop-qa.png`.
- Mobile screenshot: `docs/screenshots/dashboard-mobile-qa.png`.
- Judge Demo screenshot: `docs/screenshots/dashboard-judge-qa.png`.
- Generated `submission/interlock-firewall-submission.md`.
- DoraHacks criteria mapping: `docs/dorahacks-requirements-audit.md`.

## 6. Demo Script

Use this concise talk track:

1. "Agent SDKs give agents wallets and tools. We give developers the safety layer before execution."
2. "The agent proposes a transaction, but it does not decide if the transaction is safe."
3. "Interlock Firewall loads the policy, simulates the call, checks target, selector, value, slippage, and returns a typed decision."
4. "Allowed and blocked decisions are recorded on Mantle as attestations, so agent behavior is independently inspectable."
5. "Developers can integrate it with a small SDK call or operate it from CLI/CI."

## 7. What Not To Add Before Submission

Avoid adding broad features that dilute the product:

- full account abstraction wallet;
- real trading strategy;
- RWA document verification;
- ZK reputation;
- x402 marketplace;
- tokenomics;
- multichain support.

These are valid roadmap items, but the submitted product should stay focused on pre-flight security for agent actions.

## 8. Final Acceptance Criteria

The project is submission-ready when:

- `pnpm check`, `pnpm test`, `pnpm smoke:all`, and `pnpm submission:doctor` pass;
- contracts are deployed to Mantle Sepolia for the live version;
- `pnpm deployment:manifest:doctor`, `pnpm live:smoke`, and `pnpm submission:doctor:live` pass after deployment;
- the dashboard can show policy maintenance and Flight Recorder data;
- at least one safe and one risky action are visible in the on-chain action history;
- README tells a developer how to install, verify, run, and integrate the SDK;
- the pitch stays focused on "controlled autonomy for on-chain agents."

For the separate DoraHacks 20 Project Deployment Award, also verify every required item in `docs/dorahacks-requirements-audit.md`. The hosted dashboard requirement is satisfied. The remaining external blockers are Mantlescan source verification, public GitHub URL, and final demo video.
