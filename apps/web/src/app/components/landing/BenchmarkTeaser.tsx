import Link from "next/link";
import { Reveal } from "./Reveal";

const TRIALS: { label: string; v: string; k: "alw" | "blk" }[] = [
  { label: "Safe approved action", v: "ALLOW", k: "alw" },
  { label: "Unknown target", v: "BLOCK", k: "blk" },
  { label: "Overspend", v: "BLOCK", k: "blk" },
  { label: "High slippage", v: "BLOCK", k: "blk" },
  { label: "Unlimited approve", v: "BLOCK", k: "blk" },
  { label: "Suspicious calldata", v: "BLOCK", k: "blk" },
  { label: "Empty calldata", v: "BLOCK", k: "blk" },
  { label: "RWA overexposure", v: "BLOCK", k: "blk" },
  { label: "Stale policy", v: "BLOCK", k: "blk" },
  { label: "Wrong chain", v: "BLOCK", k: "blk" },
];

export function BenchmarkTeaser() {
  return (
    <section className="az-section ink">
      <div className="az-container">
        <Reveal>
          <div className="az-trials">
            <div>
              <span className="az-num">The trials — X in number</span>
              <h2 className="az-h2" style={{ marginTop: 14 }}>Score an agent against ten real attacks</h2>
              <p className="az-lead" style={{ marginTop: 18 }}>
                A repeatable suite runs safe and adversarial actions through the live firewall and returns a
                Dev-Alpha evidence score with on-chain attestations — published as a shareable Safety Card.
              </p>
              <div className="az-cta-row" style={{ marginTop: 28 }}>
                <Link href="/app" className="az-btn acid">Run the trials</Link>
                <Link href="/agent/1" className="az-btn ghost" style={{ color: "var(--paper)" }}>View a Safety Card ↗</Link>
              </div>
            </div>
            <div className="az-trial-list">
              {TRIALS.map((trial, i) => (
                <div key={trial.label} className="az-trial">
                  <span style={{ color: "var(--tx-paper-2)" }}>
                    {String(i + 1).padStart(2, "0")} · {trial.label}
                  </span>
                  <span className={`v ${trial.k}`}>{trial.v}</span>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
