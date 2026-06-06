"use client";

import { useCallback, useState } from "react";
import type { Hex } from "viem";
import { explorerTxUrl } from "../../lib/contracts";
import { actionableTxError, extractTxError } from "../../lib/tx-error";
import { rememberTx } from "../../lib/pending-tx";
import { useToast } from "../components/Toast";

export type WriteActionState = {
  status: "idle" | "pending" | "success" | "error";
  txHash?: Hex;
  explorerUrl?: string;
  error?: string;
};

const IDLE: WriteActionState = { status: "idle" };

/**
 * Shared plumbing for any on-chain write triggered from the UI.
 * Wraps pending/success/error state, captures the tx hash, builds a Mantlescan
 * link, and runs an optional onSuccess callback (e.g. refresh + auto-fill an id).
 *
 * The runner returns either a tx hash directly (recordAction) or an object that
 * contains a `txHash` plus extra fields (registerAgent -> agentId,
 * createPolicy -> policyId); both shapes are supported.
 */
export function useWriteAction<R extends Hex | { txHash: Hex }>(
  runner: () => Promise<R>,
  onSuccess?: (result: R) => void | Promise<void>,
  options?: { label?: string },
) {
  const [state, setState] = useState<WriteActionState>(IDLE);
  const { push } = useToast();

  const run = useCallback(async () => {
    setState({ status: "pending" });
    try {
      const result = await runner();
      const txHash = (typeof result === "string" ? result : result.txHash) as Hex;
      const explorerUrl = explorerTxUrl(txHash);
      setState({ status: "success", txHash, explorerUrl });
      rememberTx(txHash, options?.label ?? "Transaction");
      push({ variant: "success", title: options?.label ? `${options.label} confirmed` : "Transaction confirmed", href: explorerUrl });
      await onSuccess?.(result);
      return result;
    } catch (error) {
      const actionable = actionableTxError(error, options?.label ?? "Transaction");
      const message = `${actionable.message} ${actionable.suggestedFix}`;
      setState({ status: "error", error: message });
      push({ variant: actionable.toastVariant, title: actionable.title, message: actionable.message, href: actionable.txHash ? explorerTxUrl(actionable.txHash) : undefined });
      return undefined;
    }
  }, [runner, onSuccess, options?.label, push]);

  const reset = useCallback(() => setState(IDLE), []);

  return { state, run, reset, isPending: state.status === "pending" };
}

export function errorMessage(error: unknown): string {
  // Surface the structured revert reason / wallet-rejection text, trimmed of viem noise.
  return extractTxError(error);
}
