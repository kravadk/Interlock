import { Reveal } from "./Reveal";

const STEPS = [
  {
    roman: "I",
    title: "The petition",
    body: "An autonomous agent prepares a transaction — a swap, transfer, or contract call — and presents it to Interlock before anything is signed.",
    note: "intent",
  },
  {
    roman: "II",
    title: "The examination",
    body: "Target and selector allowlists, value and slippage limits, and a live RPC simulation are weighed against the agent's on-chain policy.",
    note: "policy · simulation",
  },
  {
    roman: "III",
    title: "The verdict",
    body: "A deterministic ALLOW or BLOCK with a reason code and advisory risk score — bound to a keccak evidenceHash that commits to the whole decision.",
    note: "reason code · risk",
  },
  {
    roman: "IV",
    title: "The seal",
    body: "The verdict is recorded as an EIP-712 attestation with a dispute window — challengeable, finalizable, and queryable forever as reputation.",
    note: "attestation on-chain",
  },
];

export function HowItWorks() {
  return (
    <section className="az-section" id="examination">
      <div className="az-container">
        <div className="az-head">
          <Reveal>
            <span className="az-num">The rite — I through IV</span>
            <h2 className="az-h2 az-serif">From a petition to a sealed verdict</h2>
            <p className="az-lead">
              Interlock sits between an agent and the chain like a chancellery — it receives the request,
              examines it, rules on it, and seals the record. Every time.
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
