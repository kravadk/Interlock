# Interlock Docs

Interlock is a Mantle-native safety and benchmark control plane for autonomous AI agents.

Core flow:

```text
agent proposes action -> pre-flight policy + simulation -> allow/block -> on-chain evidence -> recorder/API -> analytics + safety card
```

## Start Here

- [Getting Started](getting-started.md) - shortest path to run the dashboard, indexer, and CLI.
- [Product Logic](product-logic.md) - what Interlock is for, who uses it, and what each product surface does.
- [Dashboard Behavior](dashboard-behavior.md) - every tab, action, empty state, loading state, and error state.
- [Common Mistakes](common-mistakes.md) - wrong chain, stale policy, selector-only calldata, indexer delay, and other dev pitfalls.

## Integrate

- [Integration Guide](integration-guide.md) - SDK-first integration path.
- [API Reference](api-reference.md) - SDK classes, policy packs, and typed helpers.
- [REST API](rest-api.md) - backend preflight/record API shape.
- [CLI](cli.md) - terminal setup, doctor, policy, preflight, benchmark, history, and analytics commands.
- [MCP](mcp.md) - agent-native tools for Claude/Cursor/Codex-style runtimes.
- [Adapters](adapters.md) - raw Viem, backend automation, AgentKit-style, GOAT-style, and generic agent framework examples.
- [Byreal / RealClaw Adapter](byreal-realclaw-adapter.md) - compatibility path for RealClaw/OpenClaw-style skill-proposed Mantle actions.

## Operate

- [Recorder Service and API](indexer.md) - indexer storage, sync, pagination, filters, analytics, webhooks, and deployment notes.
- [Analytics](analytics.md) - allowed/blocked/failure metrics and reason-code analysis.
- [Webhooks](webhooks.md) - signed delivery for blocked/allowed/simulation-failed events.
- [Observability](observability.md) - health, status, metrics, headers, rate limits, and monitoring.
- [Environment](environment.md) - required and optional env variables.

## Contracts And Security

- [Contracts](contracts.md) - core and optional contracts.
- [Threat Model](threat-model.md) - what the current Dev Alpha protects and what it does not.
- [Audit Readiness](audit-readiness.md) - current audit evidence, static-analysis notes, and mainnet blockers.
- [Mainnet Runbook](mainnet-runbook.md) - future deployment, verification, key rotation, rollback, and incident steps.
- [Limitations](limitations.md) - explicit non-goals and production security disclaimers.

## Mantle Hackathon

- [Mantle Turing Test Product Analysis](mantle-turing-test-product-analysis.md) - phase plan and ecosystem positioning.
- [Mantle Ecosystem Packs](mantle-ecosystem-packs.md) - policy pack templates by track/use case.
- [Benchmark Arena](benchmark-arena.md) - safety scenarios and evidence scoring.
- [Pitch](pitch.md) - concise judge-facing positioning.
- [Demo Runbook](demo-runbook.md) and [Demo Video Script](demo-video-script.md) - final presentation flow.
- [Submission Readiness](submission-readiness.md) and [DoraHacks Requirements Audit](dorahacks-requirements-audit.md) - final checks.

## Ship

- [Testing](testing.md) - automated, browser, coverage, security, and CI gates.
- [Package Release Readiness](package-release.md) - `release:check`, tarballs, checksums, dry-run publishing.
- [Ship Runbook](ship-runbook.md) - final pre-submit sequence.
- [Hosting](hosting.md) - dashboard and recorder hosting guidance.
- [Deployment](deployment.md) - Mantle Sepolia deployment flow.
