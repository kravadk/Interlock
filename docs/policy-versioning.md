# Policy Versioning

Policy versioning is an off-chain developer workflow for review, diff, and verification. It does not change Interlock smart contracts.

On-chain `PolicyRegistry` remains the source of enforcement:

```text
policy snapshot JSON -> review/diff/verify -> optional on-chain policy update
```

## Snapshot Shape

```json
{
  "version": "interlock.policy-version.v1",
  "versionId": "policy-1-...",
  "policyId": "1",
  "agentId": "1",
  "source": "dashboard",
  "chainId": 5003,
  "contentHash": "0x...",
  "targets": ["0x..."],
  "selectors": ["0x2de5aaf7"],
  "maxNativeValue": "20000000000000000",
  "maxSlippageBps": 100,
  "active": true
}
```

## CLI

Save a snapshot:

```bash
pnpm cli -- policy-version snapshot --policy-id <real_policy_id> --out policies/policy-1.v1.json
```

Diff two snapshots:

```bash
pnpm cli -- policy-version diff \
  --from policies/policy-1.v1.json \
  --to policies/policy-1.v2.json
```

Verify a snapshot against the current on-chain policy:

```bash
pnpm cli -- policy-version verify --file policies/policy-1.v1.json
```

## SDK

Use the same Policy-as-Code format inside CI, backend services, or review bots:

```ts
import {
  buildPolicyVersionSnapshot,
  diffPolicyVersionSnapshots,
  verifyPolicyVersionSnapshot,
} from "@interlock/firewall-sdk";

const current = buildPolicyVersionSnapshot({
  policyId: 1n,
  policy,
  targets,
  selectors,
  source: "sdk",
  chainId: 5003,
});

const diff = diffPolicyVersionSnapshots(previousSnapshot, current);
const verify = verifyPolicyVersionSnapshot({ snapshot: previousSnapshot, current });
```

The snapshot hash is stable across target/selector ordering and ignores `createdAt`, so it can be used
for PR checks, release artifacts, and policy drift detection.

## Dashboard

The Policy Editor shows:

- selected policy summary;
- before-write mini-diff;
- current off-chain snapshot JSON;
- copy button for review/PR/issue workflows.

## What This Prevents

- updating a stale policy without seeing what changed;
- losing track of target/selector allowlist changes;
- treating dashboard form state as a durable artifact;
- confusing policy pack templates with an active on-chain policy.

## Current Limits

- No on-chain version registry.
- No IPFS upload.
- No governance or approvals workflow.
- No production compliance claim.
