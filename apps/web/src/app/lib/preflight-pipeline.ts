import type { PreflightDecision } from "../../lib/preflight";
import type { PipelineCheck } from "../components/primitives";
import { parseEther } from "viem";

export function checksToPipeline(decision: PreflightDecision): PipelineCheck[] {
  const c = decision.checks;
  return [
    { name: "Policy active", sub: "Policy exists and is enabled on-chain.", state: c.policyActive ? "pass" : "fail" },
    { name: "Target allowlisted", sub: "Destination contract is on the policy allowlist.", state: c.targetAllowed ? "pass" : "fail" },
    { name: "Selector allowed", sub: "Function selector is permitted by the policy.", state: c.selectorAllowed ? "pass" : "fail" },
    { name: "Value within limit", sub: "Native value is below the policy max spend.", state: c.valueWithinLimit ? "pass" : "fail" },
    { name: "Slippage within limit", sub: "Expected slippage is within the policy bound.", state: c.slippageWithinLimit ? "pass" : "fail" },
    { name: "Simulation success", sub: "Pre-flight RPC simulation did not revert.", state: c.simulationSuccess ? "pass" : "fail" },
  ];
}

export function idlePipeline(): PipelineCheck[] {
  return [
    { name: "Policy active", sub: "Run a preflight to evaluate this check.", state: "idle" },
    { name: "Target allowlisted", sub: "Run a preflight to evaluate this check.", state: "idle" },
    { name: "Selector allowed", sub: "Run a preflight to evaluate this check.", state: "idle" },
    { name: "Value within limit", sub: "Run a preflight to evaluate this check.", state: "idle" },
    { name: "Slippage within limit", sub: "Run a preflight to evaluate this check.", state: "idle" },
    { name: "Simulation success", sub: "Run a preflight to evaluate this check.", state: "idle" },
  ];
}

export function preflightDisabledReason(props: {
  agentId: string;
  policyId: string;
  target: string;
  value: string;
  calldata: string;
  slippageBps: number;
}) {
  if (!props.agentId.match(/^[1-9]\d*$/)) return "Agent id must be a positive real registered id.";
  if (!props.policyId.match(/^[1-9]\d*$/)) return "Policy id must be a positive real registered id.";
  if (!props.target.match(/^0x[0-9a-fA-F]{40}$/)) return "Target must be a valid EVM address.";
  try {
    if (parseEther(props.value || "0") < 0n) return "Value must be a non-negative MNT amount.";
  } catch {
    return "Value must be a valid non-negative MNT amount.";
  }
  if (!props.calldata.match(/^0x([0-9a-fA-F]{2})*$/)) return "Calldata must be 0x or even-byte hex.";
  if (props.slippageBps < 0 || props.slippageBps > 10_000 || !Number.isInteger(props.slippageBps)) {
    return "Slippage must be an integer between 0 and 10000 bps.";
  }
  return "";
}
