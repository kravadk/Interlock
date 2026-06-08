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
};

const strategySteps = 4; // 2 risk-sized allocations + 2 over-budget risk checks

export function StrategyAgentView() {
  const { push } = useToast();
  const [steps, setSteps] = useState<StrategyStep[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function runStrategy() {
    setError("");
    setSteps([]);
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
