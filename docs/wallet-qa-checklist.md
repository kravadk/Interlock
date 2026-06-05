# Wallet QA Checklist

Use this checklist for the final manual browser pass with MetaMask or Rabby. Automated tests cover read-only dashboard behavior and live contract writes through CLI scripts, but this pass verifies injected-wallet UX and user signatures.

## Preconditions

- Dashboard is running at `http://127.0.0.1:3000`.
- Indexer is running at `http://127.0.0.1:8787`.
- Wallet has Mantle Sepolia selected or can switch to it.
- Wallet has test MNT for gas.
- Browser extensions that mutate page HTML are disabled except the wallet being tested.

Run before opening the browser:

```bash
pnpm live:services
pnpm browser:qa
```

## MetaMask Pass

1. Open `http://127.0.0.1:3000`.
2. Pick `MetaMask` from the wallet provider selector.
3. Click `Connect wallet`.
4. Approve connection.
5. If prompted, add or switch to Mantle Sepolia.
6. Confirm the header shows the connected address and chain `5003`.
7. Register an agent with metadata URI `ipfs://interlock-wallet-qa-metamask`.
8. Click `Sync indexer`.
9. Select the newly indexed agent.
10. Create a policy with:
    - allowed target: current `AgentRegistry`;
    - selector: `0x2de5aaf7`;
    - max native spend: `0.02`;
    - max slippage bps: `100`.
11. Click `Sync indexer`.
12. Run live pre-flight with the suggested calldata.
13. Confirm result is either:
    - `ALLOW / POLICY_PASSED` when simulation succeeds; or
    - a clear `BLOCK / SIMULATION_FAILED` explanation when the calldata is intentionally invalid for the selected action.
14. Click `Record on-chain attestation`.
15. Approve wallet transaction.
16. Click `Sync indexer`.
17. Confirm Flight Recorder shows the new transaction.
18. Open the Mantlescan link and confirm it resolves.

## Rabby Pass

Repeat the MetaMask pass with Rabby selected in the wallet provider selector. Confirm writes use Rabby and do not silently switch back to another injected provider.

## Negative UX Cases

- Reject wallet connection: UI must show an actionable wallet error.
- Reject a write signature: UI must show a rejection message and must not show a fake tx.
- Switch to wrong chain: write buttons must stay disabled and UI must ask for Mantle Sepolia.
- Enter calldata `0x0`: pre-flight button must disable and show the even-byte calldata warning.
- Enter max slippage `10001`: policy write buttons must disable and show the `0..10000` warning.
- Stop the indexer: Flight Recorder must show indexer unavailable and must not render stale synthetic history.

## Pass Criteria

- No generic wallet errors for normal actions.
- No fake balance, fake history, or placeholder transaction appears.
- All external links are clickable.
- Flight Recorder only shows indexed on-chain events from the current deployment-scoped indexer DB.
- Browser console has no app errors after the final sync.
