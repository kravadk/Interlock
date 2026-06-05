import { Icon } from "../../icons";
import { Reveal } from "./Reveal";

const FEATURES = [
  { icon: <Icon.shield s={18} />, title: "Pre-flight firewall", body: "Policy and simulation are weighed before a transaction is ever signed — not after the funds are gone." },
  { icon: <Icon.bolt s={18} />, title: "On-chain enforcement", body: "Route execution through the guard: a disallowed action reverts on-chain, not merely in advice." },
  { icon: <Icon.scale s={18} />, title: "Dispute & slashing", body: "Two-sided bonds back each record; a challenger may contest within the window, and the winner takes both." },
  { icon: <Icon.check s={18} />, title: "Committee of m-of-n", body: "Attestation can demand a threshold of distinct committee signatures — no single signer rules alone." },
  { icon: <Icon.trending s={18} />, title: "Reputation oracle", body: "Every verdict rolls into a queryable agent score and tier that other contracts can gate upon." },
  { icon: <Icon.eye s={18} />, title: "Evidence, sealed", body: "Each record carries an evidenceHash committing to intent, simulation, and checks — portable, verifiable proof." },
];

export function Features() {
  return (
    <section className="az-section">
      <div className="az-container">
        <div className="az-head">
          <Reveal>
            <span className="az-num">The instruments</span>
            <h2 className="az-h2 az-serif">Advisory, enforced, and accountable</h2>
            <p className="az-lead">
              Not a logging wrapper — a full order of safety: deterministic checks, on-chain enforcement,
              economic disputes, decentralized attestation, and reputation.
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
