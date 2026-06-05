"use client";

import { useEffect, useState } from "react";
import { createPublicClient } from "viem";
import { mantleSepolia, reputationOracleAbi } from "@interlock/shared";
import { browserRpcTransport } from "../../lib/rpc-transport";
import { hasReputationOracleConfigured, mantleRpcUrl, webContracts } from "../../lib/contracts";

const TIERS = ["Unproven", "Nascent", "Established", "Trusted"];

/**
 * On-chain reputation badge — reads ReputationOracle.getScore(agentId) (score bps + tier). Hidden
 * when the oracle isn't configured or the id is empty/invalid; fully read-only, no wallet needed.
 */
export function AgentReputation({ agentId }: { agentId: string }) {
  const [data, setData] = useState<{ scoreBps: number; tier: number }>();

  useEffect(() => {
    if (!hasReputationOracleConfigured() || !agentId.match(/^[1-9]\d*$/)) {
      setData(undefined);
      return;
    }
    let active = true;
    const client = createPublicClient({ chain: mantleSepolia, transport: browserRpcTransport(mantleRpcUrl()) });
    client
      .readContract({
        address: webContracts.reputationOracle,
        abi: reputationOracleAbi,
        functionName: "getScore",
        args: [BigInt(agentId)],
      })
      .then((res) => {
        if (!active) return;
        const [scoreBps, tier] = res as [bigint, number];
        setData({ scoreBps: Number(scoreBps), tier });
      })
      .catch(() => {
        if (active) setData(undefined);
      });
    return () => {
      active = false;
    };
  }, [agentId]);

  if (!data) return null;

  return (
    <div className="metric-box">
      <span>On-chain reputation</span>
      <strong>
        {(data.scoreBps / 100).toFixed(0)}% · {TIERS[data.tier] ?? "—"}
      </strong>
    </div>
  );
}
