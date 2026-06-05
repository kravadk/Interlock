"use client";

import { useEffect, useRef } from "react";
import { createPublicClient, http } from "viem";
import { actionAttestationAbi, mantleSepolia } from "@interlock/shared";
import { mantleRpcUrl, webContracts } from "../../lib/contracts";
import { fetchIndexerHealthSafe } from "../../lib/snapshot";
import { indexerBaseUrl } from "../../lib/indexer";

const POLL_MS = 12_000;

/**
 * Keeps the dashboard fresh without a manual refresh, using BOTH:
 *  - a 12s poll of the cheapest available freshness signal (indexer /health
 *    nextFromBlock, else RPC block number) — catches anything missed; and
 *  - a viem watchContractEvent on ActionChecked — fires an instant refresh on a
 *    new attestation.
 * Polling pauses while the tab is hidden. A debounce prevents poll+event from
 * double-fetching.
 */
export function useLiveRefresh(onTick: () => void, enabled = true) {
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;
  const lastFiredAt = useRef(0);

  function fire() {
    const now = Date.now();
    if (now - lastFiredAt.current < 2_000) return; // debounce
    lastFiredAt.current = now;
    onTickRef.current();
  }

  // --- Poll loop (freshness signal) ---
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    let lastSeen = "";

    const client = indexerBaseUrl()
      ? undefined
      : createPublicClient({ chain: mantleSepolia, transport: http(mantleRpcUrl()) });

    async function probe() {
      if (document.visibilityState === "hidden") return;
      try {
        let marker = "";
        if (indexerBaseUrl()) {
          const health = await fetchIndexerHealthSafe();
          marker = health?.nextFromBlock ?? health?.lastSyncCompletedAt ?? "";
        } else if (client) {
          marker = (await client.getBlockNumber()).toString();
        }
        if (marker && lastSeen && marker !== lastSeen) fire();
        if (marker) lastSeen = marker;
      } catch {
        // ignore transient probe errors
      }
    }

    void probe();
    timer = setInterval(probe, POLL_MS);
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [enabled]);

  // --- Event watch (instant trigger) ---
  useEffect(() => {
    if (!enabled) return;
    const client = createPublicClient({ chain: mantleSepolia, transport: http(mantleRpcUrl()) });
    let unwatch: (() => void) | undefined;
    try {
      unwatch = client.watchContractEvent({
        address: webContracts.actionAttestation,
        abi: actionAttestationAbi,
        eventName: "ActionChecked",
        onLogs: () => fire(),
        onError: () => undefined,
      });
    } catch {
      // event watching unsupported on this transport — poll still covers it
    }
    return () => unwatch?.();
  }, [enabled]);
}
