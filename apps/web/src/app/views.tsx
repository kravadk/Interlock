"use client";

import { useState } from "react";
import { formatEther, isAddress, type Address, type Hex } from "viem";
import {
  buildErc8004AgentManifest,
  generatePolicyPackFromAbi,
  type MantleEcosystemPolicyPack,
} from "@interlock/firewall-sdk";
import { mantleSepolia } from "@interlock/shared";
import { Icon } from "./icons";
import {
  Panel,
  Metric,
  Switch,
  CheckPipeline,
  CopyButton,
  DecisionCard,
  EmptyState,
  Skeleton,
  SkeletonRows,
  TxButton,
  TxResult,
} from "./components/primitives";
import { ActionPipelineChart, ReasonDistribution } from "./components/charts";
import { RecordsTable } from "./components/RecordsTable";
import { DisputePanel } from "./components/DisputePanel";
import { AgentReputation } from "./components/AgentReputation";
import { Erc8004Identity } from "./components/Erc8004Identity";
import { RegisterAgentForm } from "./components/RegisterAgentForm";
import { CreatePolicyForm } from "./components/CreatePolicyForm";
import { OnboardingChecklist } from "./components/OnboardingChecklist";
export { AgentDemoView } from "./components/AgentDemoView";
export { StrategyAgentView } from "./components/StrategyAgentView";
import type { ActiveView } from "./components/shell";
import type { BundleReviewUiReport } from "./control-plane";
import type { ConnectedWallet } from "../lib/wallet";
import type { PreflightDecision } from "../lib/preflight";
import type { ActionProposal, IndexerAction, IndexerAgent, IndexerPolicy, YieldDataPoint } from "../lib/indexer";
import { explorerAddressUrl, mantleRpcUrl, webContracts } from "../lib/contracts";
import { mantleLinks, short, type RecordRow, type ReasonRow, type SortState } from "../lib/dashboard-data";
import { buildRwaEvidenceRows, formatPercent, formatUsd, tokenEvidenceFromAction } from "../lib/action-evidence";
import { aiEnabled, summarizeBlocks, type AiBlockSummary, type AiExplanation } from "../lib/ai";
import { checksToPipeline, idlePipeline, preflightDisabledReason } from "./lib/preflight-pipeline";

export type OnboardingProps = {
  wallet?: ConnectedWallet;
  agentsCount: number;
  policiesCount: number;
  hasDecision: boolean;
  hasRecorded: boolean;
  setActive: (view: ActiveView) => void;
  onConnect: () => void;
};

/* ============================================================
   DASHBOARD
   ============================================================ */
export function DashboardView({
  actions,
  reasonRows,
  rows,
  query,
  setQuery,
  sort,
  setSort,
  loading,
  onboarding,
}: {
  actions: IndexerAction[];
  reasonRows: ReasonRow[];
  rows: RecordRow[];
  query: string;
  setQuery: (query: string) => void;
  sort: SortState;
  setSort: (sort: SortState) => void;
  loading?: boolean;
  onboarding: OnboardingProps;
}) {
  const blocked = actions.filter((action) => action.decision === "BLOCK").length;
  const allowed = actions.filter((action) => action.decision === "ALLOW").length;
  return (
    <>
      <OnboardingChecklist
        wallet={onboarding.wallet}
        agentsCount={onboarding.agentsCount}
        policiesCount={onboarding.policiesCount}
        hasDecision={onboarding.hasDecision}
        hasRecorded={onboarding.hasRecorded}
        setActive={onboarding.setActive}
        onConnect={onboarding.onConnect}
      />
      <div className="row-2">
        <section className="panel">
          <div className="panel-head">
            <span className="coin-badge" style={{ background: "#34d39e" }}>
              A
            </span>
            <span className="title">
              Agent Action Pipeline{" "}
              <span style={{ color: "var(--tx-3)", fontSize: 12, fontWeight: 400 }}>Mantle</span>
            </span>
          </div>
          <div className="chart-price">
            <div className="pv">{loading ? <Skeleton w={120} h={16} /> : `${actions.length} indexed actions`}</div>
            <div className={`pc ${blocked ? "down" : "up"}`}>
              {loading ? null : (
                <>
                  {allowed} allowed <span style={{ color: "var(--tx-3)" }}>/ {blocked} blocked</span>
                </>
              )}
            </div>
          </div>
          {loading ? <div style={{ padding: 16 }}><SkeletonRows rows={5} /></div> : <ActionPipelineChart actions={actions} />}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="title">Reason Distribution</div>
              <div className="ptitle-sub">Why actions passed or were blocked.</div>
            </div>
          </div>
          {loading ? <div style={{ padding: 16 }}><SkeletonRows rows={5} /></div> : <ReasonDistribution rows={reasonRows} />}
        </section>
      </div>

      <RecordsTable
        title="Flight Recorder"
        subtitle="Real indexed actions, agents, policies, and ecosystem links."
        rows={rows}
        query={query}
        setQuery={setQuery}
        sort={sort}
        setSort={setSort}
        loading={loading}
      />
    </>
  );
}

/* ============================================================
   AGENTS
   ============================================================ */
export function AgentsView({
  agents,
  selectedAgent,
  agentId,
  setAgentId,
  account,
  wrongChain,
  onRegistered,
}: {
  agents: IndexerAgent[];
  selectedAgent?: IndexerAgent;
  agentId: string;
  setAgentId: (id: string) => void;
  account?: Address;
  wrongChain?: boolean;
  onRegistered: (agentId: string) => void;
}) {
  const manifest = buildErc8004AgentManifest({
    interlockAgentId: agentId || "0",
    name: `Interlock Agent ${agentId || "unselected"}`,
    description: "Mantle AI agent protected by Interlock pre-flight policy checks and on-chain decision attestations.",
    services: [
      { type: "dashboard", url: `/agent/${agentId || ":id"}` },
      { type: "mcp", url: "interlock_get_safety_card" },
    ],
  });
  return (
    <>
      <RegisterAgentForm account={account} wrongChain={wrongChain} onRegistered={onRegistered} />

      <Panel title="Agent Safety Card" subtitle="Identity and counters from real ActionChecked events.">
        <div className="form-grid">
          <label>
            Agent ID
            <input value={agentId} onChange={(event) => setAgentId(event.target.value)} />
          </label>
          <Metric label="Total actions" value={selectedAgent?.totalActions ?? 0} />
          <Metric label="Allowed" value={selectedAgent?.allowedActions ?? 0} />
          <Metric label="Blocked" value={selectedAgent?.blockedActions ?? 0} />
          <Metric label="Failed simulations" value={selectedAgent?.failedSimulations ?? 0} />
          <Metric label="Policies seen" value={selectedAgent?.policyIds?.length ?? 0} />
          <AgentReputation agentId={agentId} />
        </div>
        <div style={{ padding: "0 16px 16px" }}>
          {selectedAgent?.latestAction ? (
            <a
              className="btn"
              href={explorerAddressUrl(webContracts.agentRegistry)}
              target="_blank"
              rel="noreferrer"
            >
              <Icon.eye s={16} />
              <span>Latest tx | {short(selectedAgent.latestAction.transactionHash)}</span>
            </a>
          ) : null}
        </div>
      </Panel>

      <Panel title="ERC-8004 Identity" subtitle="Real identity + reputation from the official ERC-8004 registries on Mantle Sepolia. Interlock acts as a Validator (its firewall attestations are the trust signal).">
        <div style={{ padding: "0 16px 16px", display: "grid", gap: 12 }}>
          <Erc8004Identity agentId={agentId} account={account} wrongChain={wrongChain} />
          <div className="snippet-head">
            <span className="snippet-label">Agent registration manifest</span>
            <CopyButton text={JSON.stringify(manifest, null, 2)} />
          </div>
          <pre className="snippet">{JSON.stringify(manifest, null, 2)}</pre>
        </div>
      </Panel>

      <Panel title="Indexed Agents" subtitle="Agents discovered from the current RPC snapshot.">
        {agents.length ? (
          <div className="card-grid">
            {agents.map((agent) => (
              <button
                key={agent.agentId}
                type="button"
                className={`mini-card clickable${agent.agentId === agentId ? " pass" : ""}`}
                onClick={() => setAgentId(agent.agentId)}
              >
                <div className="mc-head">
                  <strong>Agent #{agent.agentId}</strong>
                  <span className="mc-tag ready">{agent.totalActions} actions</span>
                </div>
                <div className="chip-row">
                  <span className="chip">{agent.allowedActions} allow</span>
                  <span className="chip">{agent.blockedActions} block</span>
                  <span className="chip">{agent.policyIds.length} policies</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ padding: 16 }}>
            <EmptyState
              actionLabel="Register your first agent"
              onAction={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
              No registered agents yet. Use the form above to create your first on-chain agent.
            </EmptyState>
          </div>
        )}
      </Panel>
    </>
  );
}

/* ============================================================
   POLICIES
   ============================================================ */
export function PoliciesView({
  policies: _policies,
  selectedPolicy,
  policyId,
  setPolicyId,
  packs,
  account,
  wrongChain,
  agentId,
  onCreated,
}: {
  policies: IndexerPolicy[];
  selectedPolicy?: IndexerPolicy;
  policyId: string;
  setPolicyId: (id: string) => void;
  packs: MantleEcosystemPolicyPack[];
  account?: Address;
  wrongChain?: boolean;
  agentId: string;
  onCreated: (policyId: string) => void;
}) {
  const [abiAddress, setAbiAddress] = useState(selectedPolicy?.allowedTargets?.[0] ?? "");
  const [abiJson, setAbiJson] = useState("");
  const [includeViewFunctions, setIncludeViewFunctions] = useState(true);
  const [abiError, setAbiError] = useState("");
  const [abiPackJson, setAbiPackJson] = useState("");
  const [abiSelectors, setAbiSelectors] = useState<Array<{ selector: Hex; label: string; stateMutability?: string }>>([]);

  function buildPolicyPackFromAbi() {
    setAbiError("");
    setAbiPackJson("");
    setAbiSelectors([]);
    try {
      const generated = generatePolicyPackFromAbi({
        address: abiAddress as Address,
        abi: abiJson,
        chainId: mantleSepolia.id,
        includeViewFunctions,
      });
      setAbiSelectors(generated.generatedSelectors);
      setAbiPackJson(JSON.stringify(generated, null, 2));
    } catch (error) {
      setAbiError(error instanceof Error ? error.message : "Unknown ABI builder error.");
    }
  }

  return (
    <>
      <CreatePolicyForm
        account={account}
        wrongChain={wrongChain}
        agentId={agentId}
        packs={packs}
        onCreated={onCreated}
      />

      {_policies.length === 0 ? (
        <Panel title="No policies yet" subtitle="A policy defines the guardrails an agent must pass before any action is allowed.">
          <EmptyState>Create your first policy with the form above - start from a Mantle pack or describe it in plain English.</EmptyState>
        </Panel>
      ) : null}

      <Panel title="Policy Editor" subtitle="Real policy id plus Mantle policy-pack templates.">
        <div className="form-grid">
          <label>
            Policy ID
            <input value={policyId} onChange={(event) => setPolicyId(event.target.value)} />
          </label>
          <Metric
            label="Max value (MNT)"
            value={selectedPolicy?.maxNativeValue ? formatEther(BigInt(selectedPolicy.maxNativeValue)) : "-"}
          />
          <Metric label="Max slippage (bps)" value={selectedPolicy?.maxSlippageBps ?? "-"} />
          <Metric label="Allowed targets" value={selectedPolicy?.allowedTargets?.length ?? 0} />
          <Metric label="Selectors" value={selectedPolicy?.allowedSelectors?.length ?? 0} />
          <Metric label="Total actions" value={selectedPolicy?.totalActions ?? 0} />
          <div className="metric-box policy-switch-box">
            <span>Policy state</span>
            <Switch
              checked={selectedPolicy?.active === true}
              readOnly={selectedPolicy?.active !== undefined}
              disabled={selectedPolicy?.active === undefined}
              label={selectedPolicy?.active === undefined ? "not loaded" : selectedPolicy.active ? "active" : "inactive"}
            />
          </div>
        </div>
        {selectedPolicy?.owner ? (
          <div style={{ padding: "0 16px 16px" }}>
            <a className="btn" href={explorerAddressUrl(selectedPolicy.owner)} target="_blank" rel="noreferrer">
              <Icon.eye s={16} />
              <span>Owner | {short(selectedPolicy.owner)}</span>
            </a>
          </div>
        ) : null}
      </Panel>

      <Panel title="Mantle Policy Packs" subtitle="Templates only - no fake protocol addresses.">
        <div className="card-grid">
          {packs.map((pack) => (
            <div key={pack.id} className="mini-card">
              <div className="mc-head">
                <strong>{pack.name}</strong>
                <span className={`mc-tag ${pack.mode}`}>{pack.mode}</span>
              </div>
              <p>{pack.description}</p>
              <div className="chip-row">
                {pack.supportedSelectors.slice(0, 3).map((sel) => (
                  <span key={sel.selector} className="chip">
                    {sel.label}
                  </span>
                ))}
              </div>
              <div className="chip-row">
                {pack.trackFit.slice(0, 3).map((track) => (
                  <span key={track} className="chip" style={{ color: "var(--cyan)" }}>
                    {track}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Build From ABI" subtitle="Generate a reviewable policy-pack template from a real contract ABI.">
        <div className="form-grid">
          <label>
            Contract address
            <input value={abiAddress} onChange={(event) => setAbiAddress(event.target.value)} placeholder="0x..." />
          </label>
          <div className="metric-box policy-switch-box">
            <span>Include view/pure selectors</span>
            <Switch
              checked={includeViewFunctions}
              onChange={setIncludeViewFunctions}
              label={includeViewFunctions ? "included" : "excluded"}
            />
          </div>
          <label className="wide-input">
            ABI JSON
            <textarea
              value={abiJson}
              onChange={(event) => setAbiJson(event.target.value)}
              placeholder='[{"type":"function","name":"deposit","inputs":[],"stateMutability":"payable"}]'
            />
          </label>
        </div>
        <div style={{ padding: "0 16px 16px", display: "grid", gap: 12 }}>
          <button className="mini-btn" type="button" onClick={buildPolicyPackFromAbi} disabled={!abiAddress || !abiJson}>
            <Icon.bolt s={14} />
            <span>Generate policy pack</span>
          </button>
          {abiError ? <div className="error-box">{abiError}</div> : null}
          {abiSelectors.length ? (
            <div className="chip-row">
              {abiSelectors.slice(0, 12).map((selector) => (
                <span key={selector.selector} className="chip" title={selector.label}>
                  {selector.selector} | {selector.stateMutability ?? "function"}
                </span>
              ))}
            </div>
          ) : null}
          {abiPackJson ? (
            <>
              <div className="snippet-head">
                <span className="snippet-label">Generated policy pack JSON</span>
                <CopyButton text={abiPackJson} />
              </div>
              <pre className="snippet">{abiPackJson}</pre>
            </>
          ) : (
            <div className="form-hint">Generated packs stay in template mode until you review selectors and apply them to a real on-chain policy.</div>
          )}
        </div>
      </Panel>
    </>
  );
}

/* ============================================================
   PREFLIGHT
   ============================================================ */
export function PreflightView(props: {
  agentId: string;
  policyId: string;
  target: string;
  value: string;
  calldata: string;
  slippageBps: number;
  decision?: PreflightDecision;
  ai?: AiExplanation;
  aiLoading?: boolean;
  error: string;
  loading: boolean;
  setAgentId: (value: string) => void;
  setPolicyId: (value: string) => void;
  setTarget: (value: string) => void;
  setValue: (value: string) => void;
  setCalldata: (value: string) => void;
  setSlippageBps: (value: number) => void;
  runPreflight: () => void;
  loadPreset: (kind: "safe" | "unknown" | "overspend") => void;
  canRecord: boolean;
  recordDisabledReason?: string;
  recordLoading: boolean;
  recordTxHash?: string;
  recordError: string;
  onRecord: () => void;
  guardConfigured?: boolean;
  onExecuteEnforced?: () => void;
  execLoading?: boolean;
  execTxHash?: string;
  execError?: string;
  proposals: ActionProposal[];
  bundleReport?: BundleReviewUiReport;
  bundleError?: string;
  bundleLoading?: boolean;
  runBundleReview: (kind?: "current" | "current-plus-unknown") => void;
  ecosystemYields: YieldDataPoint[];
}) {
  const checks = props.decision ? checksToPipeline(props.decision) : idlePipeline();
  const disabledReason = preflightDisabledReason(props);
  const tokenEvidence = tokenEvidenceFromAction(props.target, props.calldata);
  const rwaEvidence = buildRwaEvidenceRows(props.ecosystemYields);
  return (
    <>
      <Panel title="Action Review" subtitle="Agent proposes a tx, Interlock checks it, then returns allow or block.">
        <div className="preset-row">
          <button className="mini-btn" type="button" onClick={() => props.loadPreset("safe")}>
            <Icon.check s={15} />
            <span>Safe action</span>
          </button>
          <button className="mini-btn" type="button" onClick={() => props.loadPreset("unknown")}>
            <Icon.shield s={15} />
            <span>Unknown target</span>
          </button>
          <button className="mini-btn" type="button" onClick={() => props.loadPreset("overspend")}>
            <Icon.scale s={15} />
            <span>Overspend</span>
          </button>
        </div>
        <div className="form-grid">
          <label>
            Agent ID
            <input value={props.agentId} onChange={(event) => props.setAgentId(event.target.value)} />
          </label>
          <label>
            Policy ID
            <input value={props.policyId} onChange={(event) => props.setPolicyId(event.target.value)} />
          </label>
          <label>
            Target
            <input value={props.target} onChange={(event) => props.setTarget(event.target.value)} />
          </label>
          <label>
            Value (MNT)
            <input value={props.value} onChange={(event) => props.setValue(event.target.value)} />
          </label>
          <label className="wide-input">
            Calldata
            <input value={props.calldata} onChange={(event) => props.setCalldata(event.target.value)} />
          </label>
          <label>
            Slippage (bps)
            <input
              type="number"
              value={props.slippageBps}
              onChange={(event) => props.setSlippageBps(Number(event.target.value))}
            />
          </label>
        </div>
        <button
          className={`btn btn-wallet run-btn${props.loading ? " is-loading" : ""}`}
          type="button"
          onClick={props.runPreflight}
          disabled={props.loading || Boolean(disabledReason)}
          title={disabledReason || undefined}
        >
          <Icon.bolt s={16} />
          <span>{props.loading ? "Checking..." : "Run live preflight"}</span>
        </button>
        {disabledReason ? <div className="inlineWarning">{disabledReason}</div> : null}
        {props.decision ? (
          <DecisionCard
            allowed={props.decision.allowed}
            decision={props.decision.decision}
            reason={props.decision.reason}
            explanation={props.decision.explanation}
            ai={props.ai}
            aiLoading={props.aiLoading}
          />
        ) : null}
        {props.decision ? (
          <div style={{ padding: "0 16px 16px", display: "grid", gap: 10 }}>
            <TxButton
              label="Record decision on-chain"
              pendingLabel="Recording..."
              icon="shield"
              onClick={props.onRecord}
              pending={props.recordLoading}
              disabled={!props.canRecord}
              title={props.recordDisabledReason}
            />
            <span className="form-hint">
              {props.recordDisabledReason ?? "Writes an immutable ActionChecked attestation. Requires being the policy owner."}
            </span>
            <TxResult
              status={props.recordError ? "error" : props.recordTxHash ? "success" : props.recordLoading ? "pending" : "idle"}
              explorerUrl={props.recordTxHash ? `https://sepolia.mantlescan.xyz/tx/${props.recordTxHash}` : undefined}
              txHash={props.recordTxHash}
              error={props.recordError}
              successLabel="Attestation recorded - see Flight Recorder"
            />
            {props.guardConfigured && props.onExecuteEnforced ? (
              <>
                <TxButton
                  label="Execute (enforced on-chain)"
                  pendingLabel="Executing..."
                  icon="bolt"
                  onClick={props.onExecuteEnforced}
                  pending={props.execLoading}
                  disabled={!props.canRecord}
                  title={props.recordDisabledReason}
                />
                <span className="form-hint">
                  Routes the action through PolicyGuardedExecutor - an ALLOW executes, a BLOCK <strong>reverts on-chain</strong>.
                </span>
                <TxResult
                  status={props.execError ? "error" : props.execTxHash ? "success" : props.execLoading ? "pending" : "idle"}
                  explorerUrl={props.execTxHash ? `https://sepolia.mantlescan.xyz/tx/${props.execTxHash}` : undefined}
                  txHash={props.execTxHash}
                  error={props.execError}
                  successLabel="Enforced execution confirmed on-chain"
                />
              </>
            ) : null}
          </div>
        ) : null}
        {props.error ? <div className="error-box" style={{ margin: "0 16px 16px" }}>{props.error}</div> : null}
      </Panel>

      <Panel title="Policy Check Pipeline" subtitle="Each independent check the firewall runs before allowing an action.">
        <CheckPipeline checks={checks} />
      </Panel>

      <Panel title="Bundle Review" subtitle="Review multi-step agent routes before execution; a bundle is allowed only if every action passes.">
        <div style={{ padding: "0 16px 16px", display: "grid", gap: 12 }}>
          <div className="preset-row">
            <button className={`mini-btn${props.bundleLoading ? " is-loading" : ""}`} type="button" onClick={() => props.runBundleReview("current")} disabled={props.bundleLoading}>
              <Icon.bolt s={15} />
              <span>{props.bundleLoading ? "Reviewing..." : "Review current action"}</span>
            </button>
            <button className={`mini-btn${props.bundleLoading ? " is-loading" : ""}`} type="button" onClick={() => props.runBundleReview("current-plus-unknown")} disabled={props.bundleLoading}>
              <Icon.shield s={15} />
              <span>Current + unknown target</span>
            </button>
          </div>
          {props.bundleError ? <div className="error-box">{props.bundleError}</div> : null}
          {props.bundleReport ? (
            <>
              <DecisionCard
                allowed={props.bundleReport.allowed}
                decision={props.bundleReport.decision}
                reason={props.bundleReport.reasonCode}
                explanation={props.bundleReport.summary}
              />
              <div className="card-grid">
                {props.bundleReport.decisions.map((item, index) => (
                  <div key={`${item.label}-${index}`} className={`mini-card ${item.allowed ? "pass" : "fail"}`}>
                    <div className="mc-head">
                      <strong>{item.label}</strong>
                      <span className="mc-tag">{item.decision}</span>
                    </div>
                    <p>{item.explanation}</p>
                    <div className="chip-row">
                      <span className="chip">{short(item.target)}</span>
                      <span className="chip">{item.reason}</span>
                      <span className="chip">{item.selector}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <EmptyState>Run a bundle review to inspect multi-step action risk. No bundle result is shown until live preflight checks complete.</EmptyState>
          )}
        </div>
      </Panel>

      <Panel title="Token &amp; RWA Evidence" subtitle="Advisory (off-chain) token-rule and yield/RWA checks. These do not change the on-chain ALLOW/BLOCK or the recorded attestation.">
        <div className="card-grid">
          <div className="mini-card">
            <div className="mc-head">
              <strong>ERC20 token rule</strong>
              <span className={`mc-tag ${tokenEvidence.status}`}>{tokenEvidence.status}</span>
            </div>
            <p>{tokenEvidence.message}</p>
            {tokenEvidence.reasonCode || tokenEvidence.details.length ? (
              <div className="chip-row">
                {tokenEvidence.reasonCode ? <span className="chip">{tokenEvidence.reasonCode}</span> : null}
                {tokenEvidence.details.map((detail) => (
                  <span key={detail} className="chip">{detail}</span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="mini-card">
            <div className="mc-head">
              <strong>RWA/yield evidence</strong>
              <span className={`mc-tag ${rwaEvidence.status}`}>{rwaEvidence.status}</span>
            </div>
            <p>{rwaEvidence.message}</p>
            {rwaEvidence.reasonCode || rwaEvidence.evidenceHash || rwaEvidence.rows.length ? (
              <div className="chip-row">
                {rwaEvidence.reasonCode ? <span className="chip">{rwaEvidence.reasonCode}</span> : null}
                {rwaEvidence.evidenceHash ? <span className="chip">evidence {short(rwaEvidence.evidenceHash)}</span> : null}
                {rwaEvidence.rows.slice(0, 4).map((row) => (
                  <span key={row} className="chip">{row}</span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </Panel>

      <Panel title="Proposal Lifecycle" subtitle="Real proposals persisted by the Recorder Service. RPC fallback shows an honest empty state.">
        <ProposalTimeline proposals={props.proposals} agentId={props.agentId} policyId={props.policyId} />
      </Panel>
    </>
  );
}

/* ============================================================
   BENCHMARK
   ============================================================ */
export function BenchmarkView({
  loadPreset,
  runPreflight,
  decision,
  runBundleReview,
  bundleReport,
  bundleLoading,
}: {
  loadPreset: (kind: "safe" | "unknown" | "overspend" | "slippage" | "approve" | "incomplete" | "empty") => void;
  runPreflight: () => void;
  decision?: PreflightDecision;
  runBundleReview: (kind?: "current" | "current-plus-unknown") => void;
  bundleReport?: BundleReviewUiReport;
  bundleLoading?: boolean;
}) {
  const scenarios = [
    { kind: "safe", title: "Safe agent read", desc: "Zero-value, allowlisted AgentRegistry read that should pass every check.", expect: "ALLOW", reason: "POLICY_PASSED", color: "#34d39e" },
    { kind: "unknown", title: "Unknown target attack", desc: "Agent points at a real deployed contract that is not on the policy allowlist.", expect: "BLOCK", reason: "TARGET_NOT_ALLOWED", color: "#f06d6d" },
    { kind: "overspend", title: "Overspend attempt", desc: "Agent tries to move native value above the policy max spend.", expect: "BLOCK", reason: "VALUE_LIMIT_EXCEEDED", color: "#f06d6d" },
    { kind: "slippage", title: "High slippage attempt", desc: "Agent proposes slippage metadata above the selected policy limit.", expect: "BLOCK", reason: "SLIPPAGE_LIMIT_EXCEEDED", color: "#f5c66d" },
    { kind: "approve", title: "Unapproved approve selector", desc: "Agent tries an approve-like selector that is not part of the selected capability set.", expect: "BLOCK", reason: "UNKNOWN_SELECTOR", color: "#f06d6d" },
    { kind: "incomplete", title: "Incomplete calldata", desc: "Agent sends only an approved selector without required ABI-encoded arguments.", expect: "BLOCK", reason: "SIMULATION_FAILED", color: "#f5c66d" },
    { kind: "empty", title: "Empty calldata check", desc: "Agent proposes empty calldata against an otherwise allowlisted target.", expect: "BLOCK", reason: "UNKNOWN_SELECTOR", color: "#f5c66d" },
  ] as const;

  return (
    <Panel title="Benchmark Arena" subtitle="Repeatable judge-friendly safety scenarios run against the live firewall.">
      <div className="card-grid">
        {scenarios.map((scenario) => {
          const result =
            decision && decision.decision === scenario.expect && decision.reason === scenario.reason
              ? "pass"
              : decision
                ? "fail"
                : undefined;
          return (
            <button
              key={scenario.kind}
              type="button"
              className={`mini-card clickable${result ? ` ${result}` : ""}`}
              onClick={() => {
                loadPreset(scenario.kind);
                setTimeout(runPreflight, 60);
              }}
            >
                <div className="mc-head">
                  <strong>{scenario.title}</strong>
                  <span className="mc-tag" style={{ color: scenario.color, borderColor: scenario.color }}>
                    expect {scenario.expect}
                  </span>
                </div>
                <p>{scenario.desc}</p>
                <div className="chip-row">
                  <span className="chip">
                    <Icon.bolt s={12} /> Run scenario
                  </span>
                  <span className="chip">{scenario.reason}</span>
                  {result ? (
                  <span className="chip" style={{ color: result === "pass" ? "var(--green)" : "var(--red)" }}>
                    {result === "pass" ? "ok matched" : "x mismatch"}
                  </span>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
      {decision ? (
        <>
          <DecisionCard allowed={decision.allowed} decision={decision.decision} reason={decision.reason} />
          <div style={{ padding: "0 4px" }}>
            <CheckPipeline checks={checksToPipeline(decision)} />
          </div>
        </>
      ) : null}
      <div style={{ padding: "0 16px 16px", display: "grid", gap: 12 }}>
        <button
          type="button"
          className={`mini-card clickable${bundleReport?.decision === "BLOCK" ? " pass" : ""}${bundleLoading ? " is-loading" : ""}`}
          onClick={() => runBundleReview("current-plus-unknown")}
          disabled={bundleLoading}
        >
          <div className="mc-head">
            <strong>Multi-step bundle route</strong>
            <span className="mc-tag" style={{ color: "#f06d6d", borderColor: "#f06d6d" }}>
              expect BLOCK
            </span>
          </div>
          <p>Reviews the current action plus an unknown-target probe. One blocked action must block the full bundle.</p>
          <div className="chip-row">
            <span className="chip">{bundleLoading ? "reviewing..." : "Run bundle scenario"}</span>
            <span className="chip">TARGET_NOT_ALLOWED</span>
          </div>
        </button>
        {bundleReport ? (
          <DecisionCard
            allowed={bundleReport.allowed}
            decision={bundleReport.decision}
            reason={bundleReport.reasonCode}
            explanation={bundleReport.summary}
          />
        ) : null}
      </div>
    </Panel>
  );
}

/* ============================================================
   AGENT DEMO - autonomous loop, gated live
   ============================================================ */
/* ============================================================
   RECORDER
   ============================================================ */
export function RecorderView({
  rows,
  query,
  setQuery,
  sort,
  setSort,
  trend,
  setTrend,
  loading,
  account,
  wrongChain,
  proposals,
}: {
  rows: RecordRow[];
  query: string;
  setQuery: (query: string) => void;
  sort: SortState;
  setSort: (sort: SortState) => void;
  trend: string;
  setTrend: (trend: string) => void;
  loading?: boolean;
  account?: Address;
  wrongChain?: boolean;
  proposals: ActionProposal[];
}) {
  return (
    <>
      <RecordsTable
        title="Flight Recorder"
        subtitle="Every indexed action, agent, policy, and ecosystem link in one searchable table."
        rows={rows}
        query={query}
        setQuery={setQuery}
        sort={sort}
        setSort={setSort}
        loading={loading}
        trend={trend}
        setTrend={setTrend}
      />
      <Panel title="Action Proposals" subtitle="Agent proposal lifecycle before or around on-chain evidence.">
        <ProposalTimeline proposals={proposals} />
      </Panel>
      <DisputePanel account={account} wrongChain={wrongChain} />
    </>
  );
}

/* ============================================================
   ANALYTICS
   ============================================================ */
export function AnalyticsView({ rows, actions }: { rows: ReasonRow[]; actions: IndexerAction[] }) {
  const allowed = actions.filter((action) => action.decision === "ALLOW").length;
  const blocked = actions.filter((action) => action.decision === "BLOCK").length;
  const failed = actions.filter((action) => action.reasonCode === "SIMULATION_FAILED").length;

  const [summary, setSummary] = useState<AiBlockSummary>();
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState("");

  async function runSummary() {
    setSummaryError("");
    setSummarizing(true);
    try {
      const result = await summarizeBlocks({
        reasons: rows.map((row) => ({ reason: row.reason, count: row.count })),
        totals: { total: actions.length, allowed, blocked },
        recentBlocks: actions
          .filter((action) => action.decision === "BLOCK")
          .slice(0, 10)
          .map((action) => ({ reasonCode: action.reasonCode, target: action.target, value: action.value })),
      });
      if (!result.ok) {
        setSummaryError(result.reason);
        return;
      }
      setSummary(result.data);
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <>
      <div className="row-2">
        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="title">Reason Distribution</div>
              <div className="ptitle-sub">Block reasons across all indexed actions.</div>
            </div>
          </div>
          <ReasonDistribution rows={rows} />
        </section>

        <Panel title="Agent Metrics" subtitle="Real event-derived analytics.">
          <div className="row-cards">
            <Metric label="Total actions" value={actions.length} />
            <Metric label="Allowed" value={allowed} />
            <Metric label="Blocked" value={blocked} />
            <Metric label="Failed simulations" value={failed} />
            <Metric label="Block rate" value={actions.length ? `${Math.round((blocked / actions.length) * 100)}%` : "0%"} />
          </div>
        </Panel>
      </div>

      {aiEnabled() ? (
        <Panel title="AI Block Summary" subtitle="Plain-language narrative of what the firewall is blocking and why.">
          <div style={{ padding: "0 16px 16px", display: "grid", gap: 12 }}>
            <button type="button" className="mini-btn" onClick={runSummary} disabled={summarizing || !actions.length}>
              <Icon.bolt s={15} />
              <span>{summarizing ? "Summarizing..." : "Summarize with AI"}</span>
            </button>
            {summaryError ? <div className="form-hint">{summaryError}</div> : null}
            {summary ? (
              <div className="ai-summary">
                <p className="ai-plain">{summary.narrative}</p>
                {summary.topRisks.length ? (
                  <div className="ai-summary-block">
                    <span className="ai-tag"><Icon.shield s={12} /> Top risks</span>
                    <ul>
                      {summary.topRisks.map((risk, i) => (
                        <li key={i}>{risk}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {summary.suggestions.length ? (
                  <div className="ai-summary-block">
                    <span className="ai-tag"><Icon.check s={12} /> Suggestions</span>
                    <ul>
                      {summary.suggestions.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </Panel>
      ) : null}
    </>
  );
}

/* ============================================================
   INTEGRATE
   ============================================================ */
export function IntegrateView({
  agentId,
  policyId,
  target,
  value,
  calldata,
  slippageBps,
  ecosystemYields,
  onSyncYields,
}: {
  agentId: string;
  policyId: string;
  target: string;
  value: string;
  calldata: string;
  slippageBps: number;
  ecosystemYields: YieldDataPoint[];
  onSyncYields: () => void;
}) {
  const setupSnippet =
    agentId && policyId
      ? ""
      : `const agentId = BigInt(process.env.AGENT_ID!);
const policyId = BigInt(process.env.POLICY_ID!);

`;
  const sdkSnippet = `${setupSnippet}const decision = await firewall.checkAction({
  agentId: ${agentId ? `${agentId}n` : "agentId"},
  policyId: ${policyId ? `${policyId}n` : "policyId"},
  tx: {
    to: "${target}",
    value: parseEther("${value || "0"}"),
    data: "${calldata}",
  },
  metadata: { expectedSlippageBps: ${slippageBps} },
});

if (!decision.allowed) {
  throw new FirewallBlockedError(decision.reason);
}`;

  const bundleSnippet = `const bundle = await firewall.checkActionBundle({
  agentId: ${agentId ? `${agentId}n` : "agentId"},
  policyId: ${policyId ? `${policyId}n` : "policyId"},
  intent: "Review a multi-step Mantle agent route before execution",
  actions: [
    {
      agentId: ${agentId ? `${agentId}n` : "agentId"},
      policyId: ${policyId ? `${policyId}n` : "policyId"},
      tx: { to: "${target}", value: parseEther("${value || "0"}"), data: "${calldata}" },
      metadata: { expectedSlippageBps: ${slippageBps} },
    },
  ],
});

if (!bundle.allowed) {
  console.log(bundle.summary);
}`;

  const cliSnippet = `pnpm cli -- policy-pack-from-abi --address ${target} --abi ./abi.json --out policies/generated.json
pnpm cli -- init-agent-app --out ./my-interlock-agent --template viem
pnpm --filter @interlock/agent-demo goal -- --goal "review Mantle agent action"`;

  const envSnippet = `NEXT_PUBLIC_MANTLE_RPC_URL=${mantleRpcUrl()}
NEXT_PUBLIC_AGENT_REGISTRY=${webContracts.agentRegistry}
NEXT_PUBLIC_POLICY_REGISTRY=${webContracts.policyRegistry}
NEXT_PUBLIC_ACTION_ATTESTATION=${webContracts.actionAttestation}`;

  return (
    <>
      <Panel title="Developer Integration" subtitle="Drop the firewall in front of any agent action on Mantle.">
        <div className="snippet-head">
          <span className="snippet-label">firewall.checkAction</span>
          <CopyButton text={sdkSnippet} />
        </div>
        <pre className="snippet">{sdkSnippet}</pre>
        <div className="snippet-head">
          <span className="snippet-label">firewall.checkActionBundle</span>
          <CopyButton text={bundleSnippet} />
        </div>
        <pre className="snippet">{bundleSnippet}</pre>
        <div className="snippet-head">
          <span className="snippet-label">CLI generators</span>
          <CopyButton text={cliSnippet} />
        </div>
        <pre className="snippet">{cliSnippet}</pre>
        <div className="snippet-head">
          <span className="snippet-label">.env</span>
          <CopyButton text={envSnippet} />
        </div>
        <pre className="snippet">{envSnippet}</pre>
      </Panel>

      <Panel title="Deployed Contracts &amp; Ecosystem" subtitle="Interlock on Mantle Sepolia + useful links.">
        <div className="card-grid">
          <a className="mini-card" href={explorerAddressUrl(webContracts.agentRegistry)} target="_blank" rel="noreferrer">
            <div className="mc-head">
              <strong>AgentRegistry</strong>
              <span className="mc-tag">Contract</span>
            </div>
            <p>{short(webContracts.agentRegistry)}</p>
          </a>
          <a className="mini-card" href={explorerAddressUrl(webContracts.policyRegistry)} target="_blank" rel="noreferrer">
            <div className="mc-head">
              <strong>PolicyRegistry</strong>
              <span className="mc-tag">Contract</span>
            </div>
            <p>{short(webContracts.policyRegistry)}</p>
          </a>
          <a className="mini-card" href={explorerAddressUrl(webContracts.actionAttestation)} target="_blank" rel="noreferrer">
            <div className="mc-head">
              <strong>ActionAttestation</strong>
              <span className="mc-tag">Contract</span>
            </div>
            <p>{short(webContracts.actionAttestation)}</p>
          </a>
          {mantleLinks.map((link) => (
            <a key={link.href} className="mini-card" href={link.href} target="_blank" rel="noreferrer">
              <div className="mc-head">
                <strong>{link.name}</strong>
                <span className="mc-tag">{link.type}</span>
              </div>
              <p>{link.status}</p>
            </a>
          ))}
        </div>
        <div style={{ padding: "0 16px 16px", color: "var(--tx-3)", fontSize: 12 }}>
          Chain {mantleSepolia.id} | {mantleSepolia.name}
        </div>
      </Panel>

      <Panel title="Live Yield / RWA Signals" subtitle="Read-only ecosystem data for advisory RWA and DeFi policy evidence.">
        <div style={{ padding: "0 16px 12px" }}>
          <button className="mini-btn" type="button" onClick={onSyncYields}>
            <Icon.bolt s={14} />
            <span>Sync live yield signals</span>
          </button>
        </div>
        {ecosystemYields.length ? (
          <div className="card-grid">
            {ecosystemYields.slice(0, 6).map((point) => (
              <div key={point.poolId} className="mini-card">
                <div className="mc-head">
                  <strong>{point.project}</strong>
                  <span className="mc-tag">{point.chain ?? "Mantle"}</span>
                </div>
                <p>{point.symbol ?? point.poolId}</p>
                <div className="chip-row">
                  <span className="chip">TVL {formatUsd(point.tvlUsd)}</span>
                  <span className="chip">APY {formatPercent(point.apy)}</span>
                </div>
                {point.riskNotes.length ? <p>{point.riskNotes.join(" | ")}</p> : null}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>
            No live yield records loaded. Configure a Recorder Service and run the sync button; the dashboard will not show fallback fake rows.
          </EmptyState>
        )}
      </Panel>
    </>
  );
}

function ProposalTimeline({ proposals, agentId, policyId }: { proposals: ActionProposal[]; agentId?: string; policyId?: string }) {
  const scoped = proposals
    .filter((proposal) => (agentId ? proposal.agentId === agentId : true))
    .filter((proposal) => (policyId ? proposal.policyId === policyId : true))
    .slice(0, 8);
  if (!scoped.length) {
    return (
      <EmptyState>
        No persisted proposals for this scope. Create proposals through the Recorder API or agent goal runner; this panel does not synthesize lifecycle rows.
      </EmptyState>
    );
  }
  return (
    <div className="card-grid">
      {scoped.map((proposal) => (
        <div key={proposal.proposalId} className="mini-card">
          <div className="mc-head">
            <strong>{proposal.status}</strong>
            <span className="mc-tag">{proposal.decision ?? "pending"}</span>
          </div>
          <p>{proposal.intent}</p>
          <div className="chip-row">
            <span className="chip">agent {proposal.agentId}</span>
            <span className="chip">policy {proposal.policyId}</span>
            <span className="chip">{short(proposal.target)}</span>
          </div>
          <div className="progress-line" aria-label={`Proposal ${proposal.proposalId} status`}>
            {["proposed", "preflighted", proposal.decision === "BLOCK" ? "blocked" : "executed", "recorded"].map((step) => (
              <span key={step} className={`progress-dot ${proposal.status === step ? "active" : ""}`} title={step} />
            ))}
          </div>
          <p>
            {proposal.reasonCode ? `${proposal.reasonCode} | ` : ""}
            updated {new Date(proposal.updatedAt).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}

