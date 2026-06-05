"use client";

import { useState } from "react";
import { parseEther, type Address } from "viem";
import { Panel, TxButton, TxResult } from "./primitives";
import { useToast } from "./Toast";
import {
  bondRecordFromWallet,
  openDisputeFromWallet,
  withdrawDisputeFromWallet,
} from "../../lib/wallet";
import { explorerTxUrl, hasDisputeEscrowConfigured, webContracts } from "../../lib/contracts";

type Status = "idle" | "pending" | "success" | "error";

/**
 * DisputeEscrow controls — bond a record's honesty, open a staked dispute, or withdraw winnings.
 * Two-sided bonds: the winner (decided by the arbiter) takes both bonds. Self-contained; hidden when
 * the escrow isn't configured.
 */
export function DisputePanel({ account, wrongChain }: { account?: Address; wrongChain?: boolean }) {
  const { push } = useToast();
  const [actionCheckId, setActionCheckId] = useState("");
  const [bond, setBond] = useState("0.001");
  const [status, setStatus] = useState<Status>("idle");
  const [txHash, setTxHash] = useState<string>();
  const [error, setError] = useState("");

  if (!hasDisputeEscrowConfigured()) return null;

  const disabledReason = !account
    ? "Connect a wallet to bond or dispute."
    : wrongChain
      ? "Switch to Mantle Sepolia."
      : undefined;

  async function run(kind: "bond" | "dispute" | "withdraw") {
    setError("");
    setTxHash(undefined);
    if (kind !== "withdraw" && !actionCheckId.match(/^[1-9]\d*$/)) {
      setError("Enter a positive actionCheckId.");
      return;
    }
    setStatus("pending");
    try {
      const escrow = webContracts.disputeEscrow;
      const id = actionCheckId ? BigInt(actionCheckId) : 0n;
      const bondWei = parseEther(bond || "0");
      const hash =
        kind === "bond"
          ? await bondRecordFromWallet({ account: account as Address, escrow, actionCheckId: id, bond: bondWei })
          : kind === "dispute"
            ? await openDisputeFromWallet({ account: account as Address, escrow, actionCheckId: id, bond: bondWei })
            : await withdrawDisputeFromWallet({ account: account as Address, escrow });
      setTxHash(hash);
      setStatus("success");
      push({ variant: "success", title: `Dispute ${kind} sent`, href: explorerTxUrl(hash as `0x${string}`) });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message.split("\n")[0] : String(caught);
      setError(message);
      setStatus("error");
      push({ variant: "error", title: `Dispute ${kind} failed`, message });
    }
  }

  const pending = status === "pending";

  return (
    <Panel title="Dispute Escrow" subtitle="Stake on a record's honesty. The arbiter resolves; the winner takes both bonds.">
      <div className="form-grid">
        <label>
          actionCheckId
          <input value={actionCheckId} onChange={(event) => setActionCheckId(event.target.value)} placeholder="e.g. 1" />
        </label>
        <label>
          Bond (MNT)
          <input value={bond} onChange={(event) => setBond(event.target.value)} />
        </label>
      </div>
      <div style={{ padding: "0 16px 16px", display: "grid", gap: 10 }}>
        <div className="preset-row">
          <button type="button" className="mini-btn" onClick={() => run("bond")} disabled={pending || Boolean(disabledReason)}>
            Bond record
          </button>
          <button type="button" className="mini-btn" onClick={() => run("dispute")} disabled={pending || Boolean(disabledReason)}>
            Dispute (stake)
          </button>
        </div>
        <TxButton
          label="Withdraw winnings"
          pendingLabel="Withdrawing…"
          icon="handCoins"
          onClick={() => run("withdraw")}
          pending={pending}
          disabled={Boolean(disabledReason)}
        />
        {disabledReason ? <span className="form-hint">{disabledReason}</span> : null}
        <span className="form-hint">
          Escrow {webContracts.disputeEscrow.slice(0, 6)}…{webContracts.disputeEscrow.slice(-4)} ·
          {" "}arbiter resolves within a 2h window.
        </span>
        <TxResult
          status={status}
          explorerUrl={txHash ? explorerTxUrl(txHash as `0x${string}`) : undefined}
          txHash={txHash}
          error={error}
          successLabel="Dispute action confirmed"
        />
      </div>
    </Panel>
  );
}
