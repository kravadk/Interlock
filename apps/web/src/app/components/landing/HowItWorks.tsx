import { Reveal } from "./Reveal";

const STEPS = [
  {
    roman: "01",
    title: "Propose",
    body: "An agent builds a transaction — a swap, transfer, or contract call — and sends it to Interlock before signing.",
    note: "intent",
  },
  {
    roman: "02",
    title: "Check",
    body: "Target and selector allowlists, value and slippage limits, and a live RPC simulation run against the agent's on-chain policy.",
    note: "policy · simulation",
  },
  {
    roman: "03",
    title: "Decide",
    body: "A deterministic ALLOW or BLOCK with a reason code and advisory risk score, committed to a keccak evidenceHash.",
    note: "reason code · risk",
  },
  {
    roman: "04",
    title: "Record",
    body: "The decision is recorded as an EIP-712 attestation with a dispute window — challengeable, finalizable, and queryable as reputation.",
    note: "attestation on-chain",
  },
];

export function HowItWorks() {
  return (
    <section className="az-section" id="examination">
      <div className="az-container">
        <div className="az-head">
          <Reveal>
            <span className="az-num">How it works</span>
            <h2 className="az-h2">From proposed transaction to on-chain record</h2>
            <p className="az-lead">
              Interlock sits between an agent and the chain: it receives the transaction, checks it,
              decides, and records the decision. Every time.
            </p>
          </Reveal>
        </div>
        <div className="az-rite">
          {STEPS.map((step, i) => (
            <Reveal key={step.roman} delay={i * 0.06}>
              <div className="az-rite-row">
                <div className="az-rite-roman">{step.roman}</div>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                  <span className="az-mono">{step.note}</span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
