"use client";

import { useState } from "react";
import { CopyButton } from "../primitives";
import { Reveal } from "./Reveal";

const SURFACES = [
  {
    id: "sdk", title: "TypeScript SDK", blurb: "Wrap checkAction → record → enforce in one call.", file: "agent.ts",
    code: `import { InterlockFirewall } from "@interlock/firewall-sdk";

const result = await firewall.runGatewayAction(action, {
  mode: "execute-if-allowed", // dry-run · record-only · block-and-alert
});
// → { status, decision, evidenceHash, transactionHash }`,
  },
  {
    id: "rest", title: "REST gateway", blurb: "One POST for any backend agent runtime.", file: "POST /api/gateway",
    code: `curl -X POST https://<host>/api/gateway \\
  -H "content-type: application/json" \\
  -d '{"mode":"dry-run","agentId":"1","policyId":"1",
       "to":"0x...","value":"0","data":"0x2de5aaf7"}'
# → { ok, gateway: { status, decision }, evidenceHash }`,
  },
  {
    id: "mcp", title: "MCP server", blurb: "Agent-native tools for IDE / LLM agents.", file: "interlock_gateway_action",
    code: `interlock_gateway_action({
  agentId: 1, policyId: 1, to: "0x...", data: "0x",
  mode: "block-and-alert",
})
// → guarded decision + developerNextStep`,
  },
  {
    id: "cli", title: "CLI", blurb: "Setup, doctor, policy-as-code, live runs.", file: "$ interlock",
    code: `pnpm cli -- gateway-run --mode dry-run \\
  --agent-id 1 --policy-id 1 --to 0x... --data 0x

pnpm cli -- policy-lint --file policies/agent.json
# lint policy-as-code in CI before it ships`,
  },
];

export function Surfaces() {
  const [active, setActive] = useState(0);
  const current = SURFACES[active];

  return (
    <section className="az-section" id="builders">
      <div className="az-container">
        <div className="az-head">
          <Reveal>
            <span className="az-num">For builders</span>
            <h2 className="az-h2 az-serif">One gateway, in front of any agent</h2>
            <p className="az-lead">
              The same verdict across SDK, REST, MCP, and CLI — so a developer never hand-wires
              checkAction → sendTransaction → recordDecision again.
            </p>
          </Reveal>
        </div>

        <Reveal>
          <div className="az-builders">
            <div className="az-tabs">
              {SURFACES.map((surface, i) => (
                <button key={surface.id} type="button" className={`az-tab${i === active ? " active" : ""}`} onClick={() => setActive(i)}>
                  <span className="az-tab-mark" />
                  <span>
                    <strong>{surface.title}</strong>
                    <span>{surface.blurb}</span>
                  </span>
                </button>
              ))}
            </div>

            <div className="az-codecard">
              <div className="az-codecard-bar">
                <span className="f">{current.file}</span>
                <CopyButton text={current.code} label="Copy" />
              </div>
              <pre className="az-code">{current.code}</pre>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
