# Package Release Readiness

Interlock Firewall is meant to be consumed as a developer tool, so release checks must verify the same surfaces external teams will use: package exports, SDK imports, CLI entrypoints, examples, and local contract flow.

## Release Artifacts

The runtime packages are:

- `@interlock/shared` - chain constants, deployed addresses, ABI fragments, enums.
- `@interlock/firewall-sdk` - SDK, policy evaluator, guarded Viem wallet, agent tool wrappers.
- `@interlock/indexer` - event indexer library and HTTP server.
- `@interlock/cli` - terminal preflight, recording, history, policy, and doctor commands.

Each package publishes only `dist`. Source files and tests are intentionally excluded from the package payload.

## Local Release Check

Run:

```bash
pnpm smoke:all
```

This covers:

- local Markdown documentation links;
- package build and public export imports;
- packaged tarball checks for every runtime package;
- deployment manifest doctor tests;
- deployment manifest env generation tests;
- deployment report generation tests;
- read-only live deployment verification tests;
- live alpha readiness tests;
- raw Viem, agent framework, backend automation, and preflight API examples;
- isolated contract smoke through the deployed core stack;
- CLI doctor in non-failing mode.

The GitHub Actions workflow runs the same `pnpm smoke:all` command after `pnpm check` and `pnpm test`, so local release readiness and PR readiness use the same gate. That gate now includes docs links, submission readiness, submission bundle tests, package smoke tests, consumer install, examples, production dashboard HTTP smoke, deployment manifest checks, live demo script invariants, local contracts, and CLI doctor output.

`pnpm cli -- ...` rebuilds packages before running the CLI for normal development. The smoke suite uses `pnpm cli:built -- ...` at the final doctor step because package build readiness is already checked earlier in the same gate.

For a smaller package-only check:

```bash
pnpm smoke:packages
pnpm smoke:pack
pnpm smoke:consumer
pnpm release:pack
pnpm release:draft
```

For a release-candidate gate that does not publish anything:

```bash
pnpm release:check
```

This runs `pnpm check`, `pnpm test`, `pnpm security:secrets`, package tarball smoke, consumer smoke, `release:pack`, and `release:draft`. It is the recommended final package/distribution check before sharing tarballs or creating a GitHub release draft.

For package-version intent, use Changesets:

```bash
pnpm changeset
pnpm release:changeset:check
pnpm version-packages
```

`pnpm release:changeset:check` runs `changeset status` in Git checkouts. In local exported workspaces without `.git`, it prints a skip message so package and smoke checks remain usable. The GitHub release-check workflow runs it after `actions/checkout` with full history and `CHANGESET_SINCE=origin/main`.

For documentation-only changes:

```bash
pnpm docs:links
```

This scans local Markdown links across the repo and fails when a referenced local file or directory is missing.

## What `smoke:pack` Verifies

`scripts/pack-smoke.mjs` runs `pnpm pack --json` inside each runtime package, inspects the produced tarball, and verifies:

- required `dist/*.js` and `dist/*.d.ts` files exist;
- required files are included in the package output;
- `src/` files are not included;
- `*.test.*` files are not included;
- packed `package.json` is not `private`;
- packed dependencies do not contain `workspace:*` ranges;
- the CLI package exposes `interlock` through `dist/index.js`;
- the CLI bin keeps the `#!/usr/bin/env node` shebang.

## Before Publishing Or Sharing Tarballs

1. Run `pnpm install --frozen-lockfile`.
2. Run `pnpm build`.
3. Run `pnpm check`.
4. Run `pnpm test`.
5. Run `pnpm smoke:all`.
5.0. Run `pnpm release:check` if this is a package/release-candidate handoff.
5.1. Run `pnpm release:pack` to create `release-artifacts/v<version>/*.tgz` and `SHA256SUMS.txt`.
5.2. Run `pnpm release:draft` and copy the generated release notes/checksum summary into the GitHub release draft if tarballs are being shared.
6. If contracts were deployed, validate the deployment manifest:

```bash
pnpm deployment:manifest:doctor
```

7. If contracts were deployed, regenerate the deployment env from the manifest if needed:

```bash
pnpm deployment:manifest:env -- --manifest deployments/mantle-sepolia/latest.json --out deployments/mantle-sepolia/latest.env
```

8. If contracts were deployed, run live readiness:

```bash
pnpm live:readiness
```

9. If contracts were deployed, run read-only on-chain verification:

```bash
pnpm live:verify
```

10. If contracts were deployed, generate the deployment report:

```bash
pnpm deployment:report -- --manifest deployments/mantle-sepolia/latest.json --out deployments/mantle-sepolia/summary.md
```

11. If contracts were deployed, run the Mantle Sepolia live smoke:

```bash
PRIVATE_KEY=0x...
MANTLE_RPC_URL=https://rpc.sepolia.mantle.xyz
AGENT_REGISTRY=0x...
POLICY_REGISTRY=0x...
ACTION_ATTESTATION=0x...
pnpm --filter @interlock/contracts live:smoke
```

Do not run live smoke in CI without a funded testnet deployer key. It writes real Mantle Sepolia transactions.

## Expected Warnings

- Ganache may print a µWS compatibility warning during isolated contract tests. This is expected on some Windows/Node setups.
- `node:sqlite` may print an experimental warning for indexer tests.

Treat TypeScript errors, failed package smoke, failed contract smoke, or missing package files as release blockers.

## What `smoke:consumer` Verifies

`scripts/consumer-smoke.mjs` creates a temporary project outside the monorepo, packs the runtime packages, installs them as tarball dependencies, and checks:

- `@interlock/firewall-sdk` imports from a real consumer project;
- `@interlock/shared` exposes Mantle chain constants and ABIs;
- `@interlock/indexer` exports its server/store surface;
- `@interlock/cli` exposes the `interlock` bin and prints help;
- local tarball overrides resolve internal `@interlock/*` dependencies before npm publication.

This catches problems that monorepo tests cannot see, especially broken `exports`, missing package files, bad CLI bin metadata, and unresolved internal package dependencies.
