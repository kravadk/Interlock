# DoraHacks Requirements Audit

Source checked on 2026-05-29:

- Official requirements page: https://dorahacks.io/hackathon/mantleturingtesthackathon2026/requirements-&-criteria
- Official competition page: https://dorahacks.io/hackathon/mantleturingtesthackathon2026/detail
- Public summary mirror: https://www.competehub.dev/en/competitions/dorahacksmantleturingtesthackathon2026

This audit maps Interlock Firewall against the current DoraHacks requirements for The Turing Test Hackathon 2026.

## Recommended Submission Position

- Primary track: `AI DevTools`
- Secondary track: `Agentic Wallets & Economy`
- Do not submit as `AI x RWA` unless a real RWA policy pack or RWA workflow is added.
- Do not submit as the Byreal-specific Agentic Economy first-prize path unless the project integrates at least one of Byreal Agent Skills, Byreal Perps CLI, or RealClaw.

`AI DevTools` is the strongest fit because the official track description includes Mantle-specific audit assistants. Interlock Firewall is a Mantle-specific pre-flight audit, policy, simulation, and attestation layer for agent transactions.

## Official Criteria Summary

### Grand Champion

Scoring:

| Dimension | Weight | Interlock Fit |
| --- | ---: | --- |
| Technical Depth | 30% | Strong: Solidity contracts, SDK, CLI, indexer, dashboard, live Mantle Sepolia deployment. |
| Innovation | 25% | Strong: policy and on-chain accountability layer before AI-agent execution. |
| Mantle Ecosystem Contribution | 25% | Strong: reusable infrastructure for Mantle AI agents and agentic wallets. |
| Product Completeness | 20% | Partially complete until public links and final video are added. |

Requirements:

| Requirement | Status | Evidence |
| --- | --- | --- |
| Must be deployed on Mantle Network | Pass | Mantle Sepolia deployment in `deployments/mantle-sepolia/latest.json`. |
| Submit open-source repo | Not yet final | Codebase exists locally with MIT license, but final public GitHub URL is still missing from `submission/interlock-firewall-submission.md`. |
| Submit runnable demo | Partial | Public dashboard is live at `https://mantle-nine-beta.vercel.app`; final demo video URL still must be added for submission. |
| Submit project pitch | Pass | `submission/interlock-firewall-submission.md`, `docs/pitch.md`, and `docs/submission-package.md`. |
| Must be nominated from at least one track | Ready, manual | Submission docs specify AI DevTools + Agentic Wallets & Economy; the track still must be selected in DoraHacks UI. |

## Track Fit

### AI DevTools

Status: good fit.

Why:

- The project is a developer-facing SDK/API/CLI/dashboard.
- It acts as a Mantle-specific audit and policy assistant for autonomous agent transactions.
- It uses Mantle Sepolia contracts and Mantle RPC as core infrastructure, not as a superficial add-on.

Best submission framing:

> Interlock Firewall is a Mantle-native pre-flight audit and policy layer for AI-agent transactions. Developers call it before `sendTransaction` to simulate actions, enforce policies, and record allow/block decisions on-chain.

### Agentic Wallets & Economy

Status: acceptable secondary fit, not the strongest first-prize path yet.

Why:

- The project is directly useful to agentic wallets and wallet-connected agents.
- It does not currently integrate Byreal Agent Skills, Byreal Perps CLI, or RealClaw, which are explicitly required for the Byreal-supported Agentic Economy path.

If targeting this track seriously, add a Byreal adapter or policy pack before final submission.

### Alpha & Data

Status: not recommended.

Reason: Interlock Firewall is not primarily a Mantle alpha/data analytics tool.

### AI x RWA

Status: not recommended for the current version.

Reason: the product can support RWA agents later, but the current implementation does not involve a concrete RWA asset or workflow.

## Best UI/UX Award

Requirements:

| Requirement | Status | Evidence |
| --- | --- | --- |
| Runnable frontend interface | Pass | Hosted dashboard at `https://mantle-nine-beta.vercel.app`; browser QA verifies the developer-console panels and Judge Demo mode. |
| Demo video or publicly accessible link | Partial | Hosted dashboard is live; `docs/demo-video-script.md` exists, but final demo video URL is still missing. |

## 20 Project Deployment Award

This award is stricter than the normal track submission.

| Requirement | Status | Evidence / Gap |
| --- | --- | --- |
| Smart contract deployed on Mantle Mainnet or Testnet | Pass | Mantle Sepolia contracts deployed. |
| Contract verified on Mantle Explorer | Fail | `pnpm contracts:verification-status -- --no-fail` currently reports 0/3 verified and `similar match only` for all three core contracts. Verification must be completed for all submitted contracts. |
| At least one AI-powered function callable on-chain | Partial | `ActionAttestation.recordAction` records AI-agent pre-flight decisions on-chain, but the final demo should make the AI-agent/tool-call source explicit. |
| Frontend demo publicly accessible, not localhost | Pass | Hosted dashboard is live at `https://mantle-nine-beta.vercel.app`. |
| Deployment address included in DoraHacks submission | Ready, manual | Addresses are in `deployments/mantle-sepolia/summary.md`; they must be pasted into DoraHacks. |
| Demo video >= 2 minutes | Fail | Script exists; final video has not been recorded/uploaded. |
| Open-source GitHub repo with README, setup, architecture, deployed address | Not yet final | README is ready locally, but public GitHub URL is missing. |

Verdict: Interlock Firewall is not yet eligible for the 20 Project Deployment Award until explorer verification, public GitHub URL, and demo video are done. The public dashboard requirement is now satisfied.

## Current Verdict

For a normal AI DevTools / Grand Champion submission, the project is technically close and the core product requirements are substantially implemented:

- Mantle Sepolia deployment exists.
- Runnable local and hosted dashboard demos exist.
- Pitch and docs exist.
- SDK, CLI, indexer, dashboard, examples, and smoke tests exist.
- Track fit is clear.

The submission is not formally complete yet because the DoraHacks-facing repository/video links are still missing:

- public GitHub repository URL;
- demo video URL;
- final track selection in DoraHacks UI.

For the 20 Project Deployment Award, additional blockers remain:

- verify contracts on Mantle Explorer;
- keep the hosted frontend URL working through final judging;
- record/upload a video of at least 2 minutes;
- ensure the submission explicitly includes the deployment addresses;
- make the AI-agent/tool-call source obvious in the demo.

## Final Submission Checklist

1. Push the repo to a public GitHub repository.
2. Verify `AgentRegistry`, `PolicyRegistry`, and `ActionAttestation` on Mantlescan, then confirm with `pnpm contracts:verification-status`.
3. Keep the dashboard hosted and, if needed, host the indexer API for public Flight Recorder history.
4. Record a 2-3 minute demo video using `docs/demo-video-script.md`.
5. Regenerate the submission bundle with final URLs:

```bash
pnpm submission:bundle:live -- --repo-url <PUBLIC_GITHUB_URL> --dashboard-url https://mantle-nine-beta.vercel.app --demo-video-url <DEMO_VIDEO_URL>
```

6. Run the final DoraHacks gate:

```bash
pnpm submission:doctor:final
```

7. Paste into DoraHacks:

- one-line pitch;
- GitHub URL;
- demo video URL;
- public dashboard/demo URL;
- Mantle Sepolia contract addresses;
- primary track `AI DevTools`;
- secondary track `Agentic Wallets & Economy` only if selecting two tracks is still desired.
