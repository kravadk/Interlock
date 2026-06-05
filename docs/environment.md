# Environment

Most Interlock Firewall commands use Mantle Sepolia addresses, RPC settings, and optional indexer settings. The root `.env.example` contains the full set.

## Local Setup

```bash
cp .env.example .env
pnpm deploy:preflight
pnpm env:doctor
```

`pnpm deploy:preflight` is the write-safety check before deployment. It validates `.env`, confirms Mantle Sepolia chain ID `5003`, checks that `PRIVATE_KEY` is configured without printing it, and reports the deployer balance.

`pnpm env:doctor` loads `.env` through `scripts/env-run.mjs` and runs:

```bash
pnpm cli doctor --no-fail
```

It checks:

- Mantle Sepolia RPC reachability;
- chain ID `5003`;
- configured contract addresses;
- contract bytecode presence;
- `PolicyRegistry` compatibility for enumerable allowlists via `supportsPolicyEnumeration()` and `VERSION`;
- private key presence;
- optional indexer health when `INDEXER_URL` is set.

## Running Any Command With `.env`

Use:

```bash
pnpm with-env <command> [...args]
```

Examples:

```bash
pnpm with-env pnpm cli doctor --no-fail
pnpm with-env pnpm --filter @interlock/example-raw-viem demo -- --live
pnpm with-env pnpm --filter @interlock/contracts live:smoke
```

Existing shell variables override `.env` values. This lets CI inject secrets without editing files.

## Running With A Deployment Env

After `pnpm deploy:mantle-sepolia`, the deploy script writes:

```text
deployments/mantle-sepolia/latest.env
```

Run any command against that file:

```bash
pnpm with-env --env-file deployments/mantle-sepolia/latest.env pnpm cli doctor --no-fail
pnpm deployment:doctor
```

This is useful for dashboard/indexer/CLI workflows where contract addresses should come from the latest deployment manifest instead of a manually edited `.env`.

For a live dashboard session, use the dedicated scripts:

```bash
pnpm indexer:live
pnpm web:live
```

`latest.env` contains `PORT=8787` for the indexer. `pnpm web:live` keeps those live contract addresses but runs the Next.js dashboard on `3000` by default. Override it with `WEB_PORT=3001 pnpm web:live` if needed.

## Common Variables

- `MANTLE_RPC_URL` - Mantle Sepolia RPC endpoint.
- `PRIVATE_KEY` - test wallet private key for writes.
- `AGENT_REGISTRY` - deployed `AgentRegistry`.
- `POLICY_REGISTRY` - deployed `PolicyRegistry`.
- `ACTION_ATTESTATION` - deployed `ActionAttestation`.
- `ACTION_TARGET` - optional target contract for live examples.
- `ACTION_VALUE_MNT` - optional native value for live examples.
- `AGENT_ID` - default live example agent ID.
- `POLICY_ID` - default live example policy ID.
- `INDEXER_URL` - CLI doctor/indexer health endpoint.
- `INDEXER_BLOCK_CHUNK_SIZE` - optional indexer event range size for RPC rate-limit tuning.
- `NEXT_PUBLIC_*` - browser-safe values for the Next.js dashboard.
- `NEXT_PUBLIC_DEFAULT_AGENT_ID` - optional real agent id to preselect in public/read-only dashboard mode.
- `NEXT_PUBLIC_DEFAULT_POLICY_ID` - optional real policy id to preselect in public/read-only dashboard mode.
- `NEXT_PUBLIC_DEFAULT_ACTION_TARGET` - optional real target address for the pre-filled Action Review transaction.
- `NEXT_PUBLIC_DEFAULT_SELECTOR` - optional bytes4 selector used to pre-fill calldata for the Action Review transaction.
- `NEXT_PUBLIC_INDEXER_URL=disabled` - explicit public dashboard mode when no hosted indexer is available.

The `NEXT_PUBLIC_DEFAULT_*` values are not mock data. Use only ids, addresses, and selectors that exist on the configured Mantle Sepolia deployment. They are useful for hosted dashboard links where the indexer may be unavailable or still syncing, but the page should still let a developer run a live read-only preflight against real RPC/contract state.

Do not put production private keys in `.env`. Use a dedicated Mantle Sepolia test key for local and hackathon demos.
