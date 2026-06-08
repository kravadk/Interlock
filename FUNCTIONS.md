# Interlock — Function Reference

Every public function, command, route, and contract entrypoint, grouped by surface. Signatures are
abbreviated; full types live in [docs/api-reference.md](docs/api-reference.md) and the source.

- [SDK — `InterlockFirewall` methods](#sdk--interlockfirewall-methods)
- [SDK — standalone functions](#sdk--standalone-functions)
- [CLI commands](#cli-commands)
- [MCP tools](#mcp-tools)
- [REST / HTTP routes](#rest--http-routes)
- [Smart contracts](#smart-contracts)
- [Dashboard views](#dashboard-views)

---

## SDK — `InterlockFirewall` methods

`@interlock/firewall-sdk`. Construct with `new InterlockFirewall({ chain, rpcUrl, privateKey?, contracts })`.

### Agents
| Method | Description |
| --- | --- |
| `registerAgent(input): Promise<Hex>` | Register an agent; returns the tx hash. |
| `registerAgentAndWait(input): Promise<RegisterAgentResult>` | Register and wait for the receipt + parsed `agentId`. |
| `getAgentStats(agentId): Promise<AgentStats>` | Allowed/blocked/failed counters for an agent. |

### Policies
| Method | Description |
| --- | --- |
| `createPolicy(input): Promise<Hex>` | Create a policy (targets/selectors/limits). |
| `createPolicyAndWait(input): Promise<CreatePolicyResult>` | Create and wait for the parsed `policyId`. |
| `createPolicyFromPreset(input): Promise<Hex>` | Create from a named preset/ecosystem pack. |
| `createPolicyFromPresetAndWait(input): Promise<CreatePolicyResult>` | Preset create + wait. |
| `updatePolicy(input): Promise<Hex>` | Update value/slippage limits + active state. |
| `setTargetAllowed(input): Promise<Hex>` | Add/remove an allowlisted call target. |
| `setSelectorAllowed(input): Promise<Hex>` | Add/remove an allowlisted 4-byte selector. |
| `getPolicy(policyId): Promise<AgentPolicy>` | Read a policy record. |
| `isTargetAllowed(policyId, target): Promise<boolean>` | Check a target against the allowlist. |
| `isSelectorAllowed(policyId, selector): Promise<boolean>` | Check a selector against the allowlist. |
| `getAllowedTargets(policyId): Promise<Address[]>` | Enumerate allowlisted targets. |
| `getAllowedSelectors(policyId): Promise<Hex[]>` | Enumerate allowlisted selectors. |
| `checkPolicyPermissions(input): Promise<PolicyPermissionCheckResult>` | Combined target+selector check. |
| `supportsPolicyEnumeration(): Promise<{ supported, version? }>` | Registry capability probe. |
| `auditPolicyPack(input): Promise<PolicyPackAuditResult>` | Drift-check a policy pack vs on-chain. |
| `applyPolicyPack(input): Promise<PolicyPackApplyResult>` | Reconcile a policy pack on-chain (optional prune). |

### Pre-flight & recording
| Method | Description |
| --- | --- |
| `checkAction(action): Promise<FirewallDecision>` | Pre-flight one action → ALLOW/BLOCK + reason. |
| `checkActionBundle(bundle): Promise<AgentActionBundleReport>` | Pre-flight a multi-step route; ALLOW iff all pass. |
| `recordDecision(decision): Promise<Hex>` | Record an attestation via the committee-verified ActionAttestationV4 path; returns tx hash. |
| `recordDecisionAndWait(decision): Promise<RecordDecisionResult>` | Record + wait for `actionCheckId`. |
| `recordDecisionWithCommittee(input): Promise<Hex>` | Record on V4 with ≥threshold AttestorCommittee signatures (defaults to the firewall's own account as a 1-of-1 member). |
| `recordDecisionWithWalletClient(...)` | Legacy single-attestor V3 record with an injected wallet client (EIP-712 signed). |
| `recordBundleDecisions(report): Promise<RecordDecisionResult[]>` | Record every decision in a bundle. |
| `guardedSendTransaction(action, options?): Promise<GuardedSendResult>` | Pre-flight → send if allowed → record. |
| `runGatewayAction(action, options?): Promise<GatewayActionResult>` | Unified gateway: dry-run / record-only / execute-if-allowed / block-and-alert. |
| `getActionHistory(filters?): Promise<ActionHistoryEntry[]>` | Read `ActionChecked` history. |

### Enforcement (PolicyGuardedExecutor)
| Method | Description |
| --- | --- |
| `executeThroughGuard(input): Promise<Hex>` | Route execution through the guard; reverts on-chain if disallowed. |
| `previewGuard(input): Promise<{ allowed, reasonCode }>` | Authoritative on-chain dry-run of the guard. |

### Token-rule enforcement (TokenGuardedExecutor)
| Method | Description |
| --- | --- |
| `setTokenRule(input): Promise<Hex>` | Set the on-chain ERC-20 rule for a (policy, token): recipient/spender allowlists, max amount, unlimited-approve flag. |
| `executeThroughTokenGuard(input): Promise<Hex>` | Route execution through the token guard; reverts on policy OR token-rule violation. |
| `previewTokenGuard(input): Promise<{ allowed, reasonCode }>` | On-chain dry-run of policy + token-rule checks. |
| `getTokenRule(guard, policyId, token): Promise<TokenRule>` | Read the on-chain ERC-20 rule for a (policy, token). |

### Dispute window + escrow
| Method | Description |
| --- | --- |
| `challengeAction(actionCheckId, reason): Promise<Hex>` | Flag a record disputed within its window. |
| `finalizeAction(actionCheckId): Promise<Hex>` | Stamp a record FINALIZED after its window. |
| `bondRecord({ escrow, actionCheckId, bond }): Promise<Hex>` | Recorder bonds a record's honesty. |
| `openDispute({ escrow, actionCheckId, bond }): Promise<Hex>` | Challenger bonds a dispute. |
| `resolveDispute({ escrow, actionCheckId, challengerWins }): Promise<Hex>` | Arbiter resolves; winner takes both bonds. |
| `withdrawDisputeFunds(escrow): Promise<Hex>` | Pull credited dispute funds. |

### Decentralization, reputation & ERC-8004
| Method | Description |
| --- | --- |
| `committeeApproved(committee, digest, signatures): Promise<boolean>` | m-of-n distinct-signer check (AttestorCommittee). |
| `getReputation(oracle, agentId): Promise<{ scoreBps, tier }>` | Interlock ReputationOracle score + tier. |
| `getErc8004Identity(agentId, identityRegistry?): Promise<Erc8004Agent>` | Read identity from the official ERC-8004 IdentityRegistry. |
| `getErc8004Reputation(agentId, clientAddresses, reputationRegistry?)` | Read the official ERC-8004 reputation summary. |
| `registerErc8004Identity(agentURI, identityRegistry?): Promise<Hex>` | Register the agent into the official ERC-8004 IdentityRegistry. |

---

## SDK — standalone functions

### Pre-flight / policy evaluation
| Function | Description |
| --- | --- |
| `evaluatePolicy(input)` | Pure policy evaluation → decision + reason code. |
| `summarizeBundleRisk(report)` | Human-readable bundle risk summary. |
| `bundleHash(bundle)` | Stable hash of a bundle. |

> Bundle evaluation/recording (`checkActionBundle`, `recordBundleDecisions`) are exposed as firewall methods above.

### Token guard (ERC-20)
| Function | Description |
| --- | --- |
| `decodeErc20Action(data): DecodedErc20Action` | Decode `transfer`/`transferFrom`/`approve` calldata. |
| `evaluateTokenRules({ token, calldata, rules }): TokenGuardResult` | Advisory recipient/spender/amount/unlimited-approve check. |
| `erc20TransferCalldata({ to, amount })` / `erc20ApproveCalldata({ spender, amount })` | Build ERC-20 calldata. |

### RWA / yield guard
| Function | Description |
| --- | --- |
| `evaluateRwaGuard(config, ctx): RwaGuardFinding` | Exposure/concentration/rebalance check. |
| `buildRwaRiskEvidence(input): RwaRiskEvidence` | Hashable advisory evidence (TVL/APY/freshness + portfolio). |
| `rwaRiskToReasonCode(input)` | Map a finding to a reason code. |
| `hashRwaRiskEvidence(evidence): Hex` | keccak256 of an evidence object (feeds `evidenceHash`). |

### Strategy (AI yield agent)
| Function | Description |
| --- | --- |
| `pickAllocation({ signals, config }): AllocationDecision` | Deterministic, explainable yield strategy: rank live pools by APY × liquidity confidence, skip thin/absurd-APY pools, pick + size a risk-adjusted allocation. Pure (no I/O). |

### ERC-8004
| Function | Description |
| --- | --- |
| `getErc8004Agent({ publicClient, identityRegistry, agentId })` | Read identity (owner/tokenURI/wallet). |
| `getErc8004ReputationSummary({ ... })` | Read `getSummary` feedback aggregate. |
| `registerErc8004Agent({ walletClient, account, identityRegistry, agentURI })` | `register(agentURI)` write. |
| `setErc8004AgentUri({ ... })` | `setAgentURI` write. |
| `giveErc8004Feedback({ ... })` | Publish reputation as ERC-8004 `giveFeedback`. |
| `buildErc8004AgentManifest(input)` | Build an ERC-8004 registration manifest. |
| `linkInterlockAgentToErc8004(input)` | Link object between an Interlock agent and an ERC-8004 id. |

### Policy packs, presets & versioning
| Function | Description |
| --- | --- |
| `generatePolicyPackFromAbi(input)` | Build a reviewable policy pack from a contract ABI. |
| `parsePolicyPack` / `validatePolicyPack` / `lintPolicyPack` / `lintPolicyPackJson` | Parse / validate / advisory-lint a pack. |
| `policyPackFromPreset` / `policyPackToCreatePolicyInput` | Preset → pack → on-chain input. |
| `listMantleEcosystemPolicyPacks` / `getMantleEcosystemPolicyPack` | Curated Mantle ecosystem packs. |
| `listPolicyPackRegistryEntries` / `getPolicyPackRegistryEntry` / `validatePolicyPackRegistry` | Pack registry. |
| `approvalPolicy` / `paymentPolicy` / `conservativeDeFiPolicy` / `rwaReadOnlyPolicy` / `describePolicyPreset` | Built-in presets. |
| `buildPolicyVersionSnapshot` / `diffPolicyVersionSnapshots` / `verifyPolicyVersionSnapshot` / `assertPolicyVersionSnapshot` / `policyVersionContentHash` | Off-chain policy versioning. |

### Signing, evidence & hashing
| Function | Description |
| --- | --- |
| `signActionDecision(decision, account, options?)` | EIP-712 sign a decision (+ deadline). |
| `actionTypedData(...)` | Build the EIP-712 typed-data for a decision. |
| `buildEvidence(decision)` / `buildEvidenceReport(decision)` | Portable evidence object (+ hash). |
| `actionCheckedFromReceipt` / `agentRegistrationFromReceipt` / `policyCreationFromReceipt` | Parse setup results from receipts. |
| `hashJson(value)` / `calldataHash(data)` | Deterministic hashes. |

### Adapters & integration
| Function | Description |
| --- | --- |
| `createAgentFirewallTool` / `withInterlockFirewall` | Agent-tool / wrapper integrations. |
| `createFirewallActionHandler` | Action-handler factory. |
| `createGuardedViemWallet` | Viem wallet wrapper that pre-flights before send. |
| `createByrealGatewayAdapter` | Byreal/RealClaw gateway adapter. |
| `createDefaultBenchmarkScenarios` / `runInterlockBenchmark` | Benchmark suite. |
| `decisionToToolResult` / `decisionToAgentToolResult` / `normalizeAgentToolAction` / `normalizeByrealSkillAction` | Result/action adapters. |

### Calldata helpers & validation
| Function | Description |
| --- | --- |
| `selector` / `getSelector` / `isValidSelector` / `isValidCalldata` | Selector/calldata utilities. |
| `agentRegistryGetAgentCalldata` / `suggestedCalldataForPolicyAction` / `testStrategy*Calldata` | Demo calldata builders. |
| `assertValidAddress` / `assertValidSelector` / `assertValidCalldata` / `assertValidBytes32` / `assertValidDecisionReason` / `assertValidSlippageBps` / `assertPositiveId` / `assertNonNegativeWei` / `assertAllowed` | Input guards. |
| `withRpcRetry` / `isRetryableRpcError` | RPC retry helpers. |
| `actionableError(error)` | Normalize an error to `{ code, message, action }`. |

Error classes: `InterlockError`, `ActionBlockedError`, `AttestationFailedError`, `AgentRegistrationFailedError`, `PolicyCreationFailedError`, `PolicyUpdateFailedError`, `ContractCompatibilityError`, `WalletClientRequiredError`, `InterlockInputError`, `AgentReadError`, `PolicyReadError`, `SetupEventNotFoundError`, `AgentToolInputError`.

---

## CLI commands

`pnpm cli -- <command>` (or `interlock <command>` when installed).

| Command | Description |
| --- | --- |
| `help` | List commands. |
| `init` | Write a starter `.env`. |
| `init-agent-app` | Scaffold a typechecked agent starter (viem/agentkit/goat). |
| `doctor` / `status` / `whoami` | Health check / live status / connected identity. |
| `quickstart` | Full write flow: register → policy → safe + blocked preflight → optional record. |
| `preflight` / `record` | Run a preflight / record a decision. |
| `gateway-run` | Unified gateway (dry-run/record-only/execute/block-alert). |
| `benchmark-run` | Run the benchmark suite. |
| `register-agent` | Register an agent. |
| `policy-create` / `policy-create-preset` / `policy-import` / `policy-update` | Create/update policies. |
| `policy-get` / `policy-check` / `agent-get` / `history` | Reads. |
| `target-allow` / `selector-allow` | Mutate allowlists. |
| `policy-pack` / `policy-pack-list` / `policy-pack-registry` / `policy-pack-validate` / `policy-lint` | Policy packs + lint. |
| `policy-pack-from-abi` | Generate a policy pack from a contract ABI. |
| `policy-audit` / `policy-apply` | Drift-check / reconcile a pack on-chain. |
| `policy-version-snapshot` / `policy-version-diff` / `policy-version-verify` | Policy versioning. |
| `analytics` / `webhook-test` | Recorder analytics / webhook test. |
| `erc8004-identity` / `erc8004-register` | Read / register an ERC-8004 identity. |

---

## MCP tools

`pnpm mcp`.

| Tool | Description |
| --- | --- |
| `interlock_get_status` | Runtime config + reachability. |
| `interlock_preflight` | Pre-flight an action. |
| `interlock_gateway_action` | Gateway (4 modes). |
| `interlock_record_decision` | Record a decision on-chain (needs `PRIVATE_KEY`). |
| `interlock_run_benchmark` | Run the benchmark suite. |
| `interlock_get_safety_card` | Agent stats + history. |
| `interlock_get_policy` | Read a policy + allowlists. |
| `interlock_get_agent_history` | Read `ActionChecked` history. |
| `interlock_explain_decision` / `interlock_explain_block` | Reason-code explanations. |
| `interlock_create_policy_draft` / `interlock_create_policy_pack` / `interlock_validate_policy_pack` | Policy drafting/validation. |
| `interlock_get_erc8004_identity` | Read official ERC-8004 identity. |
| `interlock_register_erc8004_identity` | Register into the official ERC-8004 registry (needs `PRIVATE_KEY`). |
| `interlock_build_erc8004_manifest` | Build an ERC-8004 manifest. |

---

## REST / HTTP routes

### Recorder / indexer (`pnpm indexer`, default `:8787`)
| Route | Description |
| --- | --- |
| `GET /snapshot` | Whole-dashboard snapshot in one request. |
| `GET /agents` · `/agents/:id` · `/agents/:id/actions` | Agent reads. |
| `GET /policies` · `/policies/:id` | Policy reads. |
| `GET /actions` · `/actions/:id` · `/actions?agentId=&policyId=&decision=&selector=` | Action reads + filters. |
| `GET /stats/agents/:id` · `/benchmark/:agentId` | Stats / benchmark. |
| `GET /analytics` · `/analytics/agents/:id` · `/analytics/policies/:id` | Analytics. |
| `POST /sync` | Force a sync. |
| `GET/POST /proposals` · `GET /proposals/:id` | Proposal CRUD. |
| `POST /proposals/:id/preflight` · `/mark-executed` · `/record` | Proposal lifecycle (state-machine guarded). |
| `GET /ecosystem/yields` · `POST /ecosystem/yields/sync` | Live DefiLlama yield signals. |
| `GET /health` · `/status` · `/network` · `/metrics` | Observability (`/metrics` = Prometheus). |

### Web API (Next.js, server-only keys, rate-limited)
| Route | Description |
| --- | --- |
| `POST /api/ai` | Advisory AI (Claude tool-use); 503 if no key. |
| `POST /api/attest` | EIP-712 record signing; 503 if no attestor key. |
| `POST /api/demo/run` | One bounded agent-demo step. |
| `POST /api/strategy-demo/run` | One AI yield-strategy step: live DefiLlama signal → `pickAllocation` → firewall execute-if-allowed → on-chain record. |
| `POST /api/gateway` | Gateway action (4 modes). |
| `POST /api/rpc` | RPC proxy (rate-limited). |
| `GET /api/health` | Configured contracts + key presence + indexer reachability. |

### REST preflight reference server (`examples/preflight-api`)
| Route | Description |
| --- | --- |
| `GET /health` · `POST /preflight` · `POST /preflight/bundle` · `POST /record` · `POST /gateway/action` · `GET /agents/:id/actions` · `GET /policies/:id` | Backend-agent preflight surface. |

---

## Smart contracts

Mantle Sepolia; addresses in [packages/shared/src/addresses.ts](packages/shared/src/addresses.ts).

### AgentRegistry
`registerAgent(metadataURI) → agentId` · `getAgent(agentId)` · `ownerOf(agentId)` · `updateReputation(agentId, decision, reasonCode)` (attestation-only) · `setActionAttestation(addr)` (owner).

### PolicyRegistry
`createPolicy(agentId, maxNativeValue, maxSlippageBps, targets, selectors) → policyId` · `updatePolicy(...)` · `setTargetAllowed(...)` · `setSelectorAllowed(...)` · `getPolicy` · `ownerOf` · `isTargetAllowed` · `isSelectorAllowed` · `getAllowedTargets` · `getAllowedSelectors` · `supportsPolicyEnumeration`.

### ActionAttestationV4 (active — committee-verified recording)
`recordAction(...args, deadline, signatures[])` (EIP-712 digest verified against the AttestorCommittee m-of-n; opens dispute window) · `challenge(actionCheckId, reason)` (agent/policy owner or committee member) · `finalize(actionCheckId)` · `getActionCheck(actionCheckId)` · `setCommittee(addr)` (owner) · `committee()` · `nonces(agentId)` · `DISPUTE_WINDOW()`. Live at `0x69a2ec64285caa68934c4ee1c2f4fab29b08c083`; AgentRegistry is re-pointed to it. _ActionAttestationV3 (single-attestor `recordAction(...,signature)`) stays deployed for historical records._

### PolicyGuardedExecutor (enforcement)
`execute(agentId, policyId, target, value, data)` (reverts disallowed actions) · `previewExecute(...) → (allowed, reasonCode)`.

### TokenGuardedExecutor (policy + on-chain ERC-20 token rules)
`setTokenRule(policyId, token, rule)` (policy owner) · `execute(agentId, policyId, target, value, data)` (reverts on policy OR token-rule violation) · `previewExecute(...) → (allowed, reasonCode)` · `getTokenRule(policyId, token)`. Live at `0x4ab52cbfaf06afc1058c4bb05d7fb1511df01258`. Enforces recipient/spender allowlists, max amount, and an unlimited-approve block for `transfer`/`transferFrom`/`approve`.

### DisputeEscrow (bonds + slashing)
`bondRecord(actionCheckId)` · `openDispute(actionCheckId)` · `resolve(actionCheckId, challengerWins)` (arbiter) · `reclaimRecordBond(actionCheckId)` · `withdraw()` · `getDispute(actionCheckId)` · `setArbiter(addr)` (owner).

### AttestorCommittee (m-of-n)
`isApproved(digest, signatures) → bool` · `addAttestor(addr)` · `removeAttestor(addr)` · `setThreshold(n)` (owner) · `members()` · `memberCount()` · `isMember(addr)`.

### ReputationOracle
`getScore(agentId) → (scoreBps, tier)` · `meetsThreshold(agentId, minScoreBps) → bool`.

### Test strategy targets (demo)
`TestStrategyRouter.routeNativeDeposit` / `quoteNativeDeposit` / `previewDeposit`; `TestStrategyVault.depositFor` / `withdraw` / `totalAssets` / `sharesOf` / `previewDeposit`.

---

## Dashboard views

`apps/web` — landing `/`, control plane `/app` (10 tabs, incl. the **Strategy Agent** tab — live yield
signal → risk-adjusted allocation → firewall decision, on-chain), public safety card `/agent/:id`. The
per-tab breakdown lives in the README [Dashboard](README.md#dashboard) table.
