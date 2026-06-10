"use client";

import { useState } from "react";
import { Icon } from "../icons";
import { useToast } from "./Toast";
import { EmptyState, Panel, Skeleton, TxButton } from "./primitives";

type TopPool = {
  project: string;
  symbol: string | null;
  apy: number | null;
  tvlUsd: number | null;
  investable: boolean;
  riskFlags: string[];
};

type StrategyMetrics = {
  ranked: number;
  investable: number;
  skipped: number;
  skipReasons: { tvlBelowFloor: number; apyTooHigh: number; missingData: number };
  chosenApy: number | null;
  allocationPctBps: number;
};

type AiAdvice = { agree: boolean; recommendation: string; reasoning: string; riskFlags: string[]; confidence: number };

type StrategyStep = {
  step: number;
  mode: string;
  signalCount: number;
  topPools: TopPool[];
  chosen: { project: string; symbol: string | null; apy: number | null } | null;
  rationale: string;
  allocateWei: string;
  decision: string;
  reasonCode: string;
  allowed: boolean;
  riskScore: number;
  status: string;
  executed: boolean;
  txHash: string | null;
  explorerUrl: string | null;
  metrics?: StrategyMetrics;
};

const strategySteps = 3; // risk-sized allocations, each executed + recorded on-chain

export function StrategyAgentView() {
  const { push } = useToast();
  const [steps, setSteps] = useState<StrategyStep[]>([]);
  const [aiByStep, setAiByStep] = useState<Record<number, AiAdvice | null>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  // Advisory AI review of the step's pick. Graceful: if /api/ai is unconfigured (503) it just stays hidden.
  async function fetchAiReview(step: StrategyStep) {
    if (!step.chosen) return;
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task: "strategy",
          payload: {
            pools: step.topPools,
            chosen: step.chosen,
            maxNativeValueMnt: "policy cap",
            allocationPctBps: step.metrics?.allocationPctBps ?? 0,
          },
        }),
      });
      if (!res.ok) return;
      const json = (await res.json()) as { data?: AiAdvice };
      if (json.data) setAiByStep((cur) => ({ ...cur, [step.step]: json.data! }));
    } catch {
      /* advisory only — ignore */
    }
  }

  async function runStrategy() {
    setError("");
    setSteps([]);
    setAiByStep({});
    setRunning(true);
    try {
      for (let step = 0; step < strategySteps; step += 1) {
        const response = await fetch("/api/strategy-demo/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ step }),
        });
        if (!response.ok) {
          const detail = await response.json().catch(() => null);
          setError(detail?.error ?? `Strategy step failed (${response.status}).`);
          break;
        }
        const result = (await response.json()) as StrategyStep;
        setSteps((current) => [...current, result]);
        void fetchAiReview(result);
        push({
          variant: result.allowed ? "success" : "error",
          title: `${result.decision} - ${result.mode}`,
          message: result.reasonCode,
          href: result.explorerUrl ?? undefined,
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRunning(false);
    }
  }

  const signal = steps[0];

  return (
    <>
      <Panel
        title="AI Yield-Strategy Agent"
        subtitle="An AI strategy agent reads live Mantle yields, picks a risk-adjusted allocation, and executes every move THROUGH the firewall — allocations within limits execute on-chain, over-budget trades are blocked. Every decision is recorded on-chain."
      >
        <div style={{ padding: "0 16px 16px", display: "grid", gap: 12 }}>
          <p className="demo-lead">
            Signal: <strong>live DefiLlama Mantle pools</strong> (no mock data). Strategy: deterministic, explainable{" "}
            <strong>pickAllocation</strong> (rank by APY × liquidity confidence, skip thin / absurd-APY pools). Execution:{" "}
            <strong>runGatewayAction</strong> → pre-flight (policy + simulation + RWA risk) → execute-if-allowed → record on V4.
          </p>
          <TxButton
            label={`Run strategy agent - ${strategySteps} steps`}
            pendingLabel={`Running ${steps.length}/${strategySteps}...`}
            icon="bolt"
            onClick={runStrategy}
            pending={running}
          />
          {error ? <div className="error-box">{error}</div> : null}
          {!error && !steps.length && !running ? (
            <span className="form-hint">
              Needs server-side PRIVATE_KEY + AGENT_ID/POLICY_ID + a deployed strategy venue (TEST_STRATEGY_ROUTER/VAULT) allowlisted in the policy.
            </span>
          ) : null}
        </div>
      </Panel>

      {signal ? (
        <Panel title="Live yield signal" subtitle={`${signal.signalCount} Mantle pool(s) from DefiLlama — top candidates the agent ranked.`}>
          <div style={{ padding: "0 16px 14px", display: "grid", gap: 6 }}>
            {signal.topPools.map((p, i) => (
              <div key={i} className={`demo-step ${p.investable ? "allow" : "block"}`} style={{ alignItems: "center" }}>
                <span className="demo-step-idx">{i + 1}</span>
                <div className="demo-step-body">
                  <div className="demo-step-head">
                    <strong>
                      {p.project}
                      {p.symbol ? ` · ${p.symbol}` : ""}
                    </strong>
                    <span>{p.apy != null ? `${p.apy.toFixed(2)}% APY` : "no APY"}</span>
                  </div>
                  <div className="demo-step-meta">
                    <span>TVL {p.tvlUsd != null ? `$${Math.round(p.tvlUsd).toLocaleString()}` : "—"}</span>
                    <span>- {p.investable ? "investable" : `skipped: ${p.riskFlags.join(", ")}`}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {signal?.metrics ? (
        <Panel title="Strategy metrics" subtitle="Transparent + defensible — derived from the live ranking, not a black box.">
          <div style={{ padding: "0 16px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <Metric label="Pools ranked" value={`${signal.metrics.ranked}`} />
            <Metric label="Investable" value={`${signal.metrics.investable}`} />
            <Metric label="Skipped" value={`${signal.metrics.skipped}`} />
            <Metric label="Chosen APY" value={signal.metrics.chosenApy != null ? `${signal.metrics.chosenApy.toFixed(2)}%` : "—"} />
            <Metric label="Allocation" value={`${(signal.metrics.allocationPctBps / 100).toFixed(0)}% of budget`} />
            <Metric
              label="Skipped by"
              value={`${signal.metrics.skipReasons.tvlBelowFloor} low-TVL · ${signal.metrics.skipReasons.apyTooHigh} hi-APY · ${signal.metrics.skipReasons.missingData} no-data`}
            />
          </div>
        </Panel>
      ) : null}

      {steps.length || running ? (
        <Panel title="Strategy decisions" subtitle="Each step: agent proposes → firewall decides → recorded on-chain.">
          <div className="demo-stream">
            {steps.map((item) => (
              <div key={item.step} className={`demo-step ${item.allowed ? "allow" : "block"}`}>
                <span className="demo-step-idx">{item.step + 1}</span>
                <div className="demo-step-body">
                  <div className="demo-step-head">
                    <strong>{item.mode}</strong>
                    <span className={`chg ${item.allowed ? "up" : "down"}`}>
                      <span className="box">{item.allowed ? <Icon.arrowUp s={11} /> : <Icon.arrowDown s={11} />}</span>
                      {item.decision}
                    </span>
                  </div>
                  <div className="demo-step-meta" style={{ display: "block", marginBottom: 4 }}>
                    {item.rationale}
                  </div>
                  {aiByStep[item.step] ? (
                    <div className="demo-step-meta" style={{ display: "block", marginBottom: 4, opacity: 0.85 }}>
                      <strong>AI review</strong> ({aiByStep[item.step]!.agree ? "agrees" : "disagrees"}, confidence{" "}
                      {aiByStep[item.step]!.confidence}): {aiByStep[item.step]!.reasoning}
                      {aiByStep[item.step]!.riskFlags.length ? ` — risks: ${aiByStep[item.step]!.riskFlags.join(", ")}` : ""}
                      <em> · advisory only; the firewall decides.</em>
                    </div>
                  ) : null}
                  <div className="demo-step-meta">
                    <span>{item.reasonCode}</span>
                    <span>- risk {item.riskScore}</span>
                    <span>- {item.executed ? "executed on-chain" : "recorded"}</span>
                    {item.explorerUrl ? (
                      <a href={item.explorerUrl} target="_blank" rel="noreferrer">
                        tx
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
            {running ? (
              <div className="demo-step pending">
                <span className="demo-step-idx">{steps.length + 1}</span>
                <div className="demo-step-body">
                  <Skeleton w="55%" h={13} />
                  <div style={{ marginTop: 6 }}>
                    <Skeleton w="35%" h={11} />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </Panel>
      ) : (
        <Panel title="Strategy decisions" subtitle="Decisions will appear here — each links to its on-chain attestation.">
          <EmptyState>No run yet. Press "Run strategy agent" to stream the live yield signal, the chosen allocation, and each firewall decision.</EmptyState>
        </Panel>
      )}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", display: "grid", gap: 2 }}>
      <span style={{ fontSize: 11, opacity: 0.6 }}>{label}</span>
      <strong style={{ fontSize: 13 }}>{value}</strong>
    </div>
  );
}
