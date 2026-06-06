import { Icon } from "../../icons";
import { Reveal } from "./Reveal";

const FEATURES = [
  { icon: <Icon.shield s={18} />, title: "Pre-flight firewall", body: "Policy and simulation are weighed before a transaction is ever signed — not after the funds are gone." },
  { icon: <Icon.bolt s={18} />, title: "On-chain enforcement", body: "Route execution through the guard: a disallowed action reverts on-chain, not merely in advice." },
  { icon: <Icon.scale s={18} />, title: "Dispute & slashing", body: "Two-sided bonds back each record; a challenger can contest within the window, and the winner is paid both bonds." },
  { icon: <Icon.check s={18} />, title: "m-of-n committee", body: "Attestation can require a threshold of distinct committee signatures — no single signer decides alone." },
  { icon: <Icon.trending s={18} />, title: "Reputation oracle", body: "Every decision updates a queryable agent score and tier that other contracts can gate on." },
  { icon: <Icon.eye s={18} />, title: "Evidence hash", body: "Each record carries an evidenceHash committing to intent, simulation, and checks — portable, verifiable proof." },
];

export function Features() {
  return (
    <section className="az-section">
      <div className="az-container">
        <div className="az-head">
          <Reveal>
            <span className="az-num">Capabilities</span>
            <h2 className="az-h2">Advisory, enforced, and accountable</h2>
            <p className="az-lead">
              More than a logging wrapper: deterministic checks, on-chain enforcement, economic
              disputes, m-of-n attestation, and reputation.
            </p>
          </Reveal>
        </div>
        <Reveal>
          <div className="az-instruments">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="az-instrument">
                <span className="az-instrument-ic">{feature.icon}</span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
