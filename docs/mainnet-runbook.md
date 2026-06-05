# Mainnet Runbook

This is a **future production checklist**, not permission to deploy. Interlock Control Plane is currently Mantle Sepolia Dev Alpha and should not be used with meaningful mainnet funds until audit, hardening, and operational review are complete.

## Go / No-Go Rule

Default answer is **no mainnet** unless every gate below is complete:

- External contract review completed.
- Slither and symbolic/manual analysis reviewed.
- Contracts verified on explorer.
- Attestor/key custody model approved.
- Incident response process tested.
- UI/docs state the exact security boundaries.
- A rollback and key-rotation plan exists for every deployed component.

## Preflight

Run from a clean checkout:

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm smoke:all
pnpm security:adversarial
pnpm security:slither
pnpm --filter @interlock/contracts lint:sol
```

Then verify deployment configuration:

```bash
pnpm deploy:preflight
pnpm deployment:manifest:doctor
pnpm live:verify
```

For a fresh target network, create a separate deployment folder instead of reusing `deployments/mantle-sepolia`.

## Required Environment

Never commit populated values.

```bash
PRIVATE_KEY=0x...
ATTESTOR_PRIVATE_KEY=0x...
MANTLE_RPC_URL=https://...
ETHERSCAN_API_KEY=...
```

Production deployments should separate:

- deployer key;
- attestor key;
- indexer/API runtime secrets;
- dashboard public env.

The browser must receive only public contract addresses, chain metadata, and public API URLs.

## Deployment Steps

1. Confirm the target chain id and RPC in the deploy preflight.
2. Deploy contracts.
3. Call `AgentRegistry.setActionAttestation(actionAttestationV2)` if the deploy script did not wire it automatically.
4. Generate deployment manifest and env.
5. Verify bytecode and constructor arguments.
6. Source-verify contracts on explorer.
7. Run read-only live verification.
8. Run one funded smoke flow with a controlled test policy and low value.
9. Start indexer from the deployment block, not block `0`.
10. Confirm dashboard status, recorder, analytics, and safety card show the new deployment only.

## Post-Deploy Verification

```bash
pnpm deployment:manifest:doctor
pnpm live:verify
pnpm deployment:report
pnpm live:smoke
pnpm live:full-test
```

Manual checks:

- All contract addresses have bytecode.
- Source verification is visible on explorer.
- `PolicyRegistry.VERSION()` matches docs.
- `PolicyRegistry.supportsPolicyEnumeration()` is `true`.
- V2 `attestor()` matches the intended key.
- `AgentRegistry.actionAttestation()` points to V2.
- Indexer `/health` reports the expected from block and latest indexed block.
- Dashboard never shows stale records from a different deployment.

## Rollback And Rotation

There is no in-place proxy upgrade model. Rollback means:

- stop writes through the affected deployment;
- deploy a fixed contract set;
- publish a new manifest;
- point dashboard/indexer/API to the new addresses;
- keep old deployment read-only for evidence history.

Key rotation:

1. Generate and fund a new attestor/deployer key.
2. For attestor-only rotation, call `ActionAttestationV3.setAttestor(newAttestor)`.
3. Update server-side env only.
4. Run `pnpm cli doctor --no-fail` and a low-value live smoke.
5. Remove old keys from local, hosted, and CI environments.

## Incident Response

If a bug or compromised key is suspected:

1. Stop all hosted record/write workers.
2. Disable public write paths in API/dashboard.
3. Preserve manifests, logs, tx hashes, and indexer DB snapshots.
4. Rotate affected keys.
5. Publish a fixed deployment or keep service read-only.
6. Document affected agent ids, policy ids, and action ids.

## Explicit Non-Goals For Mainnet V1

Do not ship mainnet with claims that Interlock is:

- a full wallet security product;
- a protocol audit replacement;
- a real-time scam detector;
- a guarantee that an allowlisted protocol is safe;
- a guarantee that a simulation result matches future execution state;
- production-grade reputation without audit and time-weighted design.

The acceptable production claim after audit should remain narrow:

```text
Interlock enforces configured pre-flight policy checks, records signed decisions, and exposes verifiable evidence for agent actions.
```
