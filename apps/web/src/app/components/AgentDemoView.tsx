"use client";

import { useState } from "react";
import { Icon } from "../icons";
import { useToast } from "./Toast";
import { EmptyState, Panel, Skeleton, TxButton } from "./primitives";

type DemoStep = {
  step: number;
  label: string;
  intent?: string;
  decision: string;
  reasonCode: string;
  allowed: boolean;
  riskScore: number;
  txHash: string;
  explorerUrl: string;
};

const demoSteps = 6;

export function AgentDemoView() {
  const { push } = useToast();
  const [steps, setSteps] = useState<DemoStep[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  async function runDemo() {
    setError("");
    setSteps([]);
    setRunning(true);
    try {
      for (let step = 0; step < demoSteps; step += 1) {
        const response = await fetch("/api/demo/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ step }),
        });
        if (!response.ok) {
          const detail = await response.json().catch(() => null);
          setError(detail?.error ?? `Demo step failed (${response.status}).`);
          break;
        }
        const result = (await response.json()) as DemoStep;
        setSteps((current) => [...current, result]);
        push({
          variant: result.allowed ? "success" : "error",
          title: `${result.decision} - ${result.label}`,
          message: result.reasonCode,
          href: result.explorerUrl,
        });
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <Panel
        title="Live Agent Demo"
        subtitle="An autonomous agent proposes safe and adversarial actions; the firewall checks each and records the decision on-chain."
      >
        <div style={{ padding: "0 16px 16px", display: "grid", gap: 12 }}>
          <p className="demo-lead">
            Each step runs a real <strong>checkAction</strong> then <strong>recordAction</strong> on Mantle Sepolia.
            ALLOW and BLOCK decisions are both recorded as tamper-proof evidence and stream into the Flight Recorder live.
          </p>
          <TxButton
            label={`Run live demo - ${demoSteps} actions`}
            pendingLabel={`Running ${steps.length}/${demoSteps}...`}
            icon="bolt"
            onClick={runDemo}
            pending={running}
          />
          {error ? <div className="error-box">{error}</div> : null}
          {!error && !steps.length && !running ? (
            <span className="form-hint">
              Needs a server-side PRIVATE_KEY + AGENT_ID/POLICY_ID. Decisions also appear in the Flight Recorder.
            </span>
          ) : null}
        </div>
      </Panel>

      {steps.length || running ? (
        <Panel title="Decision stream" subtitle="Live, in order - newest at the bottom. Each links to its on-chain attestation.">
          <div className="demo-stream">
            {steps.map((item) => (
              <div key={item.step} className={`demo-step ${item.allowed ? "allow" : "block"}`}>
                <span className="demo-step-idx">{item.step + 1}</span>
                <div className="demo-step-body">
                  <div className="demo-step-head">
                    <strong>{item.label}</strong>
                    <span className={`chg ${item.allowed ? "up" : "down"}`}>
                      <span className="box">
                        {item.allowed ? <Icon.arrowUp s={11} /> : <Icon.arrowDown s={11} />}
                      </span>
                      {item.decision}
                    </span>
                  </div>
                  <div className="demo-step-meta">
                    <span>{item.reasonCode}</span>
                    <span>- AI-free risk {item.riskScore}</span>
                    <a href={item.explorerUrl} target="_blank" rel="noreferrer">
                      tx
                    </a>
                  </div>
                </div>
              </div>
            ))}
            {running ? (
              <div className="demo-step pending">
                <span className="demo-step-idx">{steps.length + 1}</span>
                <div className="demo-step-body">
                  <Skeleton w="45%" h={13} />
                  <div style={{ marginTop: 6 }}>
                    <Skeleton w="30%" h={11} />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </Panel>
      ) : (
        <Panel title="Decision stream" subtitle="Decisions will appear here, newest at the bottom - each links to its on-chain attestation.">
          <EmptyState>No run yet. Press "Run live demo" to stream ALLOW/BLOCK decisions and their on-chain attestations.</EmptyState>
        </Panel>
      )}
    </>
  );
}
