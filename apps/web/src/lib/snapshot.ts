import { indexerBaseUrl, type IndexerHealth } from "./indexer";
import { fetchRpcHistorySnapshot, type RpcHistorySnapshot } from "./rpc-history";

export type SnapshotSource = "indexer" | "rpc";
export type Snapshot = RpcHistorySnapshot & { source: SnapshotSource };

type CacheEntry = { at: number; value: Snapshot };
const CACHE = new Map<string, CacheEntry>();
const STALE_MS = 8_000;

/**
 * Unified data source for the dashboard.
 *  - If an indexer URL is configured, fetch the one-shot /snapshot (1 request).
 *  - On any indexer failure (or when unconfigured), fall back to the live-RPC
 *    snapshot so the dashboard always works.
 * A short in-module cache avoids a full refetch storm on remounts/tab switches.
 */
export async function fetchSnapshot(agentId?: string, options?: { force?: boolean }): Promise<Snapshot> {
  const key = agentId ?? "";
  const cached = CACHE.get(key);
  if (!options?.force && cached && Date.now() - cached.at < STALE_MS) {
    return cached.value;
  }

  const base = indexerBaseUrl();
  let snapshot: Snapshot | undefined;

  if (base) {
    try {
      const query = agentId ? `?agentId=${encodeURIComponent(agentId)}` : "";
      const response = await fetch(`${base}/snapshot${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Indexer /snapshot failed: ${response.status}`);
      const payload = (await response.json()) as RpcHistorySnapshot;
      snapshot = { ...payload, source: "indexer" };
    } catch {
      // fall through to RPC
    }
  }

  if (!snapshot) {
    const rpc = await fetchRpcHistorySnapshot(agentId);
    snapshot = { ...rpc, source: "rpc" };
  }

  CACHE.set(key, { at: Date.now(), value: snapshot });
  return snapshot;
}

/** Lightweight freshness probe used by the live-refresh hook. */
export async function fetchIndexerHealthSafe(): Promise<IndexerHealth | undefined> {
  const base = indexerBaseUrl();
  if (!base) return undefined;
  try {
    const response = await fetch(`${base}/health`, { cache: "no-store" });
    if (!response.ok) return undefined;
    return (await response.json()) as IndexerHealth;
  } catch {
    return undefined;
  }
}

export function clearSnapshotCache() {
  CACHE.clear();
}
