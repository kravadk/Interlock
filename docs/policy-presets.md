# Policy Presets

Policy presets are SDK helpers for teams that want useful default guardrails without hand-writing every selector and limit.

They do not add extra on-chain state. A preset is converted into the existing `PolicyRegistry.createPolicy` shape:

```text
agentId
maxNativeValue
maxSlippageBps
allowedTargets
allowedSelectors
```

## Conservative DeFi

Use this for agents that can deposit or swap small amounts through approved contracts.

```ts
import { conservativeDeFiPolicy } from "@interlock/firewall-sdk";
import { parseEther } from "viem";

const preset = conservativeDeFiPolicy({
  targets: [agentRegistryAddress, policyRegistryAddress],
  maxNativeValue: parseEther("0.02"),
  maxSlippageBps: 100,
});

await firewall.createPolicyFromPreset({
  agentId,
  preset,
});
```

Default selectors include ERC-4626-style deposit/mint, wrapped native `deposit()`, and the demo `AgentRegistry` / `PolicyRegistry` actions. ERC-20 `approve` is intentionally excluded.

## Agent Payments

Use this for agentic wallets that can pay only approved recipients or payment contracts.

```ts
import { paymentPolicy } from "@interlock/firewall-sdk";
import { parseEther } from "viem";

const preset = paymentPolicy({
  targets: [knownRecipientOrPaymentContract],
  maxNativeValue: parseEther("0.01"),
});
```

Default selectors include native transfer and ERC-20 `transfer(address,uint256)`.

## RWA Read-Only

Use this for RWA/data agents that should inspect positions but not move funds.

```ts
import { rwaReadOnlyPolicy } from "@interlock/firewall-sdk";

const preset = rwaReadOnlyPolicy({
  targets: [rwaVaultAddress, assetAddress],
});
```

Default max native value is `0`, max slippage is `0`, and selectors are read-focused, such as `balanceOf`, `asset`, `totalAssets`, and ERC-4626 conversion helpers.

## Scoped Approvals

Approvals are intentionally isolated in their own preset because approvals are often the riskiest action an agent can perform.

```ts
import { approvalPolicy } from "@interlock/firewall-sdk";

const preset = approvalPolicy({
  targets: [knownTokenAddress],
});
```

The contract checks selector and target for `ALLOW` attestations. It does not decode spender addresses inside calldata yet, so use this preset only with narrow token target allowlists and low operational exposure.

## Inspect A Preset

```ts
import { describePolicyPreset } from "@interlock/firewall-sdk";

console.log(describePolicyPreset(preset));
```

This returns a JSON-safe summary with selector labels, target list, limits, and notes that can be shown in a dashboard or CLI before creating the policy.
