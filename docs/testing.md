# Testing

Interlock uses layered tests so fast local checks stay cheap while heavier browser/security checks can run before release.

## Fast Gates

```bash
pnpm check
pnpm test
pnpm docs:links
```

`pnpm check` builds runtime packages, typechecks packages, and builds the Next.js dashboard. `pnpm test` runs unit and contract tests across the workspace.

## Contract Security Gates

```bash
pnpm --filter @interlock/contracts test
pnpm --filter @interlock/contracts local:smoke
pnpm security:adversarial
pnpm security:slither
```

`security:slither` writes JSON reports to `reports/` and uses documented suppressions for accepted patterns such as dispute-window timestamp checks and dependency-free ECDSA recovery. See [audit-readiness.md](./audit-readiness.md).

## Coverage

```bash
pnpm test:coverage
```

Coverage is a ratchet, not a production claim. The current web coverage thresholds are set to the existing baseline so future work can raise them without blocking this Dev Alpha on legacy untested UI paths.

## Browser And E2E

```bash
pnpm web:e2e
pnpm browser:qa
pnpm screenshots:capture
```

`web:e2e` uses Playwright against a production Next build. It verifies:

- landing page to `/app` navigation;
- control plane opens without a wallet;
- injected-wallet flow with a mocked `window.ethereum`;
- baseline security headers;
- API rate limiting on `/api/ai`.

`browser:qa` is the existing CDP-based smoke flow that checks dashboard rendering, links, mobile overflow, and read-only preflight behavior. `screenshots:capture` refreshes submission screenshots.

## CI Switches

The default CI path runs build, check, test, Slither when `RUN_SLITHER=true`, and the smoke suite. Optional heavier gates:

```bash
RUN_COVERAGE=true
RUN_E2E=true
```

Use these before a public release, demo submission, or security review.
