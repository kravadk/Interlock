"use client";

import { useEffect, useRef, useState } from "react";
import { agentRegistryGetAgentCalldata } from "@interlock/firewall-sdk";
import { Icon } from "../../icons";
import { webContracts } from "../../../lib/contracts";

type Check = { label: string; ok: boolean };
type Scenario = {
  short: string;
  intent: string;
  verdict: "ALLOW" | "BLOCK";
  reason: string;
  risk: number;
  checks: Check[];
  live?: { to: string; value: string; data: string };
};

const GET_AGENT_1 = agentRegistryGetAgentCalldata(1n);

const SCENARIOS: Scenario[] = [
  {
    short: "Safe read", intent: "An agent reads its registered profile", verdict: "ALLOW", reason: "POLICY_PASSED", risk: 6,
    checks: [
      { label: "Target allowlisted", ok: true }, { label: "Selector allowed", ok: true },
      { label: "Value within limit", ok: true }, { label: "Simulation passed", ok: true },
    ],
    live: { to: webContracts.agentRegistry, value: "0", data: GET_AGENT_1 },
  },
  {
    short: "Unknown target", intent: "An agent calls a contract not on the charter", verdict: "BLOCK", reason: "TARGET_NOT_ALLOWED", risk: 88,
    checks: [
      { label: "Target allowlisted", ok: false }, { label: "Selector allowed", ok: true },
      { label: "Value within limit", ok: true }, { label: "Simulation passed", ok: true },
    ],
    live: { to: "0x6488c92049dcbb88a442d1bbf6e94bc137faf4a3", value: "0", data: GET_AGENT_1 },
  },
  {
    short: "Overspend", intent: "An agent exceeds its value cap", verdict: "BLOCK", reason: "VALUE_LIMIT_EXCEEDED", risk: 74,
    checks: [
      { label: "Target allowlisted", ok: true }, { label: "Selector allowed", ok: true },
      { label: "Value within limit", ok: false }, { label: "Simulation passed", ok: true },
    ],
    live: { to: webContracts.agentRegistry, value: "1000000000000000000", data: GET_AGENT_1 },
  },
  {
    short: "Unlimited approve", intent: "An agent requests a broad token approve", verdict: "BLOCK", reason: "UNKNOWN_SELECTOR", risk: 81,
    checks: [
      { label: "Target allowlisted", ok: true }, { label: "Selector allowed", ok: false },
      { label: "Value within limit", ok: true }, { label: "Simulation passed", ok: true },
    ],
    live: { to: webContracts.agentRegistry, value: "0", data: "0x095ea7b3" },
  },
  {
    short: "RWA overexposure", intent: "An agent puts 90% of a portfolio in one vault", verdict: "BLOCK", reason: "RWA_OVEREXPOSURE", risk: 69,
    checks: [
      { label: "Target allowlisted", ok: true }, { label: "Selector allowed", ok: true },
      { label: "Exposure within limit", ok: false }, { label: "Simulation passed", ok: true },
    ],
  },
];

const R = 53;
const C = 2 * Math.PI * R;

type LiveResult = { verdict: "ALLOW" | "BLOCK"; reason: string; risk: number; checks: Check[]; evidenceHash?: string };

export function LiveFirewallDemo() {
  const [index, setIndex] = useState(0);
  const [shownRisk, setShownRisk] = useState(SCENARIOS[0].risk);
  const [paused, setPaused] = useState(false);
  const [live, setLive] = useState<LiveResult | null>(null);
  const [loading, setLoading] = useState(false);
  const reduce = useRef(false);

  const scenario = SCENARIOS[index];
  const view = live ?? scenario;
  const targetRisk = view.risk;

  useEffect(() => {
    reduce.current = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (paused || live) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % SCENARIOS.length), 3600);
    return () => clearInterval(id);
  }, [paused, live]);

  useEffect(() => {
    if (reduce.current) { setShownRisk(targetRisk); return; }
    let raf = 0;
    const start = performance.now();
    const from = shownRisk;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 700);
      const eased = 1 - Math.pow(1 - p, 3);
      setShownRisk(Math.round(from + (targetRisk - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, live]);

  function pick(i: number) { setPaused(true); setLive(null); setIndex(i); }

  async function runLive() {
    if (!scenario.live) return;
    setLoading(true); setPaused(true);
    try {
      const res = await fetch("/api/gateway", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "dry-run", agentId: "1", policyId: "1", ...scenario.live, intent: scenario.intent }),
      });
      const json = await res.json();
      const d = json?.gateway?.decision;
      if (!d) throw new Error(json?.error ?? "no decision");
      const c = d.checks ?? {};
      setLive({
        verdict: d.decision === "ALLOW" ? "ALLOW" : "BLOCK",
        reason: d.reasonCode,
        risk: typeof d.riskScore === "number" ? d.riskScore : scenario.risk,
        evidenceHash: json.evidenceHash,
        checks: [
          { label: "Target allowlisted", ok: !!c.targetAllowed },
          { label: "Selector allowed", ok: !!c.selectorAllowed },
          { label: "Value within limit", ok: !!c.valueWithinLimit },
          { label: "Simulation passed", ok: !!(d.simulation?.success ?? true) },
        ],
      });
    } catch {
      /* keep local view */
    } finally {
      setLoading(false);
    }
  }

  const allow = view.verdict === "ALLOW";
  const color = allow ? "var(--malachite)" : "var(--vermillion)";
  const offset = C * (1 - shownRisk / 100);

  return (
    <div className="az-plate" aria-live="polite" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <span className="az-plate-frame" />
      <div className="az-plate-head">
        <span className="az-plate-kicker">Pre-flight verdict</span>
        <span className="az-plate-intent">{live ? "live · Mantle Sepolia" : scenario.intent}</span>
      </div>

      <div className="az-picks">
        {SCENARIOS.map((s, i) => (
          <button key={s.short} type="button" className={`az-pick${i === index ? " active" : ""}`} onClick={() => pick(i)}>
            {s.short}
          </button>
        ))}
      </div>

      <div className="az-plate-body">
        <div className="az-gauge">
          <svg width="122" height="122" viewBox="0 0 122 122" aria-hidden="true">
            <circle className="az-gauge-track" cx="61" cy="61" r={R} />
            <circle className="az-gauge-arc" cx="61" cy="61" r={R} stroke={color} strokeDasharray={C} strokeDashoffset={offset} />
          </svg>
          <div className="az-gauge-center">
            <div className="az-gauge-num" style={{ color }}>{shownRisk}</div>
            <div className="az-gauge-label">Risk</div>
          </div>
        </div>

        <div>
          <span className={`az-verdict ${allow ? "allow" : "block"}`}>{view.verdict}</span>
          <div className="az-reason">{view.reason}</div>
          <div className="az-checks">
            {view.checks.map((check) => (
              <div key={check.label} className={`az-check ${check.ok ? "ok" : "bad"}`}>
                <span className="ic">{check.ok ? <Icon.check s={9} /> : <Icon.x s={9} />}</span>
                <span className="lbl">{check.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="az-plate-foot">
        {scenario.live ? (
          <button type="button" className="az-runbtn" onClick={runLive} disabled={loading}>
            {loading ? <Icon.refresh s={12} /> : <Icon.bolt s={12} />}
            {loading ? "Examining on-chain…" : "Examine live"}
          </button>
        ) : (
          <span className="az-plate-kicker">Advisory RWA guard · off-chain</span>
        )}
        {live?.evidenceHash ? (
          <div className="az-seal">
            <span className="az-seal-badge" title="evidenceHash"><Icon.shield s={14} /></span>
            <span className="az-seal-text"><b>sealed</b><br />{live.evidenceHash.slice(0, 22)}…</span>
          </div>
        ) : (
          <span className="az-dots">
            {SCENARIOS.map((s, i) => (
              <span key={s.short} className={`az-dot${i === index ? " on" : ""}`} />
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
