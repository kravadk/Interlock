# @interlock/web

The Interlock dashboard — landing front-door + control plane for the pre-flight firewall on
**Mantle Sepolia** (Next.js 15 / React 19, m2 dark design system).

## Routes

| Route | What |
| --- | --- |
| `/` | Marketing landing — what the firewall is, how it works, live indexer stats, **Launch app**. |
| `/app` | The authenticated control plane (8 tabs: Dashboard, Agents, Policies, Preflight, Benchmark, **Agent Demo**, Recorder, Analytics, Integrate). |
| `/agent/[id]` | Public, read-only agent safety card. |
| `/api/health` | JSON health: configured contracts, server-key **presence** booleans, indexer reachability. |
| `/api/ai` | Advisory AI layer (Anthropic) — explain decisions, draft policies, summarize blocks. `ANTHROPIC_API_KEY` server-only. |
| `/api/attest` | EIP-712 attestor signing. `ATTESTOR_PRIVATE_KEY` server-only. |
| `/api/demo/run` | One autonomous-agent step (checkAction + record). `PRIVATE_KEY` server-only. |
| `/api/rpc` | Mantle RPC proxy. |

All server-side keys stay server-side and each route returns **503** (never a crash) when its key is
unset — the app degrades gracefully.

## Develop

```bash
cp .env.example .env          # at the repo root
pnpm --filter @interlock/web dev      # http://localhost:3000
```

Key env (see root `.env.example`): `NEXT_PUBLIC_MANTLE_RPC_URL`, `NEXT_PUBLIC_INDEXER_URL`
(point at a running indexer for one-request loads), `NEXT_PUBLIC_*` contract addresses,
`ANTHROPIC_API_KEY` (AI layer), `ATTESTOR_PRIVATE_KEY` (record signing), `PRIVATE_KEY` +
`AGENT_ID`/`POLICY_ID` (the live Agent Demo).

The dashboard reads on-chain state via the indexer `/snapshot` (RPC fallback) and live-refreshes
(poll + `watchContractEvent`), so any recorded attestation — including from the Agent Demo —
appears in the Flight Recorder automatically.
