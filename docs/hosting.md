# Hosting

Interlock Firewall can be hosted as a public read-only developer console before the indexer/API is hosted. The dashboard still uses real Mantle Sepolia RPC and deployed contracts; it must not render mock history, fake balances, or placeholder transactions.

## Vercel Frontend

The root `vercel.json` builds the workspace from the repository root and publishes `apps/web/.next`.

Required public build/runtime variables:

```bash
NEXT_PUBLIC_MANTLE_RPC_URL=https://rpc.sepolia.mantle.xyz
NEXT_PUBLIC_AGENT_REGISTRY=0xa8d6f3478b683ee674ff5a9167e6838c589162b4
NEXT_PUBLIC_POLICY_REGISTRY=0x16a02f6ed0d3db730fd60d5c51ec99e7825e41e0
NEXT_PUBLIC_ACTION_ATTESTATION=0x6488c92049dcbb88a442d1bbf6e94bc137faf4a3
NEXT_PUBLIC_DEFAULT_AGENT_ID=<real_agent_id>
NEXT_PUBLIC_DEFAULT_POLICY_ID=<real_policy_id>
NEXT_PUBLIC_DEFAULT_ACTION_TARGET=0xa8d6f3478b683ee674ff5a9167e6838c589162b4
NEXT_PUBLIC_DEFAULT_SELECTOR=0x2de5aaf7
NEXT_PUBLIC_INDEXER_URL=disabled
```

Optional:

```bash
NEXT_PUBLIC_INDEXER_URL=https://<hosted-indexer-url>
```

Set `NEXT_PUBLIC_INDEXER_URL=disabled` for a frontend-only public dashboard. The dashboard will show an indexer-unavailable state and keep the manual real agent/policy inputs usable for read-only preflight. Do not point a public deployment at private or local-only data if you need public action history.

Deploy:

```bash
vercel deploy --prod --yes \
  --build-env NEXT_PUBLIC_MANTLE_RPC_URL=https://rpc.sepolia.mantle.xyz \
  --build-env NEXT_PUBLIC_AGENT_REGISTRY=0xa8d6f3478b683ee674ff5a9167e6838c589162b4 \
  --build-env NEXT_PUBLIC_POLICY_REGISTRY=0x16a02f6ed0d3db730fd60d5c51ec99e7825e41e0 \
  --build-env NEXT_PUBLIC_ACTION_ATTESTATION=0x6488c92049dcbb88a442d1bbf6e94bc137faf4a3 \
  --build-env NEXT_PUBLIC_DEFAULT_AGENT_ID=<real_agent_id> \
  --build-env NEXT_PUBLIC_DEFAULT_POLICY_ID=<real_policy_id> \
  --build-env NEXT_PUBLIC_DEFAULT_ACTION_TARGET=0xa8d6f3478b683ee674ff5a9167e6838c589162b4 \
  --build-env NEXT_PUBLIC_DEFAULT_SELECTOR=0x2de5aaf7 \
  --build-env NEXT_PUBLIC_INDEXER_URL=disabled \
  --env NEXT_PUBLIC_MANTLE_RPC_URL=https://rpc.sepolia.mantle.xyz \
  --env NEXT_PUBLIC_AGENT_REGISTRY=0xa8d6f3478b683ee674ff5a9167e6838c589162b4 \
  --env NEXT_PUBLIC_POLICY_REGISTRY=0x16a02f6ed0d3db730fd60d5c51ec99e7825e41e0 \
  --env NEXT_PUBLIC_ACTION_ATTESTATION=0x6488c92049dcbb88a442d1bbf6e94bc137faf4a3 \
  --env NEXT_PUBLIC_DEFAULT_AGENT_ID=<real_agent_id> \
  --env NEXT_PUBLIC_DEFAULT_POLICY_ID=<real_policy_id> \
  --env NEXT_PUBLIC_DEFAULT_ACTION_TARGET=0xa8d6f3478b683ee674ff5a9167e6838c589162b4 \
  --env NEXT_PUBLIC_DEFAULT_SELECTOR=0x2de5aaf7 \
  --env NEXT_PUBLIC_INDEXER_URL=disabled
```

## Hosted API/Indexer

The current Dev Alpha indexer is a long-running Node service. For a public hosted dashboard with action history, run `packages/indexer` on a host that supports persistent Node processes and set:

```bash
MANTLE_RPC_URL=https://rpc.sepolia.mantle.xyz
AGENT_REGISTRY=0xa8d6f3478b683ee674ff5a9167e6838c589162b4
POLICY_REGISTRY=0x16a02f6ed0d3db730fd60d5c51ec99e7825e41e0
ACTION_ATTESTATION=0x6488c92049dcbb88a442d1bbf6e94bc137faf4a3
FROM_BLOCK=39344216
PORT=8787
AUTO_SYNC=true
```

Then set `NEXT_PUBLIC_INDEXER_URL` to that hosted URL and verify:

```bash
curl https://<hosted-indexer-url>/health
curl https://<hosted-indexer-url>/agents
curl https://<hosted-indexer-url>/policies
```

## Public QA

After deployment:

1. Open the public dashboard without a wallet.
2. Confirm the manual agent id and policy id are populated with real ids.
3. Run live preflight against the default target/selector.
4. Confirm Action Review shows the pipeline stages and an `ALLOW` or `BLOCK` result from real RPC/policy checks.
5. Confirm Flight Recorder shows either real indexed actions or an explicit indexer-unavailable state.
6. Connect MetaMask/Rabby on Mantle Sepolia and record a pre-flight decision only if using a funded test wallet.
