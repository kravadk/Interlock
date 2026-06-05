"use client";

import { useCallback, useState } from "react";
import type { Address } from "viem";
import { Panel, TxButton, TxResult } from "./primitives";
import { useWriteAction } from "../hooks/useWriteAction";
import { registerAgentFromWallet } from "../../lib/wallet";
import { webContracts } from "../../lib/contracts";

/**
 * In-UI agent registration. Replaces the CLI-only `agent-register` flow.
 * On success, lifts the new agentId up so the rest of the app can use it.
 */
export function RegisterAgentForm({
  account,
  wrongChain,
  onRegistered,
}: {
  account?: Address;
  wrongChain?: boolean;
  onRegistered: (agentId: string) => void;
}) {
  const [metadataURI, setMetadataURI] = useState("ipfs://interlock-demo-agent");

  const runner = useCallback(
    () =>
      registerAgentFromWallet({
        account: account as Address,
        agentRegistry: webContracts.agentRegistry,
        metadataURI: metadataURI.trim() || "ipfs://interlock-agent",
      }),
    [account, metadataURI],
  );

  const { state, run, isPending } = useWriteAction(runner, (result) => {
    if (result.agentId !== undefined) onRegistered(result.agentId.toString());
  });

  const disabledReason = !account
    ? "Connect a wallet to register an agent."
    : wrongChain
      ? "Switch to Mantle Sepolia to register an agent."
      : undefined;

  return (
    <Panel title="Register Agent" subtitle="Create an on-chain agent identity. No CLI required.">
      <div className="form-grid">
        <label className="wide-input">
          Metadata URI
          <input
            value={metadataURI}
            onChange={(event) => setMetadataURI(event.target.value)}
            placeholder="ipfs://… or https://…"
          />
        </label>
      </div>
      <div style={{ padding: "0 16px 16px", display: "grid", gap: 10 }}>
        <TxButton
          label="Register agent"
          pendingLabel="Registering…"
          icon="calendar"
          onClick={run}
          pending={isPending}
          disabled={Boolean(disabledReason)}
        />
        {disabledReason ? <span className="form-hint">{disabledReason}</span> : null}
        <TxResult
          status={state.status}
          explorerUrl={state.explorerUrl}
          txHash={state.txHash}
          error={state.error}
          successLabel="Agent registered"
        />
      </div>
    </Panel>
  );
}
