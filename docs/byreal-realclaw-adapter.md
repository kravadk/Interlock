# Byreal / RealClaw Adapter

Interlock does not replace RealClaw, OpenClaw, or Byreal Agent Skills. It adds a safety gateway in front of any skill-proposed Mantle transaction:

```text
Byreal/OpenClaw skill proposes tx
  -> normalizeByrealSkillAction()
  -> runGatewayAction()
  -> ALLOW / BLOCK
  -> optional record / execute / alert
```

## Why It Matters For Mantle

Mantle Turing Test emphasizes agentic execution through RealClaw/Byreal and Mantle DeFi protocols. Interlock turns that execution into a developer-controllable flow:

- target, selector, value, slippage, and simulation are checked before wallet execution;
- blocked actions return a reason code and next step;
- write-capable modes can record pre-flight evidence on Mantle Sepolia;
- no fake Byreal, Merchant Moe, Agni, Fluxion, or RWA addresses are bundled.

## SDK

```ts
import { createByrealGatewayAdapter, InterlockFirewall } from "@interlock/firewall-sdk";

const firewall = new InterlockFirewall({ chain, rpcUrl, privateKey, contracts });
const byreal = createByrealGatewayAdapter(firewall);

const result = await byreal.run(
  {
    source: "realclaw",
    skillId: "openclaw.mantle.proposed-evm-action",
    strategy: "SteadyClaw",
    chainId: 5003,
    agentId: "1",
    policyId: "1",
    to: "0xRealTarget...",
    valueWei: "0",
    data: "0x...",
    expectedSlippageBps: 50,
  },
  { mode: "dry-run" },
);
```

`normalizeByrealSkillAction()` rejects wrong chain IDs, invalid agent/policy IDs, invalid addresses, odd-length calldata, negative values, and slippage above `10000` before any RPC call.

## Example

```bash
pnpm --filter @interlock/example-byreal-realclaw-adapter demo
AGENT_ID=<real_agent_id> POLICY_ID=<real_policy_id> pnpm --filter @interlock/example-byreal-realclaw-adapter demo
```

The example defaults to the real deployed Interlock `AgentRegistry` as a test target. For a real Byreal/OpenClaw integration, pass the actual skill target through `ACTION_TARGET` and full calldata through `ACTION_CALLDATA`.

## Non-Goals

- no fake protocol addresses;
- no RealClaw private API assumptions;
- no production trading claims;
- no wallet custody;
- no automatic policy broadening.

Useful links:

- [RealClaw](https://www-ppe.byreal.io/en/realclaw)
- [OpenClaw](https://openclaw.mantle.xyz/)
- [Mantle docs](https://docs.mantle.xyz/)
