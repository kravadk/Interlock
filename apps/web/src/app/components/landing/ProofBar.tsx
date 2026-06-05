"use client";

import { useEffect, useRef, useState } from "react";
import { fetchSnapshot } from "../../../lib/snapshot";
import { explorerAddressUrl, webContracts } from "../../../lib/contracts";

function useCountUp(target: number | undefined) {
  const [value, setValue] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    if (target === undefined) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 900);
      setValue(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target]);
  return value;
}

export function ProofBar() {
  const [stats, setStats] = useState<{ agents: number; policies: number; actions: number }>();

  useEffect(() => {
    let active = true;
    fetchSnapshot("", { force: false })
      .then((snap) => {
        if (!active) return;
        setStats({ agents: snap.agents.length, policies: snap.policies.length, actions: snap.actions.length });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const agents = useCountUp(stats?.agents);
  const policies = useCountUp(stats?.policies);
  const actions = useCountUp(stats?.actions);
  const addr = webContracts.actionAttestation;

  return (
    <section className="az-section ink">
      <div className="az-container">
        <div className="az-head">
          <span className="az-num">The ledger</span>
          <h2 className="az-h2">Not a mock. Every figure is read live from Mantle Sepolia.</h2>
        </div>
        <div className="az-ledger">
          <div className="az-ledger-cell">
            <div className="az-ledger-num">{stats ? agents : "—"}</div>
            <div className="az-ledger-label">Agents registered</div>
          </div>
          <div className="az-ledger-cell">
            <div className="az-ledger-num">{stats ? policies : "—"}</div>
            <div className="az-ledger-label">Policies live</div>
          </div>
          <div className="az-ledger-cell">
            <div className="az-ledger-num">{stats ? actions : "—"}</div>
            <div className="az-ledger-label">Actions examined</div>
          </div>
          <div className="az-ledger-cell">
            <div className="az-ledger-num" style={{ fontSize: 20, lineHeight: 1.3 }}>ActionAttestationV3</div>
            <div className="az-ledger-label">
              <a href={explorerAddressUrl(addr)} target="_blank" rel="noreferrer">
                {addr.slice(0, 8)}…{addr.slice(-6)} ↗
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
