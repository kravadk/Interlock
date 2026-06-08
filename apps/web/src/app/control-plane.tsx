"use client";

import { useEffect, useMemo, useState } from "react";
import { createPublicClient, formatEther, http, isAddress, parseEther, type Address, type Hex } from "viem";
import {
  agentRegistryGetAgentSelector,
  listMantleEcosystemPolicyPacks,
} from "@interlock/firewall-sdk";
import { actionAttestationAbi, evidenceHash, mantleSepolia, type EvidenceObject } from "@interlock/shared";
import { checkActionWithPolicy, type PreflightAction, type PreflightDecision } from "../lib/preflight";
import { explainDecision, aiEnabled, type AiExplanation } from "../lib/ai";
import { explorerTxUrl, hasGuardConfigured, mantleRpcUrl, webContracts } from "../lib/contracts";
import { fetchSnapshot, type SnapshotSource } from "../lib/snapshot";
import { clearRecentTx, loadRecentTx, rememberTx, type RecentTx } from "../lib/pending-tx";
import { syncYields, type ActionProposal, type IndexerAction, type IndexerAgent, type IndexerPolicy, type YieldDataPoint } from "../lib/indexer";
import { useLiveRefresh } from "./hooks/useLiveRefresh";
import {
  connectInjectedWallet,
  ensureMantleSepolia,
  executeViaGuardFromWallet,
  recordActionFromWallet,
  subscribeSelectedWalletChanges,
  type ConnectedWallet,
} from "../lib/wallet";
import {
  buildReasonRows,
  buildStats,
  buildTableRows,
  compareRows,
  type SortState,
} from "../lib/dashboard-data";
import { NAV, PageHead, Sidebar, StatCards, TopBar, type ActiveView } from "./components/shell";
import { useToast } from "./components/Toast";
import {
  AgentDemoView,
  AgentsView,
  AnalyticsView,
  BenchmarkView,
  DashboardView,
  IntegrateView,
  PoliciesView,
  PreflightView,
  RecorderView,
  StrategyAgentView,
} from "./views";
import { buildCalldata, normalizeDefaultAddress, normalizeDefaultSelector } from "./lib/default-action";
import { actionableTxError } from "../lib/tx-error";

const DEFAULT_AGENT_ID = process.env.NEXT_PUBLIC_DEFAULT_AGENT_ID?.trim() ?? "";
const DEFAULT_POLICY_ID = process.env.NEXT_PUBLIC_DEFAULT_POLICY_ID?.trim() ?? "";
const DEFAULT_TARGET = normalizeDefaultAddress(process.env.NEXT_PUBLIC_DEFAULT_ACTION_TARGET) ?? webContracts.agentRegistry;
const DEFAULT_SELECTOR = normalizeDefaultSelector(process.env.NEXT_PUBLIC_DEFAULT_SELECTOR) ?? agentRegistryGetAgentSelector;
const NON_ALLOWLISTED_TARGET = webContracts.actionAttestation;
const policyPacks = listMantleEcosystemPolicyPacks();

export type BundleReviewUiReport = {
  bundleId: string;
  intent: string;
  allowed: boolean;
  decision: "ALLOW" | "BLOCK";
  reasonCode: string;
  summary: string;
  decisions: Array<PreflightDecision & { label: string; target: Address; value: string; calldata: Hex }>;
};

export default function App() {
  const { push } = useToast();
  const [active, setActive] = useState<ActiveView>("dashboard");

  const [wallet, setWallet] = useState<ConnectedWallet>();
  const [walletError, setWalletError] = useState("");

  const [agents, setAgents] = useState<IndexerAgent[]>([]);
  const [policies, setPolicies] = useState<IndexerPolicy[]>([]);
  const [actions, setActions] = useState<IndexerAction[]>([]);
  const [proposals, setProposals] = useState<ActionProposal[]>([]);
  const [ecosystemYields, setEcosystemYields] = useState<YieldDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [source, setSource] = useState<SnapshotSource>("rpc");
  // Recovers a recently-submitted write after a mid-flow page reload (read from sessionStorage on mount).
  const [recentTx, setRecentTx] = useState<RecentTx>();
  useEffect(() => setRecentTx(loadRecentTx()), []);

  const [agentId, setAgentId] = useState(DEFAULT_AGENT_ID);
  const [policyId, setPolicyId] = useState(DEFAULT_POLICY_ID);
  const [target, setTarget] = useState<string>(DEFAULT_TARGET);
  const [value, setValue] = useState("0");
  const [calldata, setCalldata] = useState<string>(() => buildCalldata(DEFAULT_TARGET, DEFAULT_SELECTOR, DEFAULT_AGENT_ID));
  const [slippageBps, setSlippageBps] = useState(0);
  const [decision, setDecision] = useState<PreflightDecision>();
  const [aiExplanation, setAiExplanation] = useState<AiExplanation>();
  const [aiLoading, setAiLoading] = useState(false);
  const [preflightError, setPreflightError] = useState("");
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [recordTxHash, setRecordTxHash] = useState<Hex>();
  const [recordError, setRecordError] = useState("");
  const [recordLoading, setRecordLoading] = useState(false);
  const [execTxHash, setExecTxHash] = useState<Hex>();
  const [execError, setExecError] = useState("");
  const [execLoading, setExecLoading] = useState(false);
  const [bundleReport, setBundleReport] = useState<BundleReviewUiReport>();
  const [bundleError, setBundleError] = useState("");
  const [bundleLoading, setBundleLoading] = useState(false);

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>({ col: "rank", dir: "asc" });
  const [trend, setTrend] = useState("All");

  const selectedAgent = agents.find((item) => item.agentId === agentId);
  const selectedPolicy = policies.find((item) => item.policyId === policyId);

  const allRows = useMemo(() => buildTableRows(actions, agents, policies), [actions, agents, policies]);
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const base = trend === "Actions" ? allRows.filter((row) => row.type === "Action") : allRows;
    return base
      .filter((row) => (needle ? Object.values(row).some((field) => String(field).toLowerCase().includes(needle)) : true))
      .sort((a, b) => compareRows(a, b, sort));
  }, [allRows, query, sort, trend]);

  const stats = useMemo(() => buildStats(actions, agents, policies, decision), [actions, agents, policies, decision]);
  const reasonRows = useMemo(() => buildReasonRows(actions), [actions]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  // Auto-update: poll for freshness + watch ActionChecked events (both).
  useLiveRefresh(() => {
    void refresh(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  async function refresh(force = true) {
    setLoading(true);
    setLoadError("");
    try {
      const snapshot = await fetchSnapshot(agentId, { force });
      setSource(snapshot.source);
      setAgents(snapshot.agents);
      setPolicies(snapshot.policies);
      setActions(snapshot.actions);
      setProposals(snapshot.proposals ?? []);
      setEcosystemYields(snapshot.ecosystemYields ?? []);
      // The RPC fallback resolves to an empty snapshot even when the chain reads failed; surface
      // that as a retryable warning instead of silently showing an empty dashboard.
      if (snapshot.health?.lastSyncError) {
        const actionable = actionableTxError(new Error(snapshot.health.lastSyncError), "Dashboard refresh");
        setLoadError(`${actionable.message} ${actionable.suggestedFix}`);
      }
      const firstConfiguredAgent =
        snapshot.agents.find((agent) => snapshot.policies.some((policy) => policy.agentIds.includes(agent.agentId))) ??
        snapshot.agents[0];
      const nextAgentId = agentId || firstConfiguredAgent?.agentId || "";
      if (!agentId && nextAgentId) setAgentId(nextAgentId);
      if (!policyId) {
        const matchingPolicy =
          snapshot.policies.find((policy) => policy.agentIds.includes(nextAgentId)) ?? snapshot.policies[0];
        if (matchingPolicy?.policyId) setPolicyId(matchingPolicy.policyId);
      }
    } catch (error) {
      const actionable = actionableTxError(error, "Dashboard refresh");
      setLoadError(`${actionable.message} ${actionable.suggestedFix}`);
      setActions([]);
      setProposals([]);
      setEcosystemYields([]);
    } finally {
      setLoading(false);
    }
  }

  async function connectWallet() {
    setWalletError("");
    try {
      const connected = await connectInjectedWallet();
      setWallet(connected);
      push({ variant: "success", title: "Wallet connected", message: connected.chainId === mantleSepolia.id ? "Ready to write on Mantle Sepolia." : "Connected in read-only mode until you switch to Mantle Sepolia." });
    } catch (error) {
      const actionable = actionableTxError(error, "Wallet connection");
      setWalletError(`${actionable.message} ${actionable.suggestedFix}`);
      push({ variant: actionable.toastVariant, title: actionable.title, message: actionable.message });
    }
  }

  async function switchNetwork() {
    try {
      await ensureMantleSepolia();
      if (wallet) setWallet({ ...wallet, chainId: mantleSepolia.id });
      push({ variant: "success", title: "Network switched", message: "Wallet is on Mantle Sepolia." });
    } catch (error) {
      const actionable = actionableTxError(error, "Network switch");
      setWalletError(`${actionable.message} ${actionable.suggestedFix}`);
      push({ variant: actionable.toastVariant, title: actionable.title, message: actionable.message });
    }
  }

  // Live wallet tracking: once connected, react to the user changing account or network
  // (or disconnecting) in their wallet extension — no manual page refresh required.
  useEffect(() => {
    if (!wallet) return;
    const unsubscribe = subscribeSelectedWalletChanges((next) => {
      const changedAccount = Boolean(next?.address && wallet.address.toLowerCase() !== next.address.toLowerCase());
      const changedChain = Boolean(next && wallet.chainId !== next.chainId);
      setWallet(next);
      if (changedAccount || changedChain) {
        setDecision(undefined);
        setAiExplanation(undefined);
        setAiLoading(false);
        setRecordTxHash(undefined);
        setRecordError("");
        setExecTxHash(undefined);
        setExecError("");
      }
      if (!next) {
        setWalletError("");
        push({ variant: "warning", title: "Wallet disconnected", message: "Read-only data stays available. Connect again before writing transactions." });
        return;
      }
      if (changedAccount) {
        push({ variant: "warning", title: "Wallet account changed", message: "Previous preflight decision was cleared. Re-check ownership before writing." });
      }
      if (changedChain) {
        if (next.chainId === mantleSepolia.id) {
          push({ variant: "success", title: "Back on Mantle Sepolia", message: "Write actions are available again." });
        } else {
          push({ variant: "warning", title: "Wrong network", message: "Preflight decisions were cleared. Switch to Mantle Sepolia before writing." });
        }
      }
    });
    return unsubscribe;
  }, [wallet?.address, push]);

  function loadPreset(kind: "safe" | "unknown" | "overspend" | "slippage" | "approve" | "incomplete" | "empty") {
    if (kind === "safe") {
      setTarget(DEFAULT_TARGET);
      setValue("0");
      setCalldata(buildCalldata(DEFAULT_TARGET, DEFAULT_SELECTOR, agentId));
      setSlippageBps(0);
    }
    if (kind === "unknown") {
      setTarget(NON_ALLOWLISTED_TARGET);
      setValue("0");
      setCalldata(buildCalldata(NON_ALLOWLISTED_TARGET, DEFAULT_SELECTOR, agentId));
      setSlippageBps(0);
    }
    if (kind === "overspend") {
      setTarget(DEFAULT_TARGET);
      setValue(selectedPolicy?.maxNativeValue ? formatEther(BigInt(selectedPolicy.maxNativeValue) + 1n) : value);
      setCalldata(buildCalldata(DEFAULT_TARGET, DEFAULT_SELECTOR, agentId));
      setSlippageBps(0);
    }
    if (kind === "slippage") {
      setTarget(DEFAULT_TARGET);
      setValue("0");
      setCalldata(buildCalldata(DEFAULT_TARGET, DEFAULT_SELECTOR, agentId));
      setSlippageBps(Math.min(10_000, (selectedPolicy?.maxSlippageBps ?? 100) + 1));
    }
    if (kind === "approve") {
      setTarget(DEFAULT_TARGET);
      setValue("0");
      setCalldata("0x095ea7b3");
      setSlippageBps(0);
    }
    if (kind === "incomplete") {
      setTarget(DEFAULT_TARGET);
      setValue("0");
      setCalldata(DEFAULT_SELECTOR);
      setSlippageBps(0);
    }
    if (kind === "empty") {
      setTarget(DEFAULT_TARGET);
      setValue("0");
      setCalldata("0x");
      setSlippageBps(0);
    }
    setDecision(undefined);
    setAiExplanation(undefined);
    setAiLoading(false);
    setPreflightError("");
  }

  function requestExplanation(result: PreflightDecision) {
    if (!aiEnabled()) return;
    setAiLoading(true);
    explainDecision({
      decision: result.decision,
      reason: result.reason,
      riskScore: result.riskScore,
      target: target as Address,
      value: value || "0",
      selector: result.selector,
      simulationHash: result.simulationHash,
      checks: result.checks,
    })
      .then((res) => {
        if (res.ok) setAiExplanation(res.data);
      })
      .finally(() => setAiLoading(false));
  }

  async function runPreflight() {
    setPreflightError("");
    setDecision(undefined);
    setAiExplanation(undefined);
    setAiLoading(false);
    const failPreflight = (message: string) => {
      setPreflightError(message);
      push({ variant: "warning", title: "Preflight disabled", message });
    };
    if (!isAddress(target)) {
      failPreflight("Target must be a valid EVM address.");
      return;
    }
    if (!agentId || !policyId) {
      failPreflight("Agent id and policy id are required.");
      return;
    }
    if (!calldata.match(/^0x([0-9a-fA-F]{2})*$/)) {
      failPreflight("Calldata must be 0x or even-byte hex.");
      return;
    }
    if (!agentId.match(/^[1-9]\d*$/) || !policyId.match(/^[1-9]\d*$/)) {
      failPreflight("Agent id and policy id must be positive integers from a real registered agent and policy.");
      return;
    }
    if (slippageBps < 0 || slippageBps > 10_000 || !Number.isInteger(slippageBps)) {
      failPreflight("Slippage must be an integer between 0 and 10000 bps.");
      return;
    }
    let parsedValue: bigint;
    try {
      parsedValue = parseEther(value || "0");
    } catch {
      failPreflight("Value must be a valid non-negative MNT amount.");
      return;
    }
    if (parsedValue < 0n) {
      failPreflight("Value must be a non-negative MNT amount.");
      return;
    }
    setPreflightLoading(true);
    try {
      const result = await checkActionWithPolicy({
        rpcUrl: mantleRpcUrl(),
        policyRegistry: webContracts.policyRegistry,
        account: wallet?.address,
        action: {
          agentId: BigInt(agentId),
          policyId: BigInt(policyId),
          tx: {
            to: target as Address,
            value: parsedValue,
            data: calldata as Hex,
          },
          metadata: { expectedSlippageBps: slippageBps },
        },
      });
      setDecision(result);
      requestExplanation(result);
      push({ variant: result.allowed ? "success" : "warning", title: `Preflight ${result.decision}`, message: `${result.reason}: ${result.explanation}` });
    } catch (error) {
      const actionable = actionableTxError(error, "Preflight");
      const message = `${actionable.message} ${actionable.suggestedFix}`;
      setPreflightError(message);
      push({ variant: actionable.toastVariant, title: actionable.title, message: actionable.message });
    } finally {
      setPreflightLoading(false);
    }
  }

  async function runBundleReview(kind: "current" | "current-plus-unknown" = "current-plus-unknown") {
    setBundleError("");
    setBundleReport(undefined);
    const failBundle = (message: string) => {
      setBundleError(message);
      push({ variant: "warning", title: "Bundle review disabled", message });
    };
    if (!isAddress(target)) {
      failBundle("Target must be a valid EVM address before bundle review.");
      return;
    }
    if (!agentId || !policyId || !agentId.match(/^[1-9]\d*$/) || !policyId.match(/^[1-9]\d*$/)) {
      failBundle("Agent id and policy id must be positive integers from real deployed contracts.");
      return;
    }
    if (!calldata.match(/^0x([0-9a-fA-F]{2})*$/)) {
      failBundle("Calldata must be 0x or even-byte hex.");
      return;
    }
    if (slippageBps < 0 || slippageBps > 10_000 || !Number.isInteger(slippageBps)) {
      failBundle("Slippage must be an integer between 0 and 10000 bps.");
      return;
    }
    let parsedValue: bigint;
    try {
      parsedValue = parseEther(value || "0");
    } catch {
      failBundle("Value must be a valid non-negative MNT amount.");
      return;
    }
    if (parsedValue < 0n) {
      failBundle("Value must be a non-negative MNT amount.");
      return;
    }
    const baseAction: PreflightAction = {
      agentId: BigInt(agentId),
      policyId: BigInt(policyId),
      tx: { to: target as Address, value: parsedValue, data: calldata as Hex },
      metadata: { expectedSlippageBps: slippageBps },
    };
    const actions: Array<{ label: string; action: PreflightAction }> = [{ label: "Current proposed action", action: baseAction }];
    if (kind === "current-plus-unknown") {
      actions.push({
        label: "Unknown target probe",
        action: {
          agentId: BigInt(agentId),
          policyId: BigInt(policyId),
          tx: {
            to: NON_ALLOWLISTED_TARGET,
            value: 0n,
            data: buildCalldata(NON_ALLOWLISTED_TARGET, DEFAULT_SELECTOR, agentId) as Hex,
          },
          metadata: { expectedSlippageBps: 0 },
        },
      });
    }
    setBundleLoading(true);
    try {
      const decisions: BundleReviewUiReport["decisions"] = [];
      for (const item of actions) {
        const result = await checkActionWithPolicy({
          rpcUrl: mantleRpcUrl(),
          policyRegistry: webContracts.policyRegistry,
          account: wallet?.address,
          action: item.action,
        });
        decisions.push({
          ...result,
          label: item.label,
          target: item.action.tx.to,
          value: item.action.tx.value.toString(),
          calldata: item.action.tx.data,
        });
      }
      const blocked = decisions.find((item) => !item.allowed);
      const report: BundleReviewUiReport = {
        bundleId: `ui-${Date.now()}`,
        intent: kind === "current" ? "Review current proposed transaction" : "Review current transaction plus unknown-target attack probe",
        allowed: !blocked,
        decision: blocked ? "BLOCK" : "ALLOW",
        reasonCode: blocked?.reason ?? "POLICY_PASSED",
        summary: blocked
          ? `Bundle blocked: ${decisions.filter((item) => !item.allowed).length}/${decisions.length} actions failed. First reason: ${blocked.reason}.`
          : `Bundle allowed: ${decisions.length} actions passed policy and simulation checks.`,
        decisions,
      };
      setBundleReport(report);
      push({ variant: report.allowed ? "success" : "warning", title: `Bundle ${report.decision}`, message: report.summary });
    } catch (error) {
      const actionable = actionableTxError(error, "Bundle review");
      setBundleError(`${actionable.message} ${actionable.suggestedFix}`);
      push({ variant: actionable.toastVariant, title: actionable.title, message: actionable.message });
    } finally {
      setBundleLoading(false);
    }
  }

  function updatePreflightInput(update: () => void) {
    update();
    setDecision(undefined);
    setAiExplanation(undefined);
    setAiLoading(false);
    setPreflightError("");
    setRecordTxHash(undefined);
    setRecordError("");
    setExecTxHash(undefined);
    setExecError("");
    setBundleReport(undefined);
    setBundleError("");
  }

  async function recordDecision() {
    if (!decision) {
      push({ variant: "warning", title: "Nothing to record", message: "Run preflight before recording an attestation." });
      return;
    }
    if (!wallet?.address) {
      setRecordError("Connect a wallet to record the pre-flight decision on-chain.");
      push({ variant: "warning", title: "Wallet required", message: "Recording needs a connected policy-owner wallet. Read-only preflight still works." });
      return;
    }
    if (wallet.chainId !== mantleSepolia.id) {
      setRecordError("Switch to Mantle Sepolia before recording this decision.");
      push({ variant: "warning", title: "Wrong network", message: "Switch to Mantle Sepolia before writing the attestation." });
      return;
    }
    setRecordError("");
    setRecordLoading(true);
    try {
      const parsedValue = parseEther(value || "0");
      // 1. Read the on-chain nonce for this agent.
      const nonceClient = createPublicClient({ chain: mantleSepolia, transport: http(mantleRpcUrl()) });
      const nonce = (await nonceClient.readContract({
        address: webContracts.actionAttestation,
        abi: actionAttestationAbi,
        functionName: "nonces",
        args: [BigInt(agentId)],
      })) as bigint;

      // 2. Compute the evidence commitment (must match what is signed and recorded).
      const evidence: EvidenceObject = {
        version: "interlock.evidence.v1",
        proposedTx: { to: target as Address, value: parsedValue.toString(), data: calldata as Hex, selector: decision.selector },
        simulation: { success: decision.reason !== "SIMULATION_FAILED" },
        checks: (decision.checks ?? {}) as Record<string, boolean>,
        decision: decision.decision,
        reason: decision.reason,
        riskScore: decision.riskScore,
      };
      const evHash = evidenceHash(evidence);

      // 3. Ask the server-side attestor to sign the decision (EIP-712).
      const attestResponse = await fetch("/api/attest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nonce: nonce.toString(),
          decision: {
            agentId,
            policyId,
            target,
            value: parsedValue.toString(),
            calldataHash: decision.calldataHash,
            selector: decision.selector,
            simulationHash: decision.simulationHash,
            evidenceHash: evHash,
            decision: decision.decision,
            reasonCode: decision.reason,
          },
        }),
      });
      if (!attestResponse.ok) {
        const payload = await attestResponse.json().catch(() => ({}));
        throw new Error(payload.error ?? `Attestor signing failed (${attestResponse.status}).`);
      }
      const attest = (await attestResponse.json()) as { signature: Hex; deadline: string };

      // 4. The policy owner records the signed decision (+ evidenceHash) on-chain.
      const txHash = await recordActionFromWallet({
        account: wallet.address,
        actionAttestation: webContracts.actionAttestation,
        agentId: BigInt(agentId),
        policyId: BigInt(policyId),
        target: target as Address,
        value: parsedValue,
        calldataHash: decision.calldataHash,
        selector: decision.selector,
        simulationHash: decision.simulationHash,
        evidenceHash: evHash,
        decision: decision.decision,
        reasonCode: decision.reason,
        deadline: BigInt(attest.deadline),
        // 1-of-1 committee → a single attestor signature; V4 verifies it via AttestorCommittee.
        signatures: [attest.signature],
      });
      setRecordTxHash(txHash);
      rememberTx(txHash, "Decision attestation");
      push({ variant: "success", title: "Attestation confirmed", message: "ActionChecked was confirmed on Mantle Sepolia.", href: explorerTxUrl(txHash) });
      await refresh();
    } catch (error) {
      const actionable = actionableTxError(error, "Record attestation");
      if (actionable.txHash) setRecordTxHash(actionable.txHash);
      setRecordError(`${actionable.message} ${actionable.suggestedFix}`);
      push({ variant: actionable.toastVariant, title: actionable.title, message: actionable.message, href: actionable.txHash ? explorerTxUrl(actionable.txHash) : undefined });
    } finally {
      setRecordLoading(false);
    }
  }

  async function executeEnforced() {
    if (!decision) {
      push({ variant: "warning", title: "Nothing to execute", message: "Run preflight before routing an action through the executor." });
      return;
    }
    if (!wallet?.address) {
      setExecError("Connect a wallet to execute through PolicyGuardedExecutor.");
      push({ variant: "warning", title: "Wallet required", message: "Execution needs a connected policy-owner wallet." });
      return;
    }
    if (wallet.chainId !== mantleSepolia.id) {
      setExecError("Switch to Mantle Sepolia before executing this action.");
      push({ variant: "warning", title: "Wrong network", message: "Switch to Mantle Sepolia before writing the transaction." });
      return;
    }
    setExecError("");
    setExecTxHash(undefined);
    setExecLoading(true);
    try {
      const txHash = await executeViaGuardFromWallet({
        account: wallet.address,
        executor: webContracts.policyGuardedExecutor,
        agentId: BigInt(agentId),
        policyId: BigInt(policyId),
        target: target as Address,
        value: parseEther(value || "0"),
        data: calldata as Hex,
      });
      setExecTxHash(txHash);
      rememberTx(txHash, "Enforced execution");
      push({ variant: "success", title: "Enforced execution confirmed", message: "PolicyGuardedExecutor transaction confirmed on Mantle Sepolia.", href: explorerTxUrl(txHash) });
      await refresh();
    } catch (error) {
      const actionable = actionableTxError(error, "Enforced execution");
      if (actionable.txHash) setExecTxHash(actionable.txHash);
      setExecError(`${actionable.message} ${actionable.suggestedFix}`);
      push({ variant: actionable.toastVariant, title: actionable.title, message: actionable.message, href: actionable.txHash ? explorerTxUrl(actionable.txHash) : undefined });
    } finally {
      setExecLoading(false);
    }
  }

  async function syncYieldSignals() {
    try {
      const result = await syncYields();
      setEcosystemYields(result.yields);
      push({ variant: "success", title: "Yield signals synced", message: `${result.synced} live records were loaded from the configured ecosystem source.` });
    } catch (error) {
      const actionable = actionableTxError(error, "Yield/RWA sync");
      push({ variant: actionable.toastVariant, title: actionable.title, message: `${actionable.message} ${actionable.suggestedFix}` });
    }
  }

  const wrongChain = Boolean(wallet && wallet.chainId !== mantleSepolia.id);
  const recordDisabledReason = !wallet?.address
    ? "Connect a wallet to record or execute on-chain. Preflight remains available in read-only mode."
    : wrongChain
      ? "Switch to Mantle Sepolia before writing transactions."
      : !decision
        ? "Run a fresh preflight before writing."
        : undefined;
  const entry = NAV.find((item) => item.id === active) ?? NAV[0];

  return (
    <div className="app">
      <Sidebar active={active} setActive={setActive} packs={policyPacks} />
      <div className="main">
        <span className="sr-only">
          Interlock Control Plane: Policy Editor, Selector, Flight Recorder, Action Review, Benchmark Arena, Developer
          Integration, Mantle Ecosystem.
        </span>
        <TopBar
          title={entry.label}
          wallet={wallet}
          walletError={walletError}
          onConnect={connectWallet}
          onSwitch={switchNetwork}
          onRefresh={() => refresh(true)}
          loading={loading}
          source={source}
        />
        <div className="content scroll">
          <PageHead entry={entry} />
          <StatCards stats={stats} loading={loading && !actions.length} />

          <div className="view-enter" key={active}>
            {active === "dashboard" && (
              <DashboardView
                actions={actions}
                reasonRows={reasonRows}
                rows={filteredRows}
                query={query}
                setQuery={setQuery}
                sort={sort}
                setSort={setSort}
                loading={loading && !actions.length}
                onboarding={{
                  wallet,
                  agentsCount: agents.length,
                  policiesCount: policies.length,
                  hasDecision: Boolean(decision),
                  hasRecorded: Boolean(recordTxHash),
                  setActive,
                  onConnect: connectWallet,
                }}
              />
            )}

            {active === "agents" && (
              <AgentsView
                agents={agents}
                selectedAgent={selectedAgent}
                agentId={agentId}
                setAgentId={setAgentId}
                account={wallet?.address}
                wrongChain={wrongChain}
                onRegistered={(id) => {
                  setAgentId(id);
                  void refresh();
                }}
              />
            )}

            {active === "policies" && (
              <PoliciesView
                policies={policies}
                selectedPolicy={selectedPolicy}
                policyId={policyId}
                setPolicyId={setPolicyId}
                packs={policyPacks}
                account={wallet?.address}
                wrongChain={wrongChain}
                agentId={agentId}
                onCreated={(id) => {
                  setPolicyId(id);
                  void refresh();
                }}
              />
            )}

            {active === "preflight" && (
              <PreflightView
                agentId={agentId}
                policyId={policyId}
                target={target}
                value={value}
                calldata={calldata}
                slippageBps={slippageBps}
                decision={decision}
                ai={aiExplanation}
                aiLoading={aiLoading}
                error={preflightError}
                loading={preflightLoading}
                setAgentId={(next) => updatePreflightInput(() => setAgentId(next))}
                setPolicyId={(next) => updatePreflightInput(() => setPolicyId(next))}
                setTarget={(next) => updatePreflightInput(() => setTarget(next))}
                setValue={(next) => updatePreflightInput(() => setValue(next))}
                setCalldata={(next) => updatePreflightInput(() => setCalldata(next))}
                setSlippageBps={(next) => updatePreflightInput(() => setSlippageBps(next))}
                runPreflight={runPreflight}
                loadPreset={loadPreset}
                canRecord={Boolean(wallet?.address) && !wrongChain}
                recordDisabledReason={recordDisabledReason}
                recordLoading={recordLoading}
                recordTxHash={recordTxHash}
                recordError={recordError}
                onRecord={recordDecision}
                guardConfigured={hasGuardConfigured()}
                onExecuteEnforced={executeEnforced}
                execLoading={execLoading}
                execTxHash={execTxHash}
                execError={execError}
                proposals={proposals}
                bundleReport={bundleReport}
                bundleError={bundleError}
                bundleLoading={bundleLoading}
                runBundleReview={runBundleReview}
                ecosystemYields={ecosystemYields}
              />
            )}

            {active === "benchmark" && (
              <BenchmarkView
                loadPreset={loadPreset}
                runPreflight={runPreflight}
                decision={decision}
                runBundleReview={runBundleReview}
                bundleReport={bundleReport}
                bundleLoading={bundleLoading}
              />
            )}

            {active === "agent-demo" && <AgentDemoView />}
            {active === "strategy-agent" && <StrategyAgentView />}

            {active === "recorder" && (
              <RecorderView
                rows={filteredRows}
                query={query}
                setQuery={setQuery}
                sort={sort}
                setSort={setSort}
                trend={trend}
                setTrend={setTrend}
                loading={loading && !actions.length}
                account={wallet?.address}
                wrongChain={wrongChain}
                proposals={proposals}
              />
            )}

            {active === "analytics" && <AnalyticsView rows={reasonRows} actions={actions} />}

            {active === "integrate" && (
              <IntegrateView
                agentId={agentId}
                policyId={policyId}
                target={target}
                value={value}
                calldata={calldata}
                slippageBps={slippageBps}
                ecosystemYields={ecosystemYields}
                onSyncYields={syncYieldSignals}
              />
            )}
          </div>

          {recentTx ? (
            <div className="recent-tx-banner">
              <span>Recent {recentTx.label.toLowerCase()} submitted before reload — it is on-chain.</span>
              <a href={explorerTxUrl(recentTx.hash as Hex)} target="_blank" rel="noreferrer" className="mini-btn">
                View on Mantlescan
              </a>
              <button type="button" className="mini-btn ghost" onClick={() => { clearRecentTx(); setRecentTx(undefined); }}>
                Dismiss
              </button>
            </div>
          ) : null}

          {loadError ? (
            <div className="error-box load-error">
              <span>RPC / Recorder warning: {loadError}</span>
              <button type="button" className="mini-btn" onClick={() => void refresh(true)} disabled={loading}>
                {loading ? "Retrying…" : "Retry"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
