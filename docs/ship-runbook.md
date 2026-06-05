# Ship runbook

How to deploy Interlock (web dashboard + indexer) and verify the deployment. Contracts are already
live on Mantle Sepolia; redeploy only when changing the contracts (see
[../packages/contracts/README.md](../packages/contracts/README.md)).

## Pre-flight

```bash
pnpm install
pnpm build                 # all packages + web
pnpm -r test               # unit tests across the monorepo
pnpm security:secrets      # no committed secrets
pnpm docs:links            # docs links valid
```

## Web (Vercel)

The repo ships `vercel.json` (framework `nextjs`, build `pnpm build:packages && pnpm --filter
@interlock/web build`, output `apps/web/.next`).

- **Auto:** push to the default branch — Vercel builds + deploys.
- **Manual:** `vercel --prod` from the repo root.
- **Env (Vercel project settings):** `NEXT_PUBLIC_MANTLE_RPC_URL`, `NEXT_PUBLIC_INDEXER_URL`,
  `NEXT_PUBLIC_*` contract addresses, and the server-side keys `ANTHROPIC_API_KEY`,
  `ATTESTOR_PRIVATE_KEY`, `PRIVATE_KEY` (+ `AGENT_ID`/`POLICY_ID` for the live demo). Keys are
  server-only; omit any to disable that feature gracefully (the route returns 503).

## Indexer (Docker / host)

See [../packages/indexer/README.md](../packages/indexer/README.md) for the full deploy section.

```bash
docker build -f packages/indexer/Dockerfile -t interlock-indexer .
docker run -p 8787:8787 -v interlock-data:/data --env-file .env interlock-indexer
```

Deploy the image to Railway / Fly / Render / a VM. Persist the SQLite volume (`/data`). Set
`LOG_LEVEL` (default `info`), `AUTO_SYNC=true`, `SYNC_INTERVAL_MS`, and the contract addresses.

## Post-deploy verification

```bash
pnpm cli doctor --no-fail        # RPC + contracts + key presence + indexer
pnpm live:services               # web + indexer health
curl https://<web>/api/health    # configured contracts, key presence, indexer reachability
curl https://<indexer>/metrics   # Prometheus counters
```

Point a Prometheus scrape at the indexer `/metrics` and alert on `interlock_sync_errors_total` or a
stale `interlock_last_synced_block` — see [observability.md](./observability.md). For key rotation
and incident response see [../SECURITY.md](../SECURITY.md).
