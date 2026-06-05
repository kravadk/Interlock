# Dashboard Behavior Contract

This document defines how the Interlock Control Plane dashboard behaves as a developer console. It is intentionally strict: the UI must render live Mantle Sepolia RPC data, deployed contract state, or indexer API data only.

## Global Rules

- Do not render synthetic history, balances, transactions, policies, or agent counters.
- If RPC, wallet, contracts, or indexer are unavailable, show a clear empty/error state.
- Transaction hashes, addresses, metadata URIs, RPC URLs, and indexer URLs must be clickable when a valid destination exists.
- Changing agent or policy clears the previous preflight result.
- Changing target, value, calldata, or slippage keeps the previous decision visible only as stale evidence and must show `Inputs changed. Run preflight again`.
- A preflight result is valid only when it matches the currently visible action inputs.
- Any caught wallet, RPC, indexer, or write failure must appear in the persistent Error details panel with raw error and suggested fix.

## Start Here

Shows:

- wallet, network, contracts, indexer, agent, policy, demo, and recording readiness;
- Developer / Judge Demo mode toggle;
- 5-minute integration path stepper for Dashboard, SDK, REST, MCP, or CLI;
- "Why is this disabled?" summary with one next action;
- read-only public mode note: preflight works without wallet, recording needs wallet, Flight Recorder uses hosted/local indexer or real Mantle RPC fallback.

Empty/error behavior:

- Missing wallet must show read-only mode, not a fatal error.
- Missing indexer must not render fake history.
- Each blocked item must show a concrete next action.

## Status Center

Shows:

- RPC URL and Mantle Sepolia chain id;
- wallet/account/chain and product mode: read-only, wrong-chain, or write-ready;
- Recorder URL or RPC fallback state;
- Recorder health, storage mode, next indexed block, last sync count, and last sync error;
- AgentRegistry, PolicyRegistry, and ActionAttestation links;
- configured webhook state, subscribed events, and last delivery status;
- selected agent id and policy id;
- latest indexed evidence linked to Mantlescan.

Empty/error behavior:

- If Recorder is disabled, show RPC fallback state and explain that Analytics requires Recorder.
- If webhook is not configured, show `not configured`, not an error.
- If webhook delivery fails, show the delivery error without blocking Recorder evidence.
- Do not show fake latest block, fake webhook delivery, or fake latest action.

## Judge Demo

Shows:

- one-click safe action;
- one-click unknown target attack;
- one-click overspend attempt;
- latest decision and next developer step;
- SDK snippet details.

Empty/error behavior:

- If agent or policy id is missing, scenario buttons stay disabled or explain the missing real ids.
- The mode must not create fake agent/policy data.

## Agent Profile

Shows:

- selected indexed agent id, or the manually entered real agent id in public/read-only mode;
- owner address linked to Mantlescan;
- metadata URI linked when it is `https://`, `http://`, or `ipfs://`;
- Agent Safety Card with owner, metadata, counters, last decision, risk ratio, and Mantlescan links;
- optional ERC-8004 Bridge block with a configured real registry link or a clear unconfigured state;
- copyable ERC-8004-style agent manifest JSON for the selected Interlock agent;
- public Agent Safety Card `/agent/:id` shows Recorder-derived benchmark evidence when the indexer is configured;
- agent source: indexed selector, manual real id, or env default;
- wallet balance from Mantle Sepolia RPC;
- wallet chain id;
- selected injected wallet provider when multiple wallets are available;
- allowed, blocked, and failed simulation counters;
- latest indexed transaction linked to Mantlescan;
- indexer storage and last synced record count.

Empty/error behavior:

- No agents: show an onboarding message to register an agent or sync the indexer.
- Indexer unavailable: clear indexed agent/history state and show the real indexer error.
- Public/read-only fallback: keep the manual agent id field visible; do not show fabricated counters or latest transactions.
- Wallet missing: keep read-only mode usable and show a wallet-specific error only after the user tries to connect.
- Invalid metadata URI: render raw text without a broken link.

## Policy Editor

Shows and supports:

- selected indexed policy id, or the manually entered real policy id in public/read-only mode;
- active/inactive status;
- max native spend;
- max slippage bps;
- editable allowlisted target address;
- editable allowlisted selector;
- indexed target allowlist linked to Mantlescan;
- indexed selector allowlist as code chips;
- create policy, update policy, allow/block target, allow/block selector.
- policy pack template picker;
- selected policy summary;
- selector helper with known label and `approve` warning;
- before-write mini-diff for max spend, slippage, and active state.
- off-chain policy version snapshot JSON and copy action.
- ABI -> Policy Pack Builder: real contract address, developer-supplied ABI JSON, selector preview, generated template JSON.

Empty/error behavior:

- No policies: show an onboarding message to create a policy and sync the indexer.
- Indexer unavailable: keep manual policy id usable for live preflight and disable indexed allowlist claims.
- Wrong chain or disconnected wallet: write buttons remain disabled and expose a concrete reason.
- Multiple wallets: connect and write calls use the selected EIP-6963/injected provider.
- Invalid selector: write buttons remain disabled and the field keeps the bytes4 requirement visible.
- Wallet rejection, revert, or insufficient funds: show the transaction error in the same workflow.
- Policy not indexed yet: keep the transaction link visible and let the user sync the indexer.
- Policy version snapshot is a review artifact only; it must not imply on-chain versioning.
- ABI builder must reject invalid addresses or invalid ABI JSON and must not use placeholder protocol addresses.

## Action Review

Shows and supports:

- proposed transaction target;
- native value;
- full calldata;
- expected slippage bps;
- action presets: safe read/action, unknown target, overspend, and manual calldata;
- left-side proposed transaction form and right-side live decision result;
- pipeline-style result stages: input validation, policy state, target, selector, value limit, slippage limit, RPC simulation, final decision, and attestation readiness;
- live Mantle Sepolia RPC simulation;
- policy checks through `PolicyRegistry`;
- `ALLOW` or `BLOCK` result;
- reason code, explanation, risk score, selector, and decision source;
- decision JSON copy action;
- record on-chain attestation when a Mantle Sepolia wallet is connected.
- Bundle Review for current action and current action plus unknown-target probe;
- Token & RWA Evidence block:
  - ERC20 calldata decode for `transfer`, `transferFrom`, and `approve`;
  - unlimited approve warning;
  - live yield/RWA advisory evidence when Recorder yield sync has real records.

Empty/error behavior:

- Before preflight: show a neutral waiting state.
- Invalid address, value, odd-length calldata, or slippage outside `0..10000`: disable `Run live pre-flight`.
- No wallet: allow read-only preflight, disable attestation recording.
- Simulation failure: show `SIMULATION_FAILED` and keep check details visible.
- Policy/action mismatch: clear stale decisions immediately for agent/policy changes; action input changes keep a stale warning and disable recording.
- Known contract helpers may suggest full calldata, but unknown contracts must keep developer-provided calldata unchanged.
- Bundle Review must run live preflight checks for each action and must not fabricate a multi-step execution result.
- Token evidence must show a neutral unknown state when calldata is not recognized ERC20 calldata.
- RWA/yield evidence must show a clear "not loaded" state until real Recorder yield records are synced.

## Benchmark Arena

Shows:

- Dev Alpha benchmark score;
- scenario cards for safe agent read, unknown target, overspend, high slippage, unapproved approve selector, selector-only calldata simulation failure, and empty calldata selector check;
- multi-step bundle scenario where one blocked action blocks the whole bundle;
- scenario intent;
- track fit;
- capability under test;
- expected decision and reason;
- actual live decision and explanation;
- copyable benchmark JSON.

Empty/error behavior:

- Missing agent or policy id disables scenario runs and shows the same Action Review validation reason.
- Scenarios run live pre-flight checks only; they must not create fake records.
- Recording benchmark decisions still uses the normal attestation flow and requires wallet/private key.
- Score must be labeled as Dev Alpha evidence, not audited reputation.

## Policy Checks

Shows an explanation table:

- check name;
- pass/fail/waiting state;
- evidence value;
- why the check matters;
- concrete fix if it failed.

Empty/error behavior:

- No decision: show neutral state.
- Input change: show stale warning if a previous decision is still visible.
- RPC error: do not infer checks beyond the failed live result; use Error details for raw failure.

## Flight Recorder

Shows:

- indexer source linked to `/health`, or Mantle RPC fallback source linked to `ActionAttestation`;
- indexed action rows for the selected agent;
- transaction hash linked to Mantlescan;
- decision label;
- reason code;
- target address;
- agent id;
- policy id;
- timestamp;
- filters for all, allowed, blocked, and failed simulation;
- search by tx, target, reason, agent, or policy;
- copy evidence summary.

Empty/error behavior:

- Live indexer/RPC fallback with no actions: show `No indexed actions for the selected agent`.
- Indexer unavailable and RPC fallback unavailable: show the real error and do not show local or synthetic history.
- Sync delay: keep manual `Sync indexer` or `Refresh RPC history` visible.
- Non-2xx indexer response: do not show old rows as current state.

## Analytics

Shows:

- total indexed actions;
- allowed, blocked, review, failed simulation, and block-rate metrics;
- selected agent and selected policy scoped totals;
- top reason codes;
- most common targets;
- most used selectors;
- latest decisions with Mantlescan links.

Empty/error behavior:

- If Recorder is disabled, show `Analytics requires Recorder/Indexer`.
- If Recorder is unavailable, show the real analytics error.
- Do not calculate analytics from fake history or fabricated defaults.
- RPC fallback can populate Flight Recorder, but not global analytics.

## API Playground

Shows:

- current Recorder base URL;
- read-only endpoint cards for `/health`, `/status`, agents, actions, benchmark, and analytics;
- `Copy curl`, `Copy fetch`, and `Open endpoint` actions for concrete endpoints.

Empty/error behavior:

- If Recorder is disabled, show that examples use the default local URL until `NEXT_PUBLIC_INDEXER_URL` is configured.
- Links must never contain `undefined`.
- The playground must not perform write actions.

## Developer Integration

Shows:

- SDK snippet for `InterlockFirewall.checkAction`;
- REST snippet for `POST /preflight`;
- MCP server config snippet;
- CLI snippet for `pnpm cli -- preflight`;
- GOAT-style wrapper snippet;
- AgentKit-style action provider snippet;
- webhook receiver snippet;
- env snippet;
- policy pack JSON snippet;
- policy version snapshot snippet;
- integration checklist from package install through recorder inspection;
- browser write/read-only status;
- RPC URL;
- PolicyRegistry address linked to Mantlescan.

Empty/error behavior:

- Missing wallet: explain read-only mode and disabled writes.
- Missing env contracts: disable writes and show required env keys in docs.
- Snippets must reflect the current selected agent, policy, target, value, calldata, and slippage inputs.
- Snippet copy actions must show toast success/error.
- The tab must warn that attestation is a pre-flight decision record, not proof of execution.
- If public defaults are configured, snippets must use those real defaults until the developer selects different indexed or manual values.

## Mantle Ecosystem

Shows:

- Mantle docs, faucet, bridge, Mantlescan, mETH, Function FBTC, MI4, UR, and Byreal links;
- current Interlock contract links;
- copyable env block;
- Mantle ecosystem policy pack summaries;
- required addresses, supported selectors, ecosystem fit, track fit, risk notes, and JSON template copy for each pack.

Empty/error behavior:

- Pack templates must state when real protocol addresses are required.
- Do not show fake protocol addresses.

## Not Found And Unexpected Errors

- The not-found page must not perform chain reads or indexer requests.
- The dashboard error boundary must not show agent history, balances, or decisions after a render failure.
- Unexpected render errors must show the error message, optional digest, and a reload action.
