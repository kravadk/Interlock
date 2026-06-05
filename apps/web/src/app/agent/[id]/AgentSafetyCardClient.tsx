"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Address } from "viem";
import { mantleSepolia } from "@interlock/shared";
import { explorerAddressUrl, explorerTxUrl, webContracts } from "../../../lib/contracts";
import {
  fetchAgentActions,
  fetchAgentBenchmark,
  fetchAgentStats,
  indexerBaseUrl,
  type AgentBenchmark,
  type IndexerAction,
  type IndexerAgent,
  type IndexerStats,
} from "../../../lib/indexer";
import { fetchRpcHistorySnapshot } from "../../../lib/rpc-history";

type AgentCardState =
  | { status: "loading" }
  | { status: "ready"; source: string; stats?: IndexerStats | IndexerAgent; actions: IndexerAction[]; benchmark?: AgentBenchmark }
  | { status: "error"; message: string };

export default function AgentSafetyCardClient({ agentId }: { agentId: string }) {
  const [state, setState] = useState<AgentCardState>({ status: "loading" });

  useEffect(() => {
    let active = true;

    async function load() {
      if (!agentId || !/^\d+$/.test(agentId) || BigInt(agentId) <= 0n) {
        setState({ status: "error", message: "Agent id must be a positive integer." });
        return;
      }

      try {
        const baseUrl = indexerBaseUrl();
        if (baseUrl) {
          const [stats, actions, benchmark] = await Promise.all([
            fetchAgentStats(agentId),
            fetchAgentActions(agentId),
            fetchAgentBenchmark(agentId),
          ]);
          if (!active) return;
          setState({ status: "ready", source: "Hosted/local indexer", stats, actions, benchmark });
          return;
        }

        const snapshot = await fetchRpcHistorySnapshot(agentId);
        if (!active) return;
        setState({ status: "ready", source: "Mantle RPC event fallback", stats: snapshot.stats, actions: snapshot.actions });
      } catch (error) {
        try {
          const snapshot = await fetchRpcHistorySnapshot(agentId);
          if (!active) return;
          setState({
            status: "ready",
            source: "Mantle RPC event fallback after indexer error",
            stats: snapshot.stats,
            actions: snapshot.actions,
          });
        } catch (fallbackError) {
          if (!active) return;
          setState({
            status: "error",
            message:
              fallbackError instanceof Error
                ? fallbackError.message
                : error instanceof Error
                  ? error.message
                  : "Unable to load Agent Safety Card.",
          });
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [agentId]);

  const latestAction = state.status === "ready" ? state.actions[0] : undefined;
  const benchmark = state.status === "ready" ? state.benchmark : undefined;
  const actions = state.status === "ready" ? state.actions : [];
  const agent = state.status === "ready" ? (state.stats as IndexerAgent | undefined) : undefined;
  const owner = agent && "owner" in agent ? agent.owner : undefined;
  const policyIds = agent && "policyIds" in agent ? agent.policyIds : undefined;
  const safetyScore = benchmark?.scoreLabel ?? (state.status === "ready" ? "Indexer benchmark unavailable" : "Loading");
  const riskRatio = useMemo(() => {
    if (state.status !== "ready" || !state.stats || state.stats.totalActions === 0) return "No records";
    const risky = state.stats.blockedActions + state.stats.failedSimulations;
    return `${Math.round((risky / state.stats.totalActions) * 100)}% blocked/failed`;
  }, [state]);

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Mantle Sepolia - public safety card</p>
          <h1>Agent #{agentId}</h1>
          <p className="subtitle">
            Public Interlock card for pre-flight decisions, on-chain evidence, and Dev Alpha reputation counters. This is not an audited production trust score.
          </p>
          <div className="sectionNav">
            <Link href={`/app?agent=${agentId}`}>Open Control Plane</Link>
            <a href={explorerAddressUrl(webContracts.actionAttestation)} target="_blank" rel="noreferrer">
              ActionAttestation
            </a>
          </div>
        </div>
        <div className="statusStrip">
          <span>Mantle Sepolia {mantleSepolia.id}</span>
          <span>Real on-chain events only</span>
        </div>
      </section>

      <section className="grid">
        <article className="panel wide">
          <header>
            <div>
              <h2>Agent Safety Card</h2>
              <p>Shows indexed/RPC ActionChecked evidence for this agent id.</p>
            </div>
          </header>
          {state.status === "loading" ? (
            <div className="emptyState">Loading real Interlock records...</div>
          ) : state.status === "error" ? (
            <div className="emptyState">{state.message}</div>
          ) : (
            <>
              <div className="safetyCard">
                <div className="safetyHeader">
                  <div>
                    <span>Source</span>
                    <strong>{state.source}</strong>
                  </div>
                  <code>Dev Alpha counters</code>
                </div>
                <div className="safetyGrid">
                  <LinkedMetric
                    label="Owner"
                    value={short(owner)}
                    href={owner ? explorerAddressUrl(owner) : undefined}
                  />
                  <Metric label="Policies" value={policyIds && policyIds.length > 0 ? policyIds.map((id) => `#${id}`).join(", ") : "None indexed"} />
                  <Metric label="Total checks" value={String(state.stats?.totalActions ?? 0)} />
                  <Metric label="Allowed" value={String(state.stats?.allowedActions ?? 0)} />
                  <Metric label="Blocked" value={String(state.stats?.blockedActions ?? 0)} />
                  <Metric label="Failed simulations" value={String(state.stats?.failedSimulations ?? 0)} />
                  <Metric label="Risk ratio" value={riskRatio} />
                  <Metric label="Evidence score" value={safetyScore} />
                  <LinkedMetric
                    label="Last decision"
                    value={latestAction ? `${latestAction.decision} / ${latestAction.reasonCode}` : "No action yet"}
                    href={latestAction ? explorerTxUrl(latestAction.transactionHash) : undefined}
                  />
                </div>
                <div className="sectionNav">
                  <button className="ghostButton" type="button" onClick={() => copyMarkdown(agentId, owner, policyIds, state.stats, latestAction, safetyScore)}>
                    Copy markdown summary
                  </button>
                  <button className="ghostButton" type="button" onClick={() => copyEmbed(agentId)}>
                    Copy embed snippet
                  </button>
                </div>
              </div>
              <p className="panelNote">
                Attestations are pre-flight decision evidence. They prove what Interlock checked and recorded, not that a downstream transaction definitely executed.
              </p>
            </>
          )}
        </article>

        <article className="panel wide">
          <header>
            <div>
              <h2>Benchmark Evidence</h2>
              <p>Recorder-derived evidence score and reason-code coverage for this agent.</p>
            </div>
            {benchmark ? (
              <button className="ghostButton" type="button" onClick={() => copyEvidence(agentId, benchmark, actions)}>
                Copy evidence JSON
              </button>
            ) : null}
          </header>
          {state.status !== "ready" ? (
            <div className="emptyState">Benchmark appears after records are loaded.</div>
          ) : !benchmark ? (
            <div className="emptyState">
              Benchmark summary requires the hosted/local Recorder API. RPC fallback shows real history, but does not fabricate benchmark analytics.
            </div>
          ) : (
            <>
              <div className="safetyGrid">
                <Metric label="Score" value={benchmark.scoreLabel} />
                <Metric label="Total evidence" value={String(benchmark.totalActions)} />
                <Metric label="Allowed" value={String(benchmark.allowedActions)} />
                <Metric label="Blocked" value={String(benchmark.blockedActions)} />
                <Metric label="Failed simulations" value={String(benchmark.failedSimulations)} />
              </div>
              <div className="reasonGrid">
                {Object.entries(benchmark.reasonBreakdown).length === 0 ? (
                  <div className="emptyState">No reason-code evidence yet.</div>
                ) : (
                  Object.entries(benchmark.reasonBreakdown).map(([reason, count]) => (
                    <div className="reasonChip" key={reason}>
                      <span>{reason}</span>
                      <strong>{count}</strong>
                    </div>
                  ))
                )}
              </div>
              <p className="panelNote">{benchmark.disclaimer}</p>
            </>
          )}
        </article>

        <article className="panel wide">
          <header>
            <div>
              <h2>Evidence Timeline</h2>
              <p>Latest real ActionChecked rows for this agent.</p>
            </div>
          </header>
          {state.status !== "ready" ? (
            <div className="emptyState">Timeline appears after records are loaded.</div>
          ) : state.actions.length === 0 ? (
            <div className="emptyState">No recorded Interlock decisions were found for this agent id.</div>
          ) : (
            <div className="history">
              {state.actions.map((action) => (
                <a className="historyItem" href={explorerTxUrl(action.transactionHash)} target="_blank" rel="noreferrer" key={action.actionCheckId}>
                  <strong>#{action.actionCheckId}</strong>
                  <span>{action.decision}</span>
                  <span>{action.reasonCode}</span>
                  <code>{short(action.target)}</code>
                  <span>{formatDate(action.timestamp)}</span>
                  <code>{short(action.transactionHash)}</code>
                </a>
              ))}
            </div>
          )}
        </article>
      </section>
    </main>
  );
}

function copyEvidence(agentId: string, benchmark: AgentBenchmark, actions: IndexerAction[]) {
  const payload = {
    product: "Interlock Agent Safety Card",
    agentId,
    source: "Recorder API",
    benchmark,
    latestActions: actions.slice(0, 5),
    disclaimer: "Dev Alpha evidence only. This is not an audited production trust score.",
  };
  void navigator.clipboard?.writeText(JSON.stringify(payload, null, 2));
}

function copyMarkdown(
  agentId: string,
  owner: Address | undefined,
  policyIds: string[] | undefined,
  stats: IndexerStats | IndexerAgent | undefined,
  latestAction: IndexerAction | undefined,
  safetyScore: string,
) {
  const lines = [
    `# Interlock Agent Safety Card — Agent #${agentId}`,
    "",
    `- **Owner:** ${owner ?? "Unavailable"}`,
    `- **Policies:** ${policyIds && policyIds.length > 0 ? policyIds.map((id) => `#${id}`).join(", ") : "None indexed"}`,
    `- **Total checks:** ${stats?.totalActions ?? 0}`,
    `- **Allowed:** ${stats?.allowedActions ?? 0}`,
    `- **Blocked:** ${stats?.blockedActions ?? 0}`,
    `- **Failed simulations:** ${stats?.failedSimulations ?? 0}`,
    `- **Evidence score:** ${safetyScore}`,
    `- **Last decision:** ${latestAction ? `${latestAction.decision} / ${latestAction.reasonCode}` : "No action yet"}`,
    "",
    `Card: ${typeof window !== "undefined" ? window.location.origin : ""}/agent/${agentId}`,
    "",
    "_Dev Alpha evidence only. This is not an audited production trust score._",
  ];
  void navigator.clipboard?.writeText(lines.join("\n"));
}

function copyEmbed(agentId: string) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const snippet = `<iframe src="${origin}/agent/${agentId}" width="480" height="640" title="Interlock Agent Safety Card #${agentId}" style="border:1px solid #2a2a2a;border-radius:12px"></iframe>`;
  void navigator.clipboard?.writeText(snippet);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LinkedMetric({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer">
          {value}
        </a>
      ) : (
        <strong>{value}</strong>
      )}
    </div>
  );
}

function short(value?: string | Address) {
  if (!value) return "Unavailable";
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function formatDate(value: string) {
  const date = new Date(Number(value) * 1000);
  return Number.isNaN(date.getTime()) ? "Invalid timestamp" : date.toLocaleString();
}
