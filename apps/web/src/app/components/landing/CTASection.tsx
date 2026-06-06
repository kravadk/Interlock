import Link from "next/link";
import { Logo } from "../../icons";
import { explorerAddressUrl, webContracts } from "../../../lib/contracts";
import { Reveal } from "./Reveal";

export function CTASection() {
  return (
    <section className="az-container">
      <Reveal>
        <div className="az-manifesto">
          <h2>
            Let agents transact. <em>Never</em> unchecked.
          </h2>
          <div className="az-cta-row">
            <Link href="/app" className="az-btn acid lg">Enter the control plane</Link>
            <a className="az-btn ghost lg" href={explorerAddressUrl(webContracts.actionAttestation)} target="_blank" rel="noreferrer">
              View a record on Mantlescan ↗
            </a>
          </div>
        </div>
      </Reveal>
      <footer className="az-foot">
        <span className="az-brand" style={{ fontSize: 16 }}>
          <Logo /> Interlock
        </span>
        <span>A pre-flight firewall for autonomous agents · Mantle Sepolia · Dev Alpha</span>
        <a className="az-ulink" href="https://sepolia.mantlescan.xyz" target="_blank" rel="noreferrer">Mantlescan ↗</a>
      </footer>
    </section>
  );
}
